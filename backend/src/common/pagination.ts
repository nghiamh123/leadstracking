export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Tính page/pageSize/skip hợp lệ dựa trên tổng số dòng - dùng cùng 1 lượt count() trước khi findMany(). */
export function buildPageMeta(total: number, rawPage: number | undefined, rawPageSize: number | undefined) {
  const pageSize = rawPageSize && rawPageSize > 0 ? rawPageSize : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = rawPage && rawPage > 0 ? Math.min(rawPage, totalPages) : 1;
  return { page, pageSize, totalPages, skip: (page - 1) * pageSize };
}
