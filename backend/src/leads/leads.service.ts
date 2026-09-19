import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { leadOrderScope } from '../common/scope.js';
import { buildPageMeta } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, LeadChannel, LeadStatus, Role } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import { UsersService } from '../users/users.service.js';
import { OrdersService } from '../orders/orders.service.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';
import {
  classifySignalStatus,
  generateTempPassword,
  normalizePhone,
  parseSignalDate,
  parseVnCurrency,
  resolveChannel,
  resolveWebsiteDomain,
  slugifyName,
  type SignalRow,
} from './signal-import.util.js';

export type { SignalRow };

export interface NewSalesAccount {
  name: string;
  email: string;
  tempPassword: string;
}

export interface LeadFilters {
  websiteId?: string;
  status?: LeadStatus;
  salesRepId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private ordersService: OrdersService,
  ) {}

  async findAll(user: JwtPayload, filters: LeadFilters) {
    // Quan trọng: scope theo vai trò và các filter tuỳ chọn phải nằm ở
    // các object riêng biệt trong AND - nếu gộp chung một object, key trùng
    // tên (vd salesRepId) mà filter không truyền (undefined) sẽ ghi đè và
    // vô hiệu hoá scope, làm lộ dữ liệu ngoài quyền xem.
    const where: Prisma.LeadWhereInput = {
      AND: [
        leadOrderScope(user),
        { deletedAt: null },
        filters.websiteId ? { websiteId: filters.websiteId } : {},
        filters.status ? { status: filters.status } : {},
        filters.salesRepId ? { salesRepId: filters.salesRepId } : {},
      ],
      OR: filters.search
        ? [
            { customerName: { contains: filters.search, mode: 'insensitive' } },
            { contact: { contains: filters.search } },
          ]
        : undefined,
    };
    const include = {
      website: { select: { id: true, name: true } },
      salesRep: { select: { id: true, name: true } },
    };

    // Không truyền `page` (vd dropdown liên kết ở trang Đơn hàng) -> giữ
    // nguyên hành vi cũ, trả về mảng đầy đủ, không phân trang.
    if (!filters.page) {
      return this.prisma.lead.findMany({ where, include, orderBy: { date: 'desc' } });
    }

    const total = await this.prisma.lead.count({ where });
    const { page, pageSize, totalPages, skip } = buildPageMeta(total, filters.page, filters.pageSize);
    const data = await this.prisma.lead.findMany({
      where,
      include,
      orderBy: { date: 'desc' },
      skip,
      take: pageSize,
    });
    return { data, total, page, pageSize, totalPages };
  }

  async findHistory(id: string, user: JwtPayload) {
    await this.findOneInScope(id, user);
    return this.prisma.auditLog.findMany({
      where: { entityType: 'lead', entityId: id },
      include: { changedBy: { select: { name: true } } },
      orderBy: { changedAt: 'asc' },
    });
  }

  async create(dto: CreateLeadDto, user: JwtPayload) {
    const lead = await this.prisma.lead.create({
      data: {
        date: new Date(dto.date),
        websiteId: dto.websiteId,
        customerName: dto.customerName,
        contact: dto.contact,
        channel: dto.channel,
        interest: dto.interest,
        salesRepId: dto.salesRepId,
        status: dto.status ?? LeadStatus.moi,
        note: dto.note,
        createdById: user.sub,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'lead',
        entityId: lead.id,
        action: AuditAction.create,
        changedById: user.sub,
      },
    });

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, user: JwtPayload) {
    const existing = await this.findOneInScope(id, user);

    const changedFields = (Object.keys(dto) as (keyof UpdateLeadDto)[]).filter(
      (key) => dto[key] !== undefined && String(dto[key]) !== String(existing[key as keyof typeof existing]),
    );

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });

    if (changedFields.length > 0) {
      await this.prisma.auditLog.createMany({
        data: changedFields.map((field) => ({
          entityType: 'lead',
          entityId: id,
          action: AuditAction.update,
          field,
          oldValue: String(existing[field as keyof typeof existing] ?? ''),
          newValue: String(dto[field] ?? ''),
          changedById: user.sub,
        })),
      });
    }

    return updated;
  }

  async remove(id: string, user: JwtPayload) {
    await this.findOneInScope(id, user);
    await this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'lead',
        entityId: id,
        action: AuditAction.delete,
        changedById: user.sub,
      },
    });
    return { ok: true };
  }

  /** Import CSV: cột theo template `GET /api/leads/template.csv`. */
  async importRows(
    rows: {
      date: string;
      websiteName: string;
      customerName: string;
      contact: string;
      channel: string;
      interest: string;
      salesRepName: string;
      status?: string;
      note?: string;
    }[],
    user: JwtPayload,
  ) {
    const websites = await this.prisma.website.findMany();
    const reps = await this.prisma.user.findMany();

    let success = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      const website = websites.find((w) => w.name === row.websiteName);
      const rep = reps.find((r) => r.name === row.salesRepName);
      const channel = Object.values(LeadChannel).find((c) => c === row.channel);

      if (!website) {
        errors.push(`Dòng ${i + 1}: không tìm thấy website "${row.websiteName}"`);
        continue;
      }
      if (!rep) {
        errors.push(`Dòng ${i + 1}: không tìm thấy Sales "${row.salesRepName}"`);
        continue;
      }
      if (!channel || !/^0\d{9,10}$/.test(row.contact)) {
        errors.push(`Dòng ${i + 1}: kênh hoặc SĐT không hợp lệ`);
        continue;
      }

      await this.create(
        {
          date: row.date,
          websiteId: website.id,
          customerName: row.customerName,
          contact: row.contact,
          channel,
          interest: row.interest,
          salesRepId: rep.id,
          status: (row.status as LeadStatus) || LeadStatus.moi,
          note: row.note,
        },
        user,
      );
      success++;
    }

    return { success, failed: errors.length, errors };
  }

  /**
   * Import từ file "TÍN HIỆU ONLINE" - bảng theo dõi tín hiệu dùng chung của
   * đội sales, gộp nhiều website qua cột "Nguồn". Mỗi dòng luôn tạo 1 Lead;
   * nếu "Tình trạng tín hiệu" có "chốt đơn" thì tạo thêm 1 Order liên kết.
   * Sales phụ trách chưa có tài khoản sẽ được tự tạo (role sales, mật khẩu
   * tạm ngẫu nhiên) và trả về trong `newSalesAccounts` để admin gửi lại.
   */
  async importSignalRows(rows: SignalRow[], year: number, user: JwtPayload) {
    const websites = await this.prisma.website.findMany();
    let reps = (await this.prisma.user.findMany()).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
    }));
    const newSalesAccounts: NewSalesAccount[] = [];
    const usedEmails = new Set(reps.map((r) => r.email));

    let success = 0;
    let ordersCreated = 0;
    const errors: string[] = [];

    for (const [i, row] of rows.entries()) {
      const line = i + 2; // +1 header, +1 để đúng số dòng trong file gốc

      const date = parseSignalDate(row.ngay, year);
      if (!date) {
        errors.push(`Dòng ${line}: ngày "${row.ngay ?? ''}" không đúng định dạng DD.MM`);
        continue;
      }

      const domain = resolveWebsiteDomain(row.nguon);
      const website = domain ? websites.find((w) => w.domain === domain) : undefined;
      if (!website) {
        errors.push(`Dòng ${line}: không xác định được website từ Nguồn "${row.nguon ?? ''}"`);
        continue;
      }

      const channel = resolveChannel(row.kenh);
      if (!channel) {
        errors.push(`Dòng ${line}: Kênh "${row.kenh ?? ''}" không hợp lệ`);
        continue;
      }

      const repName = (row.kdPhuTrach ?? '').trim();
      if (!repName) {
        errors.push(`Dòng ${line}: thiếu KD phụ trách`);
        continue;
      }
      let rep = reps.find((r) => r.name.trim().toLowerCase() === repName.toLowerCase());
      if (!rep) {
        let email = `${slugifyName(repName)}@leadstracking.local`;
        if (usedEmails.has(email)) email = `${slugifyName(repName)}.${reps.length}@leadstracking.local`;
        usedEmails.add(email);
        const tempPassword = generateTempPassword();
        const created = await this.usersService.invite({
          name: repName,
          email,
          role: Role.sales,
          password: tempPassword,
        });
        rep = { id: created.id, name: created.name, email: created.email };
        reps = [...reps, rep];
        newSalesAccounts.push({ name: repName, email, tempPassword });
      }

      const customerName = (row.tenKhachHang ?? '').trim() || (row.tenCongTy ?? '').trim() || '-';
      const contact = normalizePhone(row.dienThoai);
      const interest = [row.sanPham?.trim(), row.soLuong?.trim() ? `SL: ${row.soLuong.trim()}` : '']
        .filter(Boolean)
        .join(' - ') || '-';
      const note = [
        row.tenCongTy?.trim() ? `Công ty: ${row.tenCongTy.trim()}` : '',
        row.phanLoaiKh?.trim() ? `Phân loại KH: ${row.phanLoaiKh.trim()}` : '',
        row.xuLy?.trim() ? `Xử lý: ${row.xuLy.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const outcome = classifySignalStatus(row.tinhTrangTinHieu);
      const status =
        outcome === 'won' ? LeadStatus.da_chuyen_don : outcome === 'rejected' ? LeadStatus.huy : LeadStatus.dang_cham_soc;

      const lead = await this.create(
        {
          date,
          websiteId: website.id,
          customerName,
          contact,
          channel,
          interest,
          salesRepId: rep.id,
          status,
          note: note || undefined,
        },
        user,
      );
      success++;

      if (outcome === 'won') {
        const value = parseVnCurrency(row.doanhSoChotDon);
        if (value > 0) {
          await this.ordersService.create(
            {
              date,
              leadId: lead.id,
              websiteId: website.id,
              value,
              product: row.sanPham?.trim() || '-',
              salesRepId: rep.id,
            },
            user,
          );
          ordersCreated++;
        } else {
          errors.push(`Dòng ${line}: đã chốt đơn nhưng "Doanh số chốt đơn" không hợp lệ, chưa tạo đơn hàng`);
        }
      }
    }

    return { success, ordersCreated, failed: errors.length, errors, newSalesAccounts };
  }

  private async findOneInScope(id: string, user: JwtPayload) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null, ...leadOrderScope(user) },
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    return lead;
  }
}
