import { describe, expect, it } from 'vitest';
import { auditChanges, auditValue } from './audit-diff.js';

// Cột @db.Date Prisma trả về Date lúc 00:00 UTC.
const existing = {
  date: new Date('2026-08-14T00:00:00.000Z'),
  product: 'Ly sứ',
  value: 6050000,
  note: null,
  leadId: 'lead_1',
};

describe('auditChanges', () => {
  it('không ghi ngày khi ngày gửi lên trùng ngày đang lưu', () => {
    expect(auditChanges({ date: '2026-08-14' }, existing)).toEqual([]);
  });

  it('coi chuỗi ngày giờ ISO cùng ngày là không đổi', () => {
    expect(auditChanges({ date: '2026-08-14T00:00:00.000Z' }, existing)).toEqual([]);
  });

  it('ghi ngày dạng YYYY-MM-DD khi ngày thật sự đổi', () => {
    expect(auditChanges({ date: '2026-08-15' }, existing)).toEqual([
      { field: 'date', oldValue: '2026-08-14', newValue: '2026-08-15' },
    ]);
  });

  it('coi null trong DB và chuỗi rỗng từ form là như nhau', () => {
    expect(auditChanges({ note: '' }, existing)).toEqual([]);
  });

  it('chỉ trả các trường thật sự đổi, bỏ qua trường không gửi', () => {
    const dto = {
      date: '2026-08-14',
      product: 'Ly sứ test',
      value: 6050000,
      note: undefined,
      leadId: 'lead_1',
    };
    expect(auditChanges(dto, existing)).toEqual([
      { field: 'product', oldValue: 'Ly sứ', newValue: 'Ly sứ test' },
    ]);
  });

  it('ghi số đã đổi dưới dạng chuỗi', () => {
    expect(auditChanges({ value: 7000000 }, existing)).toEqual([
      { field: 'value', oldValue: '6050000', newValue: '7000000' },
    ]);
  });
});

describe('auditValue', () => {
  it('đổi Date về YYYY-MM-DD và null/undefined về chuỗi rỗng', () => {
    expect(auditValue(new Date('2026-09-16T00:00:00.000Z'))).toBe('2026-09-16');
    expect(auditValue(null)).toBe('');
    expect(auditValue(undefined)).toBe('');
    expect(auditValue('abc')).toBe('abc');
  });
});
