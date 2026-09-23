import { z } from 'zod';
import { MAX_LIMIT } from '../seo/seo-insights.service.js';

/** Dùng chung cho tool của mọi persona. */

const MAX_RANGE_DAYS = 366;

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Ngày không hợp lệ');

export const rangeShape = { start: dateStr, end: dateStr };

/** Dùng superRefine trên chính z.object (không .and) để JSON Schema gửi lên API vẫn là `type: object`. */
export function checkRange(r: { start: string; end: string }, ctx: z.RefinementCtx) {
  if (r.start > r.end) ctx.addIssue({ code: 'custom', message: 'start phải <= end' });
  if ((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86_400_000 >= MAX_RANGE_DAYS) {
    ctx.addIssue({ code: 'custom', message: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày` });
  }
}

export const limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe(`Số dòng tối đa (mặc định 20, tối đa ${MAX_LIMIT}).`);

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
