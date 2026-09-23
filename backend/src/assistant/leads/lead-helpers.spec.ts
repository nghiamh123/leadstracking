import { describe, expect, it } from 'vitest';
import { daysSince, maskContactInfo, summarizeFunnel } from './lead-helpers.js';
import { importedDatesWarning } from './lead-insights.service.js';

describe('maskContactInfo', () => {
  it('che số điện thoại VN và email trong ghi chú', () => {
    expect(maskContactInfo('Gọi 0909 123 456 hoặc +84 912345678, mail a.b@cty.vn')).toBe(
      'Gọi [SĐT] hoặc [SĐT], mail [email]',
    );
  });

  it('giữ nguyên số lượng / giá (không phải SĐT)', () => {
    expect(maskContactInfo('Ly thủy tinh - SL: 200.000, giá 45.000đ')).toBe('Ly thủy tinh - SL: 200.000, giá 45.000đ');
  });

  it('null/rỗng trả null', () => {
    expect(maskContactInfo(null)).toBeNull();
    expect(maskContactInfo('')).toBeNull();
  });
});

describe('daysSince', () => {
  it('không âm', () => {
    const now = new Date('2026-09-23T00:00:00Z');
    expect(daysSince(new Date('2026-09-20T00:00:00Z'), now)).toBe(3);
    expect(daysSince(new Date('2026-09-30T00:00:00Z'), now)).toBe(0);
  });
});

describe('summarizeFunnel', () => {
  it('đếm theo trạng thái, bỏ đơn huỷ khỏi doanh thu, tính tỉ lệ', () => {
    const res = summarizeFunnel(
      [
        { key: 'zalo', label: 'Zalo', status: 'dang_cham_soc' },
        { key: 'zalo', label: 'Zalo', status: 'da_chuyen_don' },
        { key: 'zalo', label: 'Zalo', status: 'huy' },
        { key: 'zalo', label: 'Zalo', status: 'moi' },
        { key: 'form_web', label: 'Form web', status: 'huy' },
      ],
      [
        { key: 'zalo', label: 'Zalo', value: 10_000_000, status: 'da_giao' },
        { key: 'zalo', label: 'Zalo', value: 5_000_000, status: 'huy' },
        { key: 'none', label: 'Đơn không gắn lead', value: 2_000_000, status: 'cho_xu_ly' },
      ],
    );
    expect(res.groups[0]).toEqual({
      group: 'Zalo',
      leads: 4,
      open: 2,
      converted: 1,
      cancelled: 1,
      orders: 1,
      revenue: 10_000_000,
      convertedPercent: 25,
      cancelledPercent: 25,
    });
    expect(res.total).toMatchObject({ leads: 5, orders: 2, revenue: 12_000_000, convertedPercent: 20 });
    expect(res.groups.map((g) => g.group)).toEqual(['Zalo', 'Form web', 'Đơn không gắn lead']);
  });
});

describe('importedDatesWarning', () => {
  it('cảnh báo khi mọi lead cùng một ngày cập nhật', () => {
    const same = Array.from({ length: 12 }, () => new Date('2026-09-17T08:00:00Z'));
    expect(importedDatesWarning(same)).toContain('2026-09-17');
  });

  it('không cảnh báo khi ngày cập nhật khác nhau hoặc quá ít lead', () => {
    const mixed = Array.from({ length: 12 }, (_, i) => new Date(`2026-09-${10 + i}T08:00:00Z`));
    expect(importedDatesWarning(mixed)).toBeNull();
    expect(importedDatesWarning([new Date()])).toBeNull();
  });
});
