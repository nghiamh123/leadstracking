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

### Phase 3.1 — Sự cố "không cập nhật mỗi ngày" & thử đổi hướng sang Apps Script webhook ❌ bỏ (chặn bởi GCP), xem Phase 3.3 cho hướng thay thế

**Sự cố phát hiện (15/09/2026):** dù `sync_logs` báo thành công liên tục nhiều ngày, dữ liệu `gsc_daily_traffic` của `quatangsg.vn` đứng im ở ngày 06/09 — đúng như rủi ro đã ghi ở mục trên: add-on "Search Analytics for Sheets" bản free **không tự refresh** Sheet, nên backend chỉ đang tải đi tải lại cùng CSV cũ. Thêm vào đó, cron 2h sáng chỉ chạy khi backend đang chạy đúng lúc đó — mà Phase 6 (deploy VPS 24/7) vẫn chưa làm, nên có những ngày cron không chạy lần nào.

**Đổi hướng (thử):** bỏ trung gian Sheet + CSV, dùng **Google Apps Script gọi thẳng Search Console API** rồi đẩy data qua webhook mới của backend.

- [x] `POST /api/gsc/ingest` (`backend/src/gsc/gsc-ingest.controller.ts`) — nhận `{siteUrl, traffic[], keywords[], keywordsRangeStart, keywordsRangeEnd}`, xác thực bằng header `x-api-key` (`ApiKeyGuard`, không qua JWT người dùng), khớp website theo `gsc_property`. **Vẫn giữ lại** — dùng chung với Phase 3.2 (upload thủ công), không phí công dù bỏ hướng Apps Script.
- [x] `GscSyncService` refactor: tách logic upsert dùng chung (`applyTraffic`/`applyKeywords`) cho cả đường CSV, webhook, và sau này là upload thủ công (`ingestTraffic`/`ingestKeywords`)
- [x] Thêm `GSC_INGEST_API_KEY` vào `.env`/`.env.example`
- [x] Script mẫu `backend/scripts/gsc-apps-script/Code.gs` + `README.md`, `appsscript.json` — **đã sửa 1 lần** vì đoán sai: Search Console API không nằm trong "Advanced Services" có sẵn của Apps Script như tưởng, phải gọi thẳng REST bằng `ScriptApp.getOAuthToken()` + khai báo `oauthScopes` trong manifest
- [x] Đã test đầu-cuối bằng curl (thiếu key → 401, sai site → 404, đúng → 201 và ghi đúng DB) trên website `quatangsg.vn`
- [x] **❌ Bế tắc thật khi chạy với site thật:** gọi Search Console API từ project ẩn mặc định của Apps Script → lỗi `SERVICE_DISABLED` (API chưa bật), nhưng project ẩn đó **không cho vào Cloud Console để bật** (lỗi "insufficient permissions", kể cả đúng tài khoản chủ). Theo tài liệu Google, cách chính thức là đổi Apps Script sang 1 GCP project tự tạo — nhưng **tạo project mới trên tài khoản này bị Google yêu cầu xác minh thẻ thanh toán ngay bước tạo**, đúng rào cản đã né từ Phase 0. → **Dừng hẳn hướng Apps Script**, không phải do code sai mà do chính sách tài khoản Google, không có cách vượt qua mà không đụng billing.

---

### Phase 3.2 — Upload CSV thủ công (giải pháp chữa cháy, không tự động) ✅ code xong, hoạt động, **giữ làm công cụ dự phòng**

Sau khi Phase 3.1 bế tắc, làm tạm 1 đường "chắc chắn chạy" trong lúc tìm hướng tự động thật: admin export CSV trực tiếp từ giao diện Search Console (Performance → Export → CSV) rồi upload tay qua app. **Lưu ý: không giải quyết được yêu cầu gốc "tự động mỗi ngày"** — chỉ hữu ích khi cần dữ liệu gấp hoặc làm phương án dự phòng khi Phase 3.3 bên dưới gặp sự cố.

- [x] `GscSheetsService`: tách hàm parse CSV thuần (`parseTrafficRows`/`parseKeywordRows`) dùng chung cho URL-fetch lẫn file-upload; thêm khớp cột "khoan dung" (`findColumn` — thử tên chính xác trước, không có thì thử khớp gần đúng) vì tiêu đề CSV export trực tiếp từ GSC có thể ghi khác 1 chút (vd "Top queries" thay vì "Query")
- [x] `POST /websites/:id/gsc-upload` (`backend/src/websites/websites.controller.ts`) — nhận multipart 2 file (`traffic`, `keywords`) + query `rangeStart`/`rangeEnd`, admin-only, tái dùng `ingestTraffic`/`ingestKeywords`
- [x] UI: nút "Tải lên CSV" ở **Quản trị → Website** (`app/src/pages/admin/Websites.tsx`) — modal chọn 2 file + chỉnh khoảng ngày cho từ khoá
- [x] Đã test parse logic với file mẫu (kể cả header biến thể "Top queries") — chạy đúng
- [ ] **Chưa test thật** đường HTTP đầy đủ qua UI (chỉ test logic parse trực tiếp, chưa bấm nút thật trong browser với file GSC thật) — nên test lại nếu định dùng công cụ này

