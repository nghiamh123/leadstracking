import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { leadOrderScope } from '../common/scope.js';
import { AuditAction, LeadChannel, LeadStatus } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';

export interface LeadFilters {
  websiteId?: string;
  status?: LeadStatus;
  salesRepId?: string;
  search?: string;
}

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  findAll(user: JwtPayload, filters: LeadFilters) {
    // Quan trọng: scope theo vai trò và các filter tuỳ chọn phải nằm ở
    // các object riêng biệt trong AND - nếu gộp chung một object, key trùng
    // tên (vd salesRepId) mà filter không truyền (undefined) sẽ ghi đè và
    // vô hiệu hoá scope, làm lộ dữ liệu ngoài quyền xem.
    return this.prisma.lead.findMany({
      where: {
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
      },
      include: {
        website: { select: { id: true, name: true } },
        salesRep: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
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

  private async findOneInScope(id: string, user: JwtPayload) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null, ...leadOrderScope(user) },
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    return lead;
  }
}
