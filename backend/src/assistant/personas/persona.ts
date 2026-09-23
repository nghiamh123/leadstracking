import { z } from 'zod';
import type { Role } from '../../generated/prisma/enums.js';

/**
 * Một tool mà persona cho phép model gọi. `run` đã được bind sẵn với user hiện tại
 * (scope dữ liệu theo role nằm trong closure), nên model không thể xin dữ liệu ngoài quyền.
 */
export interface AssistantTool {
  name: string;
  description: string;
  /** Nhãn hiện cho người dùng trong lúc tool chạy, vd "Đang xem dữ liệu từ khoá…". */
  statusLabel: string;
  inputSchema: z.ZodType;
  run: (input: unknown) => Promise<unknown>;
}

export function defineTool<S extends z.ZodType>(tool: {
  name: string;
  description: string;
  statusLabel: string;
  inputSchema: S;
  run: (input: z.infer<S>) => Promise<unknown>;
}): AssistantTool {
  return tool as AssistantTool;
}

export type PersonaKey = 'seo';

export interface Persona {
  key: PersonaKey;
  system: string;
  tools: AssistantTool[];
}

/**
 * Persona theo role. `null` = role này chưa có trợ lý (sales chờ persona riêng - không cho
 * dùng tạm bot SEO vì sales hiện không có quyền xem dữ liệu từ khoá).
 */
export const PERSONA_BY_ROLE: Record<Role, PersonaKey | null> = {
  admin: 'seo',
  manager: 'seo',
  seo: 'seo',
  sales: null,
};