---

### Phase 3.3 — Quay lại add-on Sheet, dùng tính năng lịch tự động có sẵn ✅ **hướng chính thức, đã xác nhận hoạt động**

Kiểm tra lại kỹ hơn thay vì bỏ cuộc: add-on "Search Analytics for Sheets" bản **Free thực sự có tính năng "Scheduled Reports"** chạy **Daily** tự động (đã xác nhận bằng ảnh chụp thật từ add-on, không phải đoán) — vấn đề ban đầu ở Phase 3.1 chỉ là chưa bật đúng tính năng này. Không đụng GCP, không cần Apps Script, giải quyết đúng gốc rễ yêu cầu "tự động mỗi ngày".

**Giới hạn phát hiện khi làm thật:** bản Free chỉ cho **1 lịch / 1 spreadsheet** (không có nút "thêm lịch thứ 2" trong cùng 1 sheet). → **Mỗi website cần 2 Google Sheet riêng** (1 sheet cho report Traffic, 1 sheet cho report Keywords), mỗi sheet tự làm 1 report + 1 lịch Daily riêng, publish CSV riêng — vẫn dán được vào đúng 2 ô `trafficCsvUrl`/`keywordsCsvUrl` sẵn có của website, không cần sửa code.

- [x] Đã dựng thật 2 spreadsheet mẫu cho site test `fromthestress.vn`, xác nhận "Report frequency: Daily (runs every day)" khả dụng trên Plan Free, và "Results Sheet" ở mode **Replace** đúng đè lên đúng tab (không tạo tab rác mỗi ngày)
- [x] Thêm website `From The Stress` (domain `https://fromthestress.vn/`) vào DB để test luồng end-to-end — cấu hình 2 link CSV, status tự chuyển `connected`
- [x] `backend/scripts/force-sync.ts` (mới, đứng ngoài Nest DI để tránh vấn đề tsx/esbuild không emit decorator metadata) — kích hoạt đồng bộ ngay lập tức cho 1 website bằng domain hoặc id, không cần đợi cron 2h sáng. Đã chạy thật: 30 dòng traffic + 32 từ khoá cho `fromthestress.vn`
- [ ] **Bạn cần làm cho `quatangsg.vn`** (site thật đang có 1610 từ khoá cũ từ Sheet không-tự-refresh): dựng lại 2 spreadsheet mới theo đúng quy trình đã làm với `fromthestress.vn`, đặt lịch Daily cho cả 2, publish CSV, dán đè vào cấu hình website — sau đó **không cần** `force-sync.ts` nữa vì cron 2h sáng sẽ tự chạy (miễn Phase 6 deploy xong, backend chạy 24/7)
- [ ] Lặp lại quy trình 2-spreadsheet-mỗi-site cho **11 website còn lại**
- [ ] **Vướng mắc quyền truy cập:** tài khoản Google đang dùng để làm Sheet **không có quyền Search Console** cho 11 site còn lại (chỉ có quyền cho `quatangsg.vn`). Cần chủ sở hữu gốc của từng property vào **Search Console → Cài đặt → Người dùng và quyền → Add user**, cấp quyền **Restricted** là đủ, làm riêng từng property (không có cấp hàng loạt) — hoặc dùng đúng tài khoản Google gốc đã verify các property đó nếu còn đăng nhập được, đỡ phải cấp quyền chéo

---

## Phase 4 — REST API nội bộ ✅ xong, đã test qua curl với JWT thật

Tất cả endpoint dưới đã chạy được, có Swagger tại `/api/docs`:

- [x] **Websites**: `GET/POST /websites`, `PATCH /websites/:id` (sửa link CSV), `POST /websites/:id/reconnect`
- [x] **Dashboard**: `GET /dashboard/summary|trend|by-website|export.csv`
- [x] **Keywords**: `GET /keywords` — phân loại "Tiềm năng"/"Mạnh" tính server-side
- [x] **Leads**: full CRUD + soft delete + `GET /leads/:id/history` (audit log) + import CSV + template — đã test tạo/sửa/xoá, xác nhận audit log ghi đúng diff từng field
- [x] **Orders**: full CRUD tương tự Leads (không có history modal, khớp thiết kế frontend hiện tại)
- [x] **Users (Admin)**: `GET /users`, `POST /users/invite`, `PATCH /users/:id/role|status`
- [x] **Sync logs**: `GET /sync-logs`, `POST /sync-logs/:id/rerun`, `POST /sync-logs/sync` (mới — nhận `{websiteId}`, đồng bộ ngay cho 1 website bất kỳ mà **không cần** có sẵn 1 log lỗi để "Chạy lại" như `rerun`, cũng không cần SSH chạy `force-sync.ts` — admin-only, cùng validate qua `class-validator` (`SyncNowDto`))
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

