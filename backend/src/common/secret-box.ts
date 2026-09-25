import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hoá đối xứng AES-256-GCM cho dữ liệu cần đọc lại được (mật khẩu hosting) - khác với
 * mật khẩu người dùng (bcrypt, không giải ngược). Định dạng lưu: "v1:<iv>:<tag>:<ciphertext>"
 * (base64), có tiền tố phiên bản để sau này đổi thuật toán/xoay key vẫn đọc được bản cũ.
 */
const VERSION = 'v1';

/** Key 32 byte, viết dạng hex (64 ký tự) hoặc base64. Tạo bằng: openssl rand -hex 32 */
export function parseSecretKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string, key: Buffer): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error('Định dạng dữ liệu mã hoá không hợp lệ');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
