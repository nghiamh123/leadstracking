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

export const PERSONA_KEYS = ['ops', 'seo', 'sales'] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

export const PERSONA_INFO: Record<PersonaKey, { label: string; description: string }> = {
  ops: { label: 'Trợ lý vận hành', description: 'Phễu bán hàng, đội sales, lead bị bỏ quên' },
  seo: { label: 'Trợ lý SEO', description: 'Traffic, từ khoá, hiệu quả website' },
  sales: { label: 'Trợ lý bán hàng', description: 'Khách tiềm năng, chăm sóc khách, soạn tin nhắn' },
};

export interface Persona {
  key: PersonaKey;
  system: string;
  tools: AssistantTool[];
}

/**
 * Các trợ lý mỗi role được dùng - phần tử đầu là mặc định. Khớp quyền xem dữ liệu hiện có:
 * sales không dùng bot SEO (không có quyền xem từ khoá), seo không dùng bot vận hành (không xem lead).
 */
export const PERSONAS_BY_ROLE: Record<Role, PersonaKey[]> = {
  admin: ['ops', 'seo'],
  manager: ['ops', 'seo'],
  seo: ['seo'],
  sales: ['sales'],
};
