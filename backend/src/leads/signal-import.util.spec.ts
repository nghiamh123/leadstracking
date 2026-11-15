import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifySignalStatus,
  fetchSignalCsvText,
  generateTempPassword,
  mapSignalRecords,
  normalizePhone,
  parseSignalDate,
  parseVnCurrency,
  resolveChannel,
  resolveWebsiteDomain,
  slugifyName,
} from './signal-import.util.js';

describe('signal-import.util', () => {
  it('resolveWebsiteDomain: map cột "Nguồn" sang domain, không phân biệt hoa thường/khoảng trắng', () => {
    expect(resolveWebsiteDomain(' SXGS ')).toBe('sanxuatgomsu.vn');
    expect(resolveWebsiteDomain('Quà tặng')).toBe('quatangsg.vn');
    expect(resolveWebsiteDomain('khác')).toBeUndefined();
    expect(resolveWebsiteDomain(undefined)).toBeUndefined();
  });

  it('resolveChannel: map cột "Kênh" sang LeadChannel', () => {
    expect(resolveChannel('Zalo')).toBe('zalo');
    expect(resolveChannel('Website')).toBe('form_web');
    expect(resolveChannel('Gọi hotline')).toBe('hotline');
    expect(resolveChannel('email')).toBeUndefined();
  });

  it.each([
    ['5.3', '2026-03-05'],
    ['15/11', '2026-11-15'],
    ['1-1', '2026-01-01'],
    ['32.1', undefined],
    ['1.13', undefined],
    ['0.5', undefined],
    ['15/11/2026', undefined],
    ['', undefined],
    [undefined, undefined],
  ])('parseSignalDate(%s) = %s', (raw, expected) => {
    expect(parseSignalDate(raw, 2026)).toBe(expected);
  });

  it.each([
    ['0927 124 862', '0927124862'],
    ['84336341497', '0336341497'],
    ['+84 912.345.678', '0912345678'],
    ['912345678', ''],
    ['84123', ''],
    ['', ''],
    [undefined, ''],
  ])('normalizePhone(%s) = %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it('parseVnCurrency: bỏ dấu chấm phân cách nghìn', () => {
    expect(parseVnCurrency('4.402.778')).toBe(4402778);
    expect(parseVnCurrency('')).toBe(0);
    expect(parseVnCurrency(undefined)).toBe(0);
  });

  it('classifySignalStatus', () => {
    expect(classifySignalStatus('Đã CHỐT ĐƠN')).toBe('won');
    expect(classifySignalStatus('Khách từ chối')).toBe('rejected');
    expect(classifySignalStatus('Đang báo giá')).toBe('in_progress');
    expect(classifySignalStatus(undefined)).toBe('in_progress');
  });

  it('slugifyName: bỏ dấu tiếng Việt và ký tự đặc biệt', () => {
    expect(slugifyName('Đặng Thị Ánh')).toBe('dangthianh');
    expect(slugifyName('Nguyễn Văn A-1')).toBe('nguyenvana1');
  });

  it('generateTempPassword: chuỗi base64url 8 ký tự, mỗi lần khác nhau', () => {
    const a = generateTempPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(generateTempPassword()).not.toBe(a);
  });

  it('mapSignalRecords: bỏ dòng trống và dòng header lặp lại', () => {
    const rows = mapSignalRecords([
      { Ngày: 'Ngày', Nguồn: 'Nguồn' },
      { Ngày: '  ', Nguồn: 'sxgs' },
      {
        Ngày: '5.3',
        Nguồn: 'sxgs',
        'Tên Khách hàng': 'Chị Mai',
        'Điện thoại': '0912',
        'KD Phụ trách': 'Oanh',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ngay: '5.3',
      nguon: 'sxgs',
      tenKhachHang: 'Chị Mai',
      dienThoai: '0912',
      kdPhuTrach: 'Oanh',
    });
  });

  describe('fetchSignalCsvText', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('trả nội dung CSV khi tải thành công', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({
            ok: true,
            text: () => Promise.resolve('a,b\n1,2'),
          }),
      );
      await expect(fetchSignalCsvText('https://sheet/csv')).resolves.toBe(
        'a,b\n1,2',
      );
    });

    it('báo lỗi rõ ràng kèm mã HTTP khi link hỏng', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404 }),
      );
      await expect(fetchSignalCsvText('https://sheet/csv')).rejects.toThrow(
        'HTTP 404',
      );
    });
  });
});
