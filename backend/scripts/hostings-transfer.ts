import 'dotenv/config';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { decryptSecret, parseSecretKey } from '../src/common/secret-box.js';

/**
 * Chuyển tài khoản hosting giữa 2 database (VD nhập ở local rồi đưa lên production) để khỏi
 * nhập lại tay.
 *
 *   Máy nguồn:  npx tsx scripts/hostings-transfer.ts export hostings.json
 *   Máy đích:   npx tsx scripts/hostings-transfer.ts import hostings.json
 *
 * Mật khẩu giữ nguyên dạng đã mã hoá nên máy đích PHẢI dùng cùng HOSTING_SECRET_KEY với máy
 * nguồn - import kiểm tra giải mã được hết rồi mới ghi. Website được khớp theo domain (id mỗi DB
 * mỗi khác). Ghi theo id nên chạy lại nhiều lần không tạo trùng; tất cả trong 1 transaction.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

interface ExportedHosting {
  id: string;
  domain: string;
  label: string;
  loginUrl: string;
  username: string | null;
  passwordEncrypted: string | null;
  note: string | null;
}

async function exportTo(file: string) {
  const rows = await prisma.hostingAccount.findMany({
    include: { website: { select: { domain: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const data: ExportedHosting[] = rows.map((r) => ({
    id: r.id,
    domain: r.website.domain,
    label: r.label,
    loginUrl: r.loginUrl,
    username: r.username,
    passwordEncrypted: r.passwordEncrypted,
    note: r.note,
  }));
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`Đã export ${data.length} tài khoản hosting ra ${file}`);
}

async function importFrom(file: string) {
  const data: ExportedHosting[] = JSON.parse(readFileSync(file, 'utf8'));

  const key = parseSecretKey(process.env.HOSTING_SECRET_KEY);
  if (!key) throw new Error('Chưa cấu hình HOSTING_SECRET_KEY (32 byte) trong .env');
  const badKey = data.filter((h) => {
    if (!h.passwordEncrypted) return false;
    try {
      decryptSecret(h.passwordEncrypted, key);
      return false;
    } catch {
      return true;
    }
  });
  if (badKey.length > 0) {
    throw new Error(
      `HOSTING_SECRET_KEY ở đây khác máy nguồn - không giải mã được mật khẩu của: ${badKey.map((h) => h.domain).join(', ')}`,
    );
  }

  const websites = await prisma.website.findMany({ select: { id: true, domain: true } });
  const idByDomain = new Map(websites.map((w) => [w.domain, w.id]));
  const missing = [...new Set(data.map((h) => h.domain).filter((d) => !idByDomain.has(d)))];
  if (missing.length > 0) {
    throw new Error(`Chưa có website với domain: ${missing.join(', ')} - thêm website trước rồi chạy lại`);
  }

  await prisma.$transaction(
    data.map((h) => {
      const fields = {
        websiteId: idByDomain.get(h.domain)!,
        label: h.label,
        loginUrl: h.loginUrl,
        username: h.username,
        passwordEncrypted: h.passwordEncrypted,
        note: h.note,
      };
      return prisma.hostingAccount.upsert({ where: { id: h.id }, create: { id: h.id, ...fields }, update: fields });
    }),
  );
  console.log(`Đã import ${data.length} tài khoản hosting (${new Set(data.map((h) => h.domain)).size} website)`);
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (mode === 'export' && file) return exportTo(file);
  if (mode === 'import' && file) return importFrom(file);
  throw new Error('Usage: npx tsx scripts/hostings-transfer.ts <export|import> <file.json>');
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
