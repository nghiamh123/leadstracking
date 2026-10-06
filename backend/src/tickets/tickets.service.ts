import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildPageMeta } from '../common/pagination.js';
import {
  Role,
  TicketStatus,
  UserStatus,
  type TicketCategory,
  type TicketPriority,
} from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { UpdateTicketDto } from './dto/update-ticket.dto.js';

export interface TicketFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  department?: Role;
  assigneeId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

const USER_SELECT = { id: true, name: true, role: true } as const;
const LIST_INCLUDE = {
  website: { select: { id: true, name: true } },
  createdBy: { select: USER_SELECT },
  assignee: { select: USER_SELECT },
  _count: { select: { comments: true, images: true } },
} as const;
// Không bao giờ select cột `data` ở danh sách/chi tiết - ảnh chỉ tải qua endpoint riêng.
const IMAGE_META_SELECT = { id: true, filename: true, mimeType: true, size: true, createdAt: true } as const;

export const MAX_IMAGES_PER_TICKET = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Ảnh được giữ đến N ngày sau khi ticket hoàn thành (resolvedAt), rồi cron xoá. */
export const IMAGE_RETENTION_DAYS = 3;

/** Nhận diện định dạng theo magic bytes - không tin mimetype/đuôi file do client gửi. SVG bị loại có chủ đích (XSS). */
export function detectImageType(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Người tạo (không phải admin) chỉ được đóng ticket của mình hoặc mở lại khi chưa hài lòng. */
const REQUESTER_STATUSES: TicketStatus[] = [TicketStatus.open, TicketStatus.closed];

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(user: JwtPayload, filters: TicketFilters) {
    const search = filters.search?.trim();
    const searchNumber = search && /^#?\d+$/.test(search) ? Number(search.replace('#', '')) : undefined;
    // Phạm vi (admin thấy tất cả, còn lại chỉ ticket của mình) và bộ lọc tuỳ chọn để ở các object
    // riêng trong AND - cùng lý do với leads.service.ts findAll: không để filter ghi đè scope.
    const scope = this.scope(user);
    const filterConditions = [
      filters.priority ? { priority: filters.priority } : {},
      filters.category ? { category: filters.category } : {},
      filters.department ? { department: filters.department } : {},
      filters.assigneeId ? { assigneeId: filters.assigneeId } : {},
      search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              ...(searchNumber !== undefined ? [{ number: searchNumber }] : []),
            ],
          }
        : {},
    ];
    const where = { AND: [scope, ...filterConditions, filters.status ? { status: filters.status } : {}] };

    // Đếm theo trạng thái trên tập đã lọc (trừ chính bộ lọc trạng thái) để các tab hiện đúng số.
    const [total, grouped] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.groupBy({
        by: ['status'],
        where: { AND: [scope, ...filterConditions] },
        _count: { _all: true },
      }),
    ]);
    const statusCounts = Object.fromEntries(
      Object.values(TicketStatus).map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]),
    );

    const { page, pageSize, totalPages, skip } = buildPageMeta(total, filters.page, filters.pageSize);
    const data = await this.prisma.ticket.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });
    return { data, total, page, pageSize, totalPages, statusCounts };
  }

  async findOne(user: JwtPayload, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id }, this.scope(user)] },
      include: {
        ...LIST_INCLUDE,
        comments: { orderBy: { createdAt: 'asc' }, include: { user: { select: USER_SELECT } } },
        images: { orderBy: { createdAt: 'asc' }, select: IMAGE_META_SELECT },
      },
    });
    if (!ticket) throw new NotFoundException('Không tìm thấy ticket');
    return ticket;
  }

  async create(user: JwtPayload, dto: CreateTicketDto) {
    if (dto.websiteId) await this.assertWebsiteExists(dto.websiteId);
    return this.prisma.ticket.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        priority: dto.priority,
        websiteId: dto.websiteId || undefined,
        pageUrl: dto.pageUrl?.trim() || undefined,
        department: user.role,
        createdById: user.sub,
      },
      include: LIST_INCLUDE,
    });
  }

  async update(user: JwtPayload, id: string, dto: UpdateTicketDto) {
    const existing = await this.findOne(user, id);
    const isAdmin = user.role === Role.admin;

    if (!isAdmin) {
      // Người tạo: sửa nội dung khi dev chưa nhận (open), hoặc đổi trạng thái open/closed.
      const { status, ...content } = dto;
      if (dto.assigneeId !== undefined) throw new ForbiddenException('Chỉ admin được gán người xử lý');
      const editsContent = Object.values(content).some((v) => v !== undefined);
      if (editsContent && existing.status !== TicketStatus.open) {
        throw new ForbiddenException('Ticket đã được tiếp nhận, không sửa nội dung được nữa - hãy bình luận thêm');
      }
      if (status && !REQUESTER_STATUSES.includes(status)) {
        throw new ForbiddenException('Bạn chỉ có thể đóng ticket hoặc mở lại ticket của mình');
      }
      // Mở lại chỉ khi dev đã báo xong/đã đóng; không được kéo ticket dev đang xử lý về "Mới".
      const reopening = status === TicketStatus.open && existing.status !== TicketStatus.open;
      if (reopening && existing.status !== TicketStatus.resolved && existing.status !== TicketStatus.closed) {
        throw new ForbiddenException('Ticket đang được dev xử lý, hãy bình luận thêm thay vì mở lại');
      }
    }

    if (dto.websiteId) await this.assertWebsiteExists(dto.websiteId);
    const assigneeId = await this.resolveAssignee(dto.assigneeId);

    return this.prisma.ticket.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        category: dto.category,
        priority: dto.priority,
        websiteId: dto.websiteId,
        pageUrl: dto.pageUrl?.trim(),
        status: dto.status,
        assigneeId,
        resolvedAt: this.nextResolvedAt(existing.resolvedAt, dto.status),
      },
      include: LIST_INCLUDE,
    });
  }

  /**
   * Mốc "hoàn thành" (resolvedAt) để tính hạn xoá ảnh: đặt khi chuyển sang Đã xử lý/Đã đóng và giữ nguyên
   * khi từ Đã xử lý sang Đã đóng (không kéo dài hạn); mở lại thì xoá mốc. undefined = không đổi.
   */
  private nextResolvedAt(current: Date | null, status: TicketStatus | undefined): Date | null | undefined {
    if (status === TicketStatus.resolved || status === TicketStatus.closed) return current ?? new Date();
    if (status === TicketStatus.open || status === TicketStatus.in_progress) return null;
    return undefined;
  }

  async addImage(user: JwtPayload, id: string, file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Chưa chọn ảnh');
    const ticket = await this.findOne(user, id);
    if (ticket.status === TicketStatus.resolved || ticket.status === TicketStatus.closed) {
      throw new BadRequestException('Ticket đã hoàn thành, không thêm ảnh được nữa - hãy mở lại ticket nếu cần');
    }
    if (ticket.images.length >= MAX_IMAGES_PER_TICKET) {
      throw new BadRequestException(`Mỗi ticket tối đa ${MAX_IMAGES_PER_TICKET} ảnh`);
    }
    const mimeType = detectImageType(file.buffer);
    if (!mimeType) throw new BadRequestException('Chỉ nhận ảnh PNG, JPEG, GIF hoặc WebP');

    return this.prisma.ticketImage.create({
      data: {
        ticketId: id,
        uploadedById: user.sub,
        // Tên file do client gửi: chỉ dùng để hiển thị, cắt độ dài.
        filename: (file.originalname || 'image').slice(0, 200),
        mimeType,
        size: file.buffer.length,
        data: new Uint8Array(file.buffer),
      },
      select: IMAGE_META_SELECT,
    });
  }

  async getImage(user: JwtPayload, id: string, imageId: string) {
    await this.findOne(user, id);
    const image = await this.prisma.ticketImage.findFirst({ where: { id: imageId, ticketId: id } });
    if (!image) throw new NotFoundException('Không tìm thấy ảnh (có thể đã tự xoá sau khi ticket hoàn thành)');
    return image;
  }

  async removeImage(user: JwtPayload, id: string, imageId: string) {
    await this.findOne(user, id);
    const { count } = await this.prisma.ticketImage.deleteMany({ where: { id: imageId, ticketId: id } });
    if (count === 0) throw new NotFoundException('Không tìm thấy ảnh');
    return { ok: true };
  }

  /** Xoá ảnh của ticket đã hoàn thành quá IMAGE_RETENTION_DAYS ngày; ticket và bình luận vẫn giữ. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'Asia/Ho_Chi_Minh' })
  async purgeExpiredImages() {
    const cutoff = new Date(Date.now() - IMAGE_RETENTION_DAYS * 86_400_000);
    const expired = await this.prisma.ticket.findMany({
      where: { resolvedAt: { lt: cutoff }, images: { some: {} } },
      select: { id: true },
    });
    if (expired.length === 0) return { tickets: 0, images: 0 };

    const ticketIds = expired.map((t) => t.id);
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.ticketImage.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      this.prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data: { imagesPurgedAt: new Date() } }),
    ]);
    this.logger.log(`Đã xoá ${count} ảnh của ${ticketIds.length} ticket hoàn thành quá ${IMAGE_RETENTION_DAYS} ngày`);
    return { tickets: ticketIds.length, images: count };
  }

  async addComment(user: JwtPayload, id: string, body: string) {
    await this.findOne(user, id);
    const [comment] = await this.prisma.$transaction([
      this.prisma.ticketComment.create({
        data: { ticketId: id, userId: user.sub, body: body.trim() },
        include: { user: { select: USER_SELECT } },
      }),
      // Đẩy ticket lên đầu danh sách theo "hoạt động gần nhất".
      this.prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    return comment;
  }

  async remove(id: string) {
    const existing = await this.prisma.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Không tìm thấy ticket');
    await this.prisma.ticket.delete({ where: { id } });
    return { ok: true };
  }

  private scope(user: JwtPayload): Record<string, unknown> {
    return user.role === Role.admin ? {} : { createdById: user.sub };
  }

  /** undefined = không đổi; "" = bỏ gán; còn lại phải là admin đang hoạt động (người xử lý = dev). */
  private async resolveAssignee(assigneeId: string | undefined): Promise<string | null | undefined> {
    if (assigneeId === undefined) return undefined;
    if (assigneeId === '') return null;
    const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || assignee.role !== Role.admin || assignee.status !== UserStatus.active) {
      throw new BadRequestException('Người xử lý phải là admin đang hoạt động');
    }
    return assignee.id;
  }

  private async assertWebsiteExists(websiteId: string) {
    const website = await this.prisma.website.findUnique({ where: { id: websiteId }, select: { id: true } });
    if (!website) throw new NotFoundException('Website không tồn tại');
  }
}