## Phase 6 — Deploy lên VPS & Non-functional — ✅ site thật đã chạy production + CI/CD tự động

**Đã xong (15/09/2026):** `https://leadstracking.nghiadang.site` chạy thật, SSL hợp lệ (Let's Encrypt), backend qua PM2, frontend qua Nginx static.

**Sự cố dọc đường (đã giải quyết hết):**
- Mất quyền SSH vào VPS (key trên máy Mac không khớp key gốc tạo qua PuTTY, VPS đã tắt password/root login nên không vào lại bằng cách thường) → dùng Console/VNC của nhà cung cấp (Vietnix) đăng nhập root sau khi reset lại mật khẩu root, tự thêm public key máy Mac vào `deploy` → SSH lại được bình thường, sau đó khôi phục lại `PermitRootLogin no` / `PasswordAuthentication no` như cấu hình gốc
- Phát hiện **code trên VPS lúc đó không phải git clone** (chắc do 1 phiên làm việc trước đó tự copy tay qua console lúc SSH bị kẹt) → không quản lý/update được qua `git pull`

- [x] Lấy lại quyền SSH cho `deploy@103.200.20.41` (public key máy Mac đã thêm vào `~/.ssh/authorized_keys`)
- [x] `pm2 save` (trước đó tự chạy tay, chưa lưu — VPS reboot sẽ mất process) — đã lưu, `pm2 startup` đã enable từ trước
- [x] Chuyển toàn bộ deploy sang git-based: clone `github.com/nghiamh123/leadstracking` (public repo) về `/var/www/leadstracking`, build backend + frontend, cutover PM2 + Nginx sang thư mục mới, giữ nguyên `/var/www/funnel` (bản copy tay cũ) làm phao rollback tạm
- [x] **GitHub Actions CI/CD** (`.github/workflows/deploy.yml`): push lên `main` → typecheck backend + frontend → SSH vào VPS tự `git pull` + build + `prisma migrate deploy` + `pm2 restart` — đã test thật, từ lúc push tới lúc site chạy code mới ~1 phút, không cần thao tác tay. PR vào `main` chỉ chạy typecheck, không deploy.
- [x] Deploy key riêng cho CI (`ci_deploy_leadstracking`, không dùng chung key cá nhân), lưu ở GitHub Secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`)
- [x] Test đăng nhập thật trên domain production bằng tài khoản admin seed (`nghia12a319@gmail.com`) — thành công
- [x] Đồng bộ dữ liệu GSC thật cho `quatangsg.vn` lên production: dán lại 2 link CSV, chạy `force-sync.ts` → 1610 từ khoá đồng bộ đúng
- [ ] **Traffic GSC trên production hiện chỉ có 1 dòng** (12/09) — CSV nguồn hiện chỉ trả về 1 dòng (Sheet cũ bị thu hẹp report ở đâu đó), 29 ngày lịch sử còn lại (01-11/09) đang có ở DB local **chưa được copy sang production** — hỏi đã đưa ra nhưng chưa được xác nhận làm hay bỏ qua
- [ ] Cách xem DB production: `ssh deploy@103.200.20.41 "sudo -u postgres psql funnel_db"`, hoặc GUI (TablePlus/Postico) qua "Connect over SSH" tới `deploy@103.200.20.41`, DB host `localhost:5432`
- [ ] Dọn `backend/package-lock.json`: hiện lệch với `package.json` (npm ci fail, phải dùng `npm install`) — nên chạy `npm install` lại ở local, commit lockfile mới cho khớp, để CI dùng được `npm ci` (nhanh + đúng bản chuẩn hơn `npm install`)
- [ ] Backup `pg_dump` hằng ngày trên VPS (bổ sung cho backup tuần của nhà cung cấp)
- [ ] Logging tập trung + alert khi cron GSC fail liên tiếp
- [ ] Cache `dashboard/summary` nếu cần (chưa cần thiết ở quy mô dữ liệu hiện tại)
- [ ] Unit test công thức % chuyển đổi & phân loại từ khóa
- [ ] Viết hướng dẫn sử dụng ngắn gọn cho đội Sales
- [ ] Xoá `/var/www/funnel` (bản deploy tay cũ) sau khi dùng bản git-based ổn định vài ngày
- [ ] Nối UI: trang Admin Website chưa có nút gọi `POST /sync-logs/sync` mới thêm — hiện muốn đồng bộ ngay 1 site vẫn phải SSH chạy `force-sync.ts` hoặc đợi cron

---

## Thứ tự đã làm thực tế (khác nhẹ so với dự kiến ban đầu)

1. Phase 1 (hạ tầng VPS) → **Phase 1 (code + DB local)** → **Phase 2 (auth qua Google OAuth, code)** → **Phase 3 (GSC qua GCP API, code)** → **Phase 4 (API)** → phát hiện lo ngại về việc phải add thẻ GCP → **đổi hướng Phase 3 sang Google Sheets CSV** (test thật 100% cho 1 website) → **đổi hướng Phase 2 sang email/password** (test thật 100%, phát hiện & sửa 1 bug lộ password hash) → **Phase 5** (nối frontend, test thật bằng browser đầu-cuối với dữ liệu thật). Dự án hiện không phụ thuộc GCP ở đâu cả, và toàn bộ 8 trang frontend đã chạy với dữ liệu thật (1 website có dữ liệu GSC thật, 11 website còn lại chờ setup Sheet).
2. **(15/09/2026)** Phát hiện dữ liệu GSC đứng im nhiều ngày dù `sync_logs` báo thành công (add-on Sheet không tự refresh ở bản free + backend chưa deploy 24/7 nên cron cũng không chạy đều) → thử **đổi hướng Phase 3 lần 2: Apps Script gọi thẳng Search Console API** qua webhook mới `POST /api/gsc/ingest` → code xong, test curl OK, nhưng khi chạy thật với site thật thì **bế tắc thật sự**: project ẩn của Apps Script không bật được API (không có quyền vào Cloud Console), còn tạo project GCP riêng thì bị đòi xác minh thẻ thanh toán ngay bước tạo → **bỏ hẳn hướng Apps Script** (Phase 3.1), không phải lỗi code mà là chính sách tài khoản Google.
3. Làm tạm **Phase 3.2 (upload CSV thủ công)** làm phương án chữa cháy — nhưng tự nhận ra (đúng, được người dùng chỉ ra) là **không giải quyết yêu cầu gốc "tự động mỗi ngày"**, chỉ là công cụ dự phòng.
4. Quay lại kiểm tra kỹ add-on Sheet thay vì bỏ cuộc → phát hiện **Phase 3.3: bản Free thực sự có "Scheduled Reports" chạy Daily thật** (xác nhận bằng ảnh chụp), giới hạn 1 lịch/spreadsheet nên dùng **2 spreadsheet riêng mỗi website** (Traffic + Keywords) — đã dựng thật + test thành công với site thử `fromthestress.vn` (30 dòng traffic, 32 từ khoá, đồng bộ ngay bằng script mới `force-sync.ts` thay vì đợi cron). **Đây là hướng chính thức cho GSC**, không đụng GCP.
5. Bắt đầu **Phase 6 (deploy VPS)**: có subdomain `leadstracking.nghiadang.site` + VPS đã setup từ Phase 1, kẹt vì mất quyền SSH (key không khớp, quên mật khẩu root) → lấy lại được qua Console/VNC của nhà cung cấp, reset mật khẩu root, thêm lại public key cho `deploy`.
6. Phát hiện code trên VPS lúc đó là copy tay, không phải git → **chuyển hẳn sang git-based deploy** (clone repo public về `/var/www/leadstracking`, build, cutover PM2 + Nginx sang thư mục mới, giữ bản cũ `/var/www/funnel` làm rollback) → site production chạy thật, SSL hợp lệ, đăng nhập thật thành công.
7. Setup **GitHub Actions CI/CD**: push `main` → tự typecheck + SSH deploy + `pm2 restart` — đã test thật, chạy đúng trong ~1 phút từ lúc push.
8. Đồng bộ GSC thật cho `quatangsg.vn` lên production (1610 từ khoá OK, nhưng traffic chỉ có 1 dòng do CSV nguồn hiện bị thu hẹp — 29 ngày lịch sử ở local chưa copy sang, đang chờ quyết định).
9. Việc cần làm tiếp theo, không phụ thuộc thứ tự: (a) quyết định có copy nốt lịch sử traffic lên production không, (b) dựng 2-spreadsheet-mỗi-site theo Phase 3.3 cho 11 website còn lại, (c) xin quyền Search Console (Restricted) cho tài khoản Google đang dùng trên từng property trong 11 site đó, (d) dọn lockfile backend để `npm ci` chạy được trong CI.
