import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { decryptSecret, encryptSecret, parseSecretKey } from '../common/secret-box.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import type { CreateHostingDto } from './dto/create-hosting.dto.js';
import type { UpdateHostingDto } from './dto/update-hosting.dto.js';

type HostingRow = {
  id: string;
  websiteId: string;
  label: string;
  loginUrl: string;
  username: string | null;
  passwordEncrypted: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  website?: { id: string; name: string; domain: string };
};

@Injectable()
export class HostingsService {
  private readonly logger = new Logger(HostingsService.name);
  private readonly key: Buffer | null;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.key = parseSecretKey(config.get<string>('HOSTING_SECRET_KEY'));
    if (!this.key) {
      this.logger.warn('Chưa cấu hình HOSTING_SECRET_KEY (32 byte) - không lưu/xem được mật khẩu hosting.');
    }
  }

  async findAll() {
    const rows = await this.prisma.hostingAccount.findMany({
      include: { website: { select: { id: true, name: true, domain: true } } },
      orderBy: [{ website: { name: 'asc' } }, { createdAt: 'asc' }],
    });
    return rows.map(toPublic);
  }

  async create(dto: CreateHostingDto) {
    await this.assertWebsite(dto.websiteId);
    const row = await this.prisma.hostingAccount.create({
      data: {
        websiteId: dto.websiteId,
        label: dto.label?.trim() || undefined,
        loginUrl: dto.loginUrl.trim(),
        username: dto.username?.trim() || null,
        passwordEncrypted: dto.password ? this.encrypt(dto.password) : null,
        note: dto.note?.trim() || null,
      },
      include: { website: { select: { id: true, name: true, domain: true } } },
    });
    return toPublic(row);
  }

  async update(id: string, dto: UpdateHostingDto) {
    await this.assertExists(id);
    if (dto.websiteId) await this.assertWebsite(dto.websiteId);

    // password: undefined = giữ nguyên, "" = xoá, còn lại = thay mới.
    const passwordEncrypted =
      dto.password === undefined ? undefined : dto.password ? this.encrypt(dto.password) : null;

    const row = await this.prisma.hostingAccount.update({
      where: { id },
      data: {
        websiteId: dto.websiteId,
        label: dto.label?.trim() || undefined,
        loginUrl: dto.loginUrl?.trim(),
        username: dto.username !== undefined ? dto.username.trim() || null : undefined,
        passwordEncrypted,
        note: dto.note !== undefined ? dto.note.trim() || null : undefined,
      },
      include: { website: { select: { id: true, name: true, domain: true } } },
    });
    return toPublic(row);
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.prisma.hostingAccount.delete({ where: { id } });
    return { ok: true as const };
  }

  /** Giải mã mật khẩu theo yêu cầu - danh sách không bao giờ trả mật khẩu, mỗi lần xem đều ghi log. */
  async revealPassword(id: string, user: JwtPayload) {
    const row = await this.assertExists(id);
    if (!row.passwordEncrypted) return { password: '' };
    this.logger.log(`${user.email} xem mật khẩu hosting ${row.id} (${row.loginUrl})`);
    return { password: decryptSecret(row.passwordEncrypted, this.requireKey()) };
  }

  private encrypt(plain: string) {
    return encryptSecret(plain, this.requireKey());
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Máy chủ chưa cấu hình HOSTING_SECRET_KEY nên chưa lưu/xem được mật khẩu hosting.',
      );
    }
    return this.key;
  }

  private async assertWebsite(websiteId: string) {
    const website = await this.prisma.website.findUnique({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Không tìm thấy website');
  }

  private async assertExists(id: string) {
    const row = await this.prisma.hostingAccount.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Không tìm thấy tài khoản hosting');
    return row;
  }
}

function toPublic({ passwordEncrypted, ...rest }: HostingRow) {
  return { ...rest, hasPassword: !!passwordEncrypted };
}
