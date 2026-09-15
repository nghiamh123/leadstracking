# TODO LIST — Backend cho Webapp Đo Lường Chuyển Đổi

> Bổ sung cho `yeu-cau-webapp-do-luong-chuyen-doi.md`. Frontend (React + Vite + TS, mock data) ở thư mục `app/`. Backend (NestJS + Prisma + PostgreSQL) ở thư mục `backend/`. File này theo dõi tiến độ backend: database, API nội bộ, tích hợp Google Search Console (GSC), và phần nối với frontend.

---

## Phase 0 — Quyết định & chuẩn bị trước khi code

- [x] Chốt stack: **Node.js + NestJS + PostgreSQL + Prisma**
- [x] Chốt nơi deploy: **VPS riêng** (Ubuntu 24.04 LTS, 2 vCPU / 2GB RAM, backup tự động 1 lần/tuần từ nhà cung cấp)
- [x] **Quyết định né hoàn toàn GCP** (không tạo Google Cloud project/thẻ tín dụng) — GSC qua Sheets CSV (Phase 3), đăng nhập qua email/password thường (Phase 2). Dự án hiện **không phụ thuộc GCP ở bất kỳ đâu**.

**12 website thật sẽ tracking:** gomkientrucviet.vn, sanxuatgomsu.vn, quatangcongdoanvn.com, inostore.vn, sanxuatcaptuida.com, sanxuatlythuytinh.vn, sanxuatvali.vn, xuongquaviet.com, inkhactienthanh.com, quatangsg.vn, gombinhduong.vn, baobitienthanh.com — đã cập nhật vào mock frontend và seed backend.

---

## Phase 1 — Hạ tầng & Database ✅ xong (code + local dev)

