import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { Role, UserStatus, WebsiteStatus } from '../src/generated/prisma/enums.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword) {
    throw new Error('Thiếu SEED_ADMIN_PASSWORD trong .env');
  }
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'nghia12a319@gmail.com' },
    update: {},
    create: {
      name: 'Đặng Nghĩa',
      email: 'nghia12a319@gmail.com',
      passwordHash,
      role: Role.admin,
      team: 'Ban điều hành',
      status: UserStatus.active,
    },
  });
  console.log(`Seed admin: ${admin.email} (mật khẩu = SEED_ADMIN_PASSWORD trong .env)`);

  const websites = [
    { name: 'Gốm Kiến Trúc Việt', domain: 'gomkientrucviet.vn' },
    { name: 'Sản Xuất Gốm Sứ', domain: 'sanxuatgomsu.vn' },
    { name: 'Quà Tặng Công Đoàn', domain: 'quatangcongdoanvn.com' },
    { name: 'Ino Store', domain: 'inostore.vn' },
    { name: 'Sản Xuất Cặp Túi Da', domain: 'sanxuatcaptuida.com' },
    { name: 'Sản Xuất Ly Thủy Tinh', domain: 'sanxuatlythuytinh.vn' },
    { name: 'Sản Xuất Vali', domain: 'sanxuatvali.vn' },
    { name: 'Xưởng Quà Việt', domain: 'xuongquaviet.com' },
    { name: 'In Khắc Tiến Thành', domain: 'inkhactienthanh.com' },
    { name: 'Quà Tặng SG', domain: 'quatangsg.vn' },
    { name: 'Gốm Bình Dương', domain: 'gombinhduong.vn' },
    { name: 'Bao Bì Tiến Thành', domain: 'baobitienthanh.com' },
  ].map((site) => ({ ...site, gscProperty: `sc-domain:${site.domain}` }));

  for (const site of websites) {
    await prisma.website.upsert({
      where: { domain: site.domain },
      update: {},
      create: { ...site, status: WebsiteStatus.pending },
    });
  }
  console.log(`Seed ${websites.length} website mẫu (status=pending, chờ cấu hình GSC thật)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
