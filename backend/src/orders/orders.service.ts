import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { leadOrderScope } from '../common/scope.js';
import { buildPageMeta } from '../common/pagination.js';
import { AuditAction, OrderStatus } from '../generated/prisma/enums.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { UpdateOrderDto } from './dto/update-order.dto.js';

export interface OrderFilters {
  websiteId?: string;
  status?: OrderStatus;
  salesRepId?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: JwtPayload, filters: OrderFilters) {
    // Xem ghi chú trong leads.service.ts findAll: scope và filter tuỳ chọn
    // phải ở các object riêng trong AND, không gộp chung (tránh bị ghi đè).
    const andConditions = [
      leadOrderScope(user),
      { deletedAt: null },
      filters.websiteId ? { websiteId: filters.websiteId } : {},
      filters.status ? { status: filters.status } : {},
      filters.salesRepId ? { salesRepId: filters.salesRepId } : {},
    ];
    const where = { AND: andConditions };
    const include = {
      website: { select: { id: true, name: true } },
      salesRep: { select: { id: true, name: true } },
    };

    if (!filters.page) {
      return this.prisma.order.findMany({ where, include, orderBy: { date: 'desc' } });
    }

    // Tổng giá trị (đã lọc) hiển thị trên trang Đơn hàng luôn loại trừ đơn đã
    // huỷ, không phụ thuộc trang hiện tại đang xem - phải tính trên toàn bộ
    // tập đã lọc bằng aggregate riêng, không thể cộng dồn từ dữ liệu 1 trang.
    const [total, totalValueAgg] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where: { AND: [...andConditions, { status: { not: OrderStatus.huy } }] },
        _sum: { value: true },
      }),
    ]);
    const { page, pageSize, totalPages, skip } = buildPageMeta(total, filters.page, filters.pageSize);
    const data = await this.prisma.order.findMany({
      where,
      include,
      orderBy: { date: 'desc' },
      skip,
      take: pageSize,
    });
    return { data, total, page, pageSize, totalPages, totalValue: totalValueAgg._sum.value ?? 0 };
  }

  async create(dto: CreateOrderDto, user: JwtPayload) {
    if (dto.leadId) await this.assertLeadExists(dto.leadId);

    const order = await this.prisma.order.create({
      data: {
        date: new Date(dto.date),
        leadId: dto.leadId,
        websiteId: dto.websiteId,
        value: dto.value,
        product: dto.product,
        salesRepId: dto.salesRepId,
        status: dto.status ?? OrderStatus.cho_xu_ly,
        createdById: user.sub,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: order.id,
        action: AuditAction.create,
        changedById: user.sub,
      },
    });

    return order;
  }

  async update(id: string, dto: UpdateOrderDto, user: JwtPayload) {
    const existing = await this.findOneInScope(id, user);
    if (dto.leadId) await this.assertLeadExists(dto.leadId);

    const changedFields = (Object.keys(dto) as (keyof UpdateOrderDto)[]).filter(
      (key) => dto[key] !== undefined && String(dto[key]) !== String(existing[key as keyof typeof existing]),
    );

    const updated = await this.prisma.order.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });

    if (changedFields.length > 0) {
      await this.prisma.auditLog.createMany({
        data: changedFields.map((field) => ({
          entityType: 'order',
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
    await this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: id,
        action: AuditAction.delete,
        changedById: user.sub,
      },
    });
    return { ok: true };
  }

  /** Import CSV: cột theo template `GET /api/orders/template.csv`. */
  async importRows(
    rows: {
      date: string;
      websiteName: string;
      value: string;
      product: string;
      salesRepName: string;
      status?: string;
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
      const value = Number(row.value);

      if (!website) {
        errors.push(`Dòng ${i + 1}: không tìm thấy website "${row.websiteName}"`);
        continue;
      }
      if (!rep) {
        errors.push(`Dòng ${i + 1}: không tìm thấy Sales "${row.salesRepName}"`);
        continue;
      }
      if (!value || value <= 0) {
        errors.push(`Dòng ${i + 1}: giá trị đơn hàng không hợp lệ`);
        continue;
      }

      await this.create(
        {
          date: row.date,
          websiteId: website.id,
          value,
          product: row.product,
          salesRepId: rep.id,
          status: (row.status as OrderStatus) || OrderStatus.cho_xu_ly,
        },
        user,
      );
      success++;
    }

    return { success, failed: errors.length, errors };
  }

  private async assertLeadExists(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead liên kết không tồn tại');
  }

  private async findOneInScope(id: string, user: JwtPayload) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null, ...leadOrderScope(user) },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }
}