**Trên VPS (đã làm thủ công qua PuTTY):**
- [x] Tạo user `deploy`, SSH key auth, tắt root/password login, firewall `ufw`, `fail2ban`, swap 2GB
- [x] Cài Node.js 20 LTS, PostgreSQL 16, Nginx, PM2, Git
- [x] Tạo database `funnel_db` + user `funnel_app` trong PostgreSQL (trống, chưa migrate — xem Phase 5/6 phần deploy)
- [x] Cấu hình Nginx server block tạm qua IP, proxy `/api/` → `127.0.0.1:3000`
- [ ] Trỏ domain thật + SSL (Let's Encrypt) — hoãn đến khi mua domain

**Code (thư mục `backend/`):**
- [x] Khởi tạo project NestJS, chia module theo domain: `auth`, `users`, `websites`, `gsc`, `sync-logs`, `keywords`, `leads`, `orders`, `dashboard`
- [x] `.env` + `.env.example` với đủ biến (`DATABASE_URL`, `JWT_SECRET`, `SEED_ADMIN_PASSWORD`, `FRONTEND_URL`)
- [x] Docker Compose (`backend/docker-compose.yml`) chạy PostgreSQL 16 cho local dev, tách biệt với DB thật trên VPS
- [x] Schema Prisma đầy đủ (`backend/prisma/schema.prisma`) — đã migrate & test trên DB local:

  | Bảng | Ghi chú |
  |---|---|
  | `websites` | domain `@unique`, status connected/error/pending |
  | `gsc_daily_traffic` | unique (website, date) |
  | `gsc_keywords` | **snapshot hiện tại**, unique (website, query) — mỗi lần sync ghi đè, từ khoá rớt hạng bị xoá tự động (không phình bảng vô hạn) |
  | `leads`, `orders` | soft-delete (`deletedAt`), liên kết `salesRep`/`createdBy` tới `users` |
  | `users` | role enum admin/manager/sales/seo, `passwordHash` (bcrypt) |
  | `sync_logs`, `audit_logs` | log đồng bộ GSC và lịch sử sửa lead/order |

- [x] Seed script (`npm run prisma:seed`): tạo admin đầu tiên (theo email thật của bạn) + **12 website thật**
- [x] Index cho các cột hay lọc

**Lưu ý kỹ thuật:** Prisma bản mới nhất (8.x) đang là release-candidate nên đã ghim về bản ổn định **7.10.0**. Prisma 7 đổi cách kết nối DB — không còn `url` trong `schema.prisma`, phải dùng driver adapter (`@prisma/adapter-pg`) trong `PrismaService`.

---

## Phase 2 — Auth & Phân quyền ✅ xong, đã test thật đầu-cuối (đổi sang email/password)

**Đổi hướng so với thiết kế gốc:** bỏ hẳn Google OAuth SSO (không cần GCP project/OAuth Client ID nữa) — chuyển sang **email/password** thường, mật khẩu hash bằng `bcrypt`. Nút "Đăng nhập bằng Google" đã gỡ khỏi frontend Login.

- [x] `POST /auth/login` (email+password) — Admin tạo tài khoản kèm mật khẩu ban đầu qua `POST /users/invite` (không cho tự đăng ký)
- [x] `PATCH /auth/password` — tự đổi mật khẩu (cần mật khẩu hiện tại)
- [x] `PATCH /users/:id/password` — Admin đặt lại mật khẩu người khác khi họ quên (không cần mật khẩu cũ)
- [x] JWT lưu trong cookie `httpOnly` (không dùng refresh token — JWT 12h là đủ cho nhu cầu nội bộ, đơn giản hơn mà vẫn an toàn)
- [x] `RolesGuard` + decorator `@Roles()` khớp bảng phân quyền mục 6 tài liệu yêu cầu
- [x] Scope theo team/sales cho Lead & Order (`common/scope.ts`) — xem mục "Bug đã sửa" bên dưới
- [x] `GET /auth/me`, `POST /auth/logout`
- [x] **Đã test thật đầu-cuối**: sai mật khẩu → 401; đăng nhập đúng → cookie hoạt động với mọi endpoint bảo vệ; tự đổi mật khẩu; admin reset mật khẩu người khác — tất cả chạy đúng

**🐛 Bug nghiêm trọng #1 đã phát hiện & sửa khi test:** Ban đầu code gộp scope theo vai trò (`leadOrderScope(user)`) và filter tuỳ chọn (`salesRepId` từ query string) vào chung một object JS bằng spread — khi filter không được truyền (`undefined`), nó **ghi đè và vô hiệu hoá** luôn scope, khiến Sales xem được lead/order của người khác. Đã sửa bằng cách tách scope và filter thành các object riêng trong mảng `AND` của Prisma. Đã viết test thủ công xác nhận Sales/Manager/Admin/SEO đều đúng phạm vi sau khi sửa.

**🐛 Bug bảo mật #2 đã phát hiện & sửa khi test:** `POST /users/invite`, `PATCH /users/:id/role`, `PATCH /users/:id/status` trả nguyên object User từ Prisma về client — **bao gồm cả `passwordHash`** (dù đã bcrypt, vẫn không nên lộ ra API). Đã sửa bằng cách thêm `select` tường minh loại trừ `passwordHash` cho mọi endpoint trả về User, xác nhận lại bằng test thật.

---

## Phase 3 — Lấy dữ liệu GSC ✅ xong, đã test thật với dữ liệu thật (đổi kiến trúc để né GCP)

**Đổi hướng so với thiết kế gốc:** không gọi trực tiếp GSC API (cần GCP project + Service Account + thẻ tín dụng xác minh). Thay bằng: add-on **"Search Analytics for Sheets"** trên Google Sheets (miễn phí, không cần GCP) xuất dữ liệu ra Sheet → **Publish to web** thành link CSV công khai → backend tải CSV đó theo lịch, y hệt cơ chế "tự động" ban đầu.

- [x] Thêm cột `trafficCsvUrl`, `keywordsCsvUrl` vào bảng `websites`
- [x] `GscSheetsService` (thay cho `GscClientService` cũ — đã xoá, gỡ luôn package `googleapis`): tải CSV qua `fetch`, parse bằng `csv-parse`
- [x] Xử lý đúng **định dạng số kiểu Việt Nam** trong CSV xuất ra từ Google Sheets: dấu `.` = phân cách nghìn, dấu `,` = phân cách thập phân (vd `"2.136"` = 2136, `"13,3%"` = 13.3%) — đã viết `parseViNumber()` và test với dữ liệu thật có số lớn để chắc chắn không bị parse sai
- [x] `GscSyncService` — cron hằng ngày 02:00, tải CSV traffic + CSV từ khóa, upsert vào DB, ghi `sync_logs`
- [x] `PATCH /websites/:id` (mới) — admin nhập link CSV, tự test link còn sống không, set trạng thái connected/error
- [x] **Đã test bằng dữ liệu thật 100%** với website thí điểm `gomkientrucviet.vn`: 30 dòng traffic + 1.610 từ khóa đồng bộ đúng, số liệu chính xác kể cả các trường hợp impressions lớn dễ parse sai

### Phase 3.1 — Sự cố "không cập nhật mỗi ngày" & đổi hướng sang Apps Script webhook ✅ xong phần code, chờ bạn cài đặt

**Sự cố phát hiện (15/09/2026):** dù `sync_logs` báo thành công liên tục nhiều ngày, dữ liệu `gsc_daily_traffic` của `quatangsg.vn` đứng im ở ngày 06/09 — đúng như rủi ro đã ghi ở mục trên: add-on "Search Analytics for Sheets" bản free **không tự refresh** Sheet, nên backend chỉ đang tải đi tải lại cùng CSV cũ. Thêm vào đó, cron 2h sáng chỉ chạy khi backend đang chạy đúng lúc đó — mà Phase 6 (deploy VPS 24/7) vẫn chưa làm, nên có những ngày cron không chạy lần nào.

**Đổi hướng:** bỏ trung gian Sheet + CSV, dùng **Google Apps Script gọi thẳng Search Console API** (Advanced Service có sẵn trong Apps Script, chạy trên project ẩn riêng — vẫn **không cần** tạo GCP project/thẻ tín dụng, giữ đúng quyết định ở Phase 0) rồi đẩy data qua webhook mới của backend. Apps Script tự chạy bằng trigger hằng ngày của Google, độc lập với việc backend/Sheet có "sống" đúng giờ hay không.

- [x] `POST /api/gsc/ingest` (`backend/src/gsc/gsc-ingest.controller.ts`) — nhận `{siteUrl, traffic[], keywords[], keywordsRangeStart, keywordsRangeEnd}`, xác thực bằng header `x-api-key` (`ApiKeyGuard`, không qua JWT người dùng), khớp website theo `gsc_property`
- [x] `GscSyncService` refactor: tách logic upsert dùng chung (`applyTraffic`/`applyKeywords`) cho cả đường CSV cũ và đường webhook mới (`ingestTraffic`/`ingestKeywords`) — CSV path giữ nguyên, chưa xoá, dùng làm phương án dự phòng cho site nào chưa kịp chuyển
- [x] Thêm `GSC_INGEST_API_KEY` vào `.env`/`.env.example`
- [x] Script mẫu `backend/scripts/gsc-apps-script/Code.gs` + hướng dẫn cài đặt `README.md` cùng thư mục
- [x] Đã test đầu-cuối bằng curl (thiếu key → 401, sai site → 404, đúng → 201 và ghi đúng DB) trên website `quatangsg.vn`
- [ ] **Bạn cần làm** (thao tác trên Google account của bạn, ngoài khả năng thao tác thay): làm theo `backend/scripts/gsc-apps-script/README.md` — dán script vào script.google.com, bật Advanced Service "Search Console API", điền `backendUrl` (cần domain public — chờ Phase 6 hoặc dùng ngrok tạm) + `apiKey`, chạy thử, đặt trigger hằng ngày
- [ ] Sau khi xác nhận chạy ổn với `quatangsg.vn`: xoá `trafficCsvUrl`/`keywordsCsvUrl` của site đó (tránh cron CSV cũ ghi đè lại bằng data Sheet đã ngừng refresh), rồi lặp lại Apps Script cho từng site trong **11 website còn lại** thay vì setup Sheet CSV như dự định trước đây

---

## Phase 4 — REST API nội bộ ✅ xong, đã test qua curl với JWT thật

Tất cả endpoint dưới đã chạy được, có Swagger tại `/api/docs`:

- [x] **Websites**: `GET/POST /websites`, `PATCH /websites/:id` (sửa link CSV), `POST /websites/:id/reconnect`
- [x] **Dashboard**: `GET /dashboard/summary|trend|by-website|export.csv`
- [x] **Keywords**: `GET /keywords` — phân loại "Tiềm năng"/"Mạnh" tính server-side
- [x] **Leads**: full CRUD + soft delete + `GET /leads/:id/history` (audit log) + import CSV + template — đã test tạo/sửa/xoá, xác nhận audit log ghi đúng diff từng field
- [x] **Orders**: full CRUD tương tự Leads (không có history modal, khớp thiết kế frontend hiện tại)
- [x] **Users (Admin)**: `GET /users`, `POST /users/invite`, `PATCH /users/:id/role|status`
- [x] **Sync logs**: `GET /sync-logs`, `POST /sync-logs/:id/rerun`
- [x] Swagger UI (`@nestjs/swagger`) tại `http://localhost:3000/api/docs`

**Lưu ý cho Phase 5:** API dùng enum tiếng Anh không dấu (`form_web`, `moi`, `dang_cham_soc`, `cho_xu_ly`...) làm giá trị chuẩn trong DB/API — sạch hơn cho DB nhưng **khác** với các chuỗi tiếng Việt frontend đang dùng trực tiếp (`"Mới"`, `"Form web"`...). Cần thêm lớp map label ↔ enum khi nối frontend, xem Phase 5.

---

## Phase 5 — Nối Frontend với Backend thật ✅ xong, đã test thật đầu-cuối bằng browser

- [x] Xoá `app/src/lib/mockData.ts` + `csv.ts`, thay bằng lớp gọi API thật (`app/src/lib/api.ts` — typed, 1 hàm/endpoint) + `app/src/lib/hooks.ts` (`useWebsites`, `useUsers`)
- [x] Lớp map nhãn tiếng Việt ↔ enum backend (`app/src/lib/enumMap.ts`) cho channel/status của Lead & Order
- [x] `SessionProvider` gọi `/auth/login` + `/auth/me` + `/auth/logout` thật, có `isLoading` (tránh flash màn hình login khi refresh trang lúc đã đăng nhập)
- [x] Bỏ hẳn "Xem theo vai trò" (role switcher demo) ở Topbar — giờ vai trò lấy từ user thật đã đăng nhập, sidebar/route-guard dùng đúng vai trò đó
- [x] Toàn bộ 8 trang (Dashboard, Từ khóa, Lead, Đơn hàng, Admin Website/Người dùng/Nhật ký đồng bộ) nối API thật, có loading state
- [x] Trang Admin Website: thêm form nhập/sửa link CSV traffic + từ khóa cho từng site (trước đây chỉ có GSC property text)
- [x] Trang Admin Người dùng: thêm mật khẩu khi tạo tài khoản, nút "Đặt lại MK" cho từng người
- [x] **Đã test thật bằng Playwright (browser thật, không phải mock)**: đăng nhập → Dashboard hiện đúng số liệu thật (947 click, đúng theo website `Gốm Kiến Trúc Việt`) → Từ khóa hiện 1.610 dòng thật → tạo Lead thật qua form → xem lịch sử audit log thật → Đơn hàng/Admin Website/Người dùng/Nhật ký đồng bộ đều hiện đúng dữ liệu thật → đăng xuất quay lại màn hình login. 0 lỗi console thật sự (chỉ có 401 vô hại từ việc check session ngay sau logout).

**🐛 Sự cố phát hiện khi test (không phải bug code):** dashboard ban đầu hiện toàn số 0 dù đã sync dữ liệu thật trước đó — nguyên nhân là lệnh `TRUNCATE` chạy lúc migrate schema `password_auth` (Phase 2) đã xoá luôn bảng `websites` cùng link CSV đã cấu hình. Đã cấu hình lại + sync lại, xác nhận hiển thị đúng. **Bài học: cẩn thận khi TRUNCATE/reset DB cục bộ nếu đã có dữ liệu demo quan trọng — nên tách dữ liệu seed cố định khỏi dữ liệu cấu hình thủ công, hoặc backup trước khi reset.**

---

## Phase 6 — Deploy lên VPS & Non-functional — chưa làm

- [ ] Chạy `prisma migrate deploy` trên VPS (DB `funnel_db` hiện đang trống)
- [ ] `pm2 start dist/main.js --name funnel-api`, `pm2 save`, `pm2 startup`
- [ ] Backup `pg_dump` hằng ngày trên VPS (bổ sung cho backup tuần của nhà cung cấp)
- [ ] Logging tập trung + alert khi cron GSC fail liên tiếp
- [ ] Cache `dashboard/summary` nếu cần (chưa cần thiết ở quy mô dữ liệu hiện tại)
- [ ] Unit test công thức % chuyển đổi & phân loại từ khóa
- [ ] Viết hướng dẫn sử dụng ngắn gọn cho đội Sales

---

## Thứ tự đã làm thực tế (khác nhẹ so với dự kiến ban đầu)

1. Phase 1 (hạ tầng VPS) → **Phase 1 (code + DB local)** → **Phase 2 (auth qua Google OAuth, code)** → **Phase 3 (GSC qua GCP API, code)** → **Phase 4 (API)** → phát hiện lo ngại về việc phải add thẻ GCP → **đổi hướng Phase 3 sang Google Sheets CSV** (test thật 100% cho 1 website) → **đổi hướng Phase 2 sang email/password** (test thật 100%, phát hiện & sửa 1 bug lộ password hash) → **Phase 5** (nối frontend, test thật bằng browser đầu-cuối với dữ liệu thật). Dự án hiện không phụ thuộc GCP ở đâu cả, và toàn bộ 8 trang frontend đã chạy với dữ liệu thật (1 website có dữ liệu GSC thật, 11 website còn lại chờ setup Sheet).
2. **(15/09/2026)** Phát hiện dữ liệu GSC đứng im nhiều ngày dù `sync_logs` báo thành công (add-on Sheet không tự refresh ở bản free + backend chưa deploy 24/7 nên cron cũng không chạy đều) → **đổi hướng Phase 3 lần 2: bỏ Sheet CSV, dùng Apps Script gọi thẳng Search Console API rồi đẩy qua webhook mới** `POST /api/gsc/ingest` (vẫn né GCP project/thẻ tín dụng như quyết định ở Phase 0) → đã code + test đầu-cuối bằng curl xong phần backend, đang chờ bạn cài Apps Script thật (xem `backend/scripts/gsc-apps-script/README.md`).
3. Tiếp theo nên làm: cài Apps Script cho `quatangsg.vn` theo README trên, xác nhận chạy ổn vài ngày rồi lặp lại cho 11 website còn lại (thay cho việc setup Sheet CSV như dự định trước đây) → **Phase 6** (deploy VPS thật + hoàn thiện, cũng là điều kiện để Apps Script có `backendUrl` public thật thay vì ngrok tạm).
