# TÀI LIỆU YÊU CẦU (REQUIREMENTS)
## Webapp nội bộ: Đo lường chuyển đổi kênh Online & Theo dõi phễu Traffic → Lead → Đơn hàng

---

## 1. Bối cảnh & Mục đích

Công ty cần một công cụ nội bộ (internal webapp) để:

1. **Đo lường hiệu quả chuyển đổi từ kênh online**: từ lượt truy cập website → tín hiệu quan tâm (lead) → đơn hàng thực tế.
2. **Tổng hợp nhu cầu mua sắm của khách hàng** trên nhiều website của công ty (nếu có nhiều domain/brand).
3. **Theo dõi các từ khóa (keyword) đang mang lại hiển thị (impression) và lượt truy cập (click) tốt** trên Google Search, phục vụ đội SEO/Content tối ưu tiếp.

Nói ngắn gọn: đây là một **dashboard phễu chuyển đổi (funnel dashboard)** kết hợp dữ liệu tự động từ Google Search Console (GSC) và dữ liệu nhập tay từ đội Kinh doanh (Sales).

---

## 2. Workflow tổng quan (Funnel 3 tầng)

```
[1] LƯU LƯỢNG TRUY CẬP WEBSITE  →  [2] LEAD (TÍN HIỆU)  →  [3] ĐƠN HÀNG
     (Tự động lấy từ GSC,              (Sales nhập tay)        (Sales nhập tay)
      cập nhật mỗi ngày)
```

| Tầng phễu | Nguồn dữ liệu | Cách thu thập | Tần suất |
|---|---|---|---|
| 1. Traffic (Lượt truy cập) | Google Search Console – phần **Performance** (Clicks, Impressions) | Tự động qua **Search Console API** | Hàng ngày (đồng bộ tự động) |
| 2. Lead (Tín hiệu quan tâm) | Đội Sales/CSKH ghi nhận (điện thoại gọi vào, chat, form liên hệ, Zalo/Fanpage nhắn tin...) | Nhập liệu thủ công qua form trên webapp | Theo thời gian thực, Sales nhập khi phát sinh |
| 3. Đơn hàng (Order) | Đội Sales chốt đơn, hoặc đối chiếu với hệ thống bán hàng | Nhập liệu thủ công (hoặc import Excel) | Theo thời gian thực, Sales nhập khi phát sinh |

**Chỉ số quan trọng cần tính toán tự động:**
- Tỷ lệ chuyển đổi Traffic → Lead (%) = Số Lead / Số Click (hoặc Session) × 100
- Tỷ lệ chuyển đổi Lead → Đơn hàng (%) = Số Đơn hàng / Số Lead × 100
- Tỷ lệ chuyển đổi tổng Traffic → Đơn hàng (%) = Số Đơn hàng / Số Click × 100
- Có thể tách theo: Website/Domain, theo Ngày/Tuần/Tháng, theo Nguồn (Organic, Ads, Direct...) nếu cần mở rộng sau này.

---

## 3. Nguồn dữ liệu chi tiết & cách trích xuất

### 3.1. Dữ liệu Traffic — Google Search Console (GSC)

**Nguồn:** Google Search Console API (Search Analytics / Performance report)

- **API:** `Google Search Console API` – endpoint `searchanalytics.query`
  - Tài liệu: https://developers.google.com/webmaster-tools/search-console-api-original/v3/searchanalytics/query
- **Xác thực (Authentication):** OAuth 2.0 hoặc Service Account (khuyến nghị dùng **Service Account** để chạy tự động không cần đăng nhập lại) — cần được cấp quyền "Full user" hoặc "Restricted" trên property GSC của từng website.
- **Dữ liệu lấy được:**
  - `clicks` (số lượt click)
  - `impressions` (số lượt hiển thị)
  - `ctr` (tỷ lệ click/hiển thị)
  - `position` (vị trí trung bình)
  - Có thể lọc theo `date`, `query` (từ khóa), `page` (trang), `country`, `device`
- **Cách đồng bộ tự động:**
  - Viết một **cron job / scheduled job** (chạy backend, ví dụ mỗi ngày lúc 2h sáng) gọi API GSC lấy dữ liệu ngày hôm trước → lưu vào database nội bộ.
  - Lưu ý: GSC thường có độ trễ dữ liệu 1–3 ngày, nên khi đồng bộ "ngày hôm nay" cần chạy lại (backfill) 2–3 ngày gần nhất để đảm bảo số liệu đã đủ và chính xác (không lấy dữ liệu "non" sát ngày hiện tại).
- **Áp dụng cho:** nếu có nhiều website, cần đăng ký & xác thực từng property trong GSC, sau đó lặp vòng lấy dữ liệu cho từng site.

### 3.2. Dữ liệu Từ khóa (Keyword performance) — cũng từ GSC (phần Performance)

- Cùng một API `searchanalytics.query`, nhưng thêm `dimensions: ["query"]` để lấy dữ liệu theo **từng từ khóa**.
- Các trường cần thiết: `query` (từ khóa), `clicks`, `impressions`, `ctr`, `position`, theo từng website & theo khoảng thời gian (7 ngày/28 ngày/tuỳ chọn).
- Mục đích: giúp đội SEO/Content biết từ khóa nào đang có **impression cao nhưng click thấp** (cơ hội tối ưu tiêu đề/mô tả) hoặc **click cao, vị trí tốt** (từ khóa mạnh cần duy trì).

### 3.3. Dữ liệu Lead & Đơn hàng — Nhập liệu thủ công (Sales)

- Xây dựng **form nhập liệu** ngay trên webapp, dành cho đội Kinh doanh, gồm các trường tối thiểu:

**Form Lead:**
| Trường | Loại | Ghi chú |
|---|---|---|
| Ngày phát sinh | Date | Mặc định = hôm nay |
| Website/Kênh nguồn | Dropdown | Chọn theo danh sách website đang theo dõi |
| Họ tên khách hàng | Text | |
| SĐT / Kênh liên hệ | Text | |
| Kênh tiếp nhận | Dropdown | Form web, Zalo, Fanpage, Hotline, Chat... |
| Nhu cầu/Sản phẩm quan tâm | Text hoặc Dropdown | Đây là dữ liệu tổng hợp "nhu cầu mua sắm" |
| Người phụ trách (Sales) | Dropdown | Tên nhân viên nhập |
| Trạng thái | Dropdown | Mới / Đang chăm sóc / Đã chuyển đơn / Huỷ |
| Ghi chú | Textarea | |

**Form Đơn hàng:**
| Trường | Loại | Ghi chú |
|---|---|---|
| Ngày chốt đơn | Date | |
| Liên kết với Lead (nếu có) | Dropdown/Search | Để nối dữ liệu Lead → Order |
| Website/Kênh nguồn | Dropdown | |
| Giá trị đơn hàng | Number | |
| Sản phẩm/Dịch vụ | Text hoặc Dropdown | |
| Người phụ trách (Sales) | Dropdown | |
| Trạng thái đơn | Dropdown | Chờ xử lý / Đã giao / Huỷ |

> 💡 Gợi ý: nên cho phép **import bằng Excel/CSV** (dùng template có sẵn) song song với nhập tay từng dòng, để tiết kiệm thời gian khi Sales có sẵn dữ liệu ở file Excel hàng ngày.

### 3.4. (Tuỳ chọn mở rộng sau này)
- Google Analytics 4 (GA4) API: bổ sung dữ liệu Session, User, Nguồn traffic (Organic/Ads/Social/Direct) để phễu chi tiết hơn là chỉ dùng GSC.
- Google Ads API: nếu muốn đo cả traffic từ quảng cáo trả phí.
- CRM/hệ thống bán hàng hiện có: nếu công ty đã có phần mềm quản lý đơn hàng, nên tích hợp API thay vì nhập tay để tránh sai lệch số liệu.

---

## 4. Yêu cầu chức năng (Functional Requirements)

### 4.1. Module Dashboard tổng quan (Trang chính)
- Hiển thị **phễu chuyển đổi (Funnel Chart)**: Traffic → Lead → Đơn hàng, kèm % chuyển đổi giữa mỗi tầng.
- Bộ lọc: theo Website, theo khoảng thời gian (hôm nay/7 ngày/30 ngày/tùy chọn), theo Sales phụ trách.
- Biểu đồ xu hướng theo thời gian (line chart): Traffic, Lead, Đơn hàng theo ngày/tuần/tháng.
- Bảng số liệu tổng hợp có thể xuất ra Excel.

### 4.2. Module Từ khóa (Keyword Performance)
- Bảng danh sách từ khóa kèm: Impressions, Clicks, CTR, Vị trí trung bình.
- Cho phép sắp xếp (sort), lọc theo Website, theo khoảng thời gian.
- Gợi ý phân loại nhanh: "Từ khóa tiềm năng" (impression cao, CTR thấp), "Từ khóa mạnh" (click cao, vị trí tốt) — có thể làm bằng cách đặt ngưỡng (threshold) và tô màu cảnh báo.

### 4.3. Module Nhập liệu Lead & Đơn hàng (dành cho Sales)
- Form nhập nhanh, gọn, thao tác được cả trên điện thoại (responsive).
- Danh sách Lead/Đơn hàng đã nhập, có thể sửa/xoá (theo phân quyền).
- Chức năng Import Excel theo template mẫu.
- Lịch sử thay đổi (audit log) để tránh sửa số liệu tuỳ tiện.

### 4.4. Module Quản trị (Admin)
- Quản lý danh sách Website đang theo dõi (thêm/xoá property GSC).
- Quản lý người dùng & phân quyền (xem phần 6).
- Cấu hình đồng bộ dữ liệu GSC (xem lịch sử đồng bộ, chạy lại thủ công nếu lỗi).

---

## 5. Gợi ý cách trình bày để ai cũng thao tác được (UI/UX)

1. **Thiết kế đơn giản, ít thao tác nhất có thể** cho form nhập liệu — vì người dùng chính (Sales) không rành công nghệ:
   - Ưu tiên Dropdown/chọn sẵn thay vì gõ tay (giảm sai chính tả, dễ tổng hợp báo cáo).
   - Nút "Lưu & Nhập tiếp" để nhập liên tục nhiều lead/đơn mà không phải quay lại từ đầu.
   - Validate dữ liệu ngay khi nhập (ví dụ số điện thoại đúng định dạng, giá trị đơn hàng phải là số).

2. **Dashboard trực quan, ít chữ nhiều hình:**
   - Dùng biểu đồ phễu (funnel chart) màu sắc rõ ràng, số % to, dễ đọc từ xa (kể cả khi trình chiếu họp).
   - Có "thẻ số liệu" (KPI card) tổng hợp nhanh ở đầu trang: Tổng Traffic – Tổng Lead – Tổng Đơn – Tỷ lệ chuyển đổi.

3. **Responsive/di động:** Sales thường thao tác trên điện thoại khi đang gặp khách → giao diện nhập liệu cần tối ưu cho màn hình nhỏ.

4. **Phân quyền rõ ràng theo vai trò** (xem mục 6) để mỗi người chỉ thấy phần liên quan, tránh rối mắt.

5. **Có hướng dẫn sử dụng (tooltip/help text)** ngay trên form, đặc biệt các trường dễ nhầm lẫn (VD: phân biệt Lead và Đơn hàng).

6. **Thông báo/nhắc nhở:** ví dụ nếu cuối ngày Sales chưa nhập liệu, hệ thống gửi email/Zalo nhắc nhở (tuỳ chọn mở rộng).

---

## 6. Phân quyền người dùng (đề xuất)

| Vai trò | Quyền |
|---|---|
| **Admin** | Toàn quyền: cấu hình website, GSC, tài khoản người dùng, xem tất cả dữ liệu |
| **Quản lý (Manager)** | Xem toàn bộ Dashboard, không sửa được dữ liệu Traffic (tự động), có thể sửa Lead/Đơn hàng của team mình |
| **Nhân viên Sales** | Chỉ nhập/sửa Lead & Đơn hàng do mình phụ trách, xem Dashboard giới hạn theo team/website được giao |
| **SEO/Content** | Chỉ xem module Từ khóa & Traffic, không có quyền vào phần nhập liệu Sales |

---

## 7. Yêu cầu phi chức năng (Non-functional Requirements)

- **Bảo mật:** Đăng nhập bằng tài khoản công ty (khuyến nghị SSO qua Google Workspace nếu công ty đang dùng Google Workspace, vì tiện tích hợp luôn với GSC).
- **Hiệu năng:** Dashboard load dưới 3 giây với dữ liệu 1 năm trở lại.
- **Đồng bộ dữ liệu:** Job đồng bộ GSC cần có cơ chế retry & log lỗi (để biết ngày nào đồng bộ thất bại).
- **Sao lưu dữ liệu:** Backup database định kỳ (hàng ngày), đặc biệt dữ liệu Lead/Đơn hàng do nhập tay không có nguồn khôi phục khác.
- **Khả năng mở rộng:** Thiết kế database cho phép thêm website mới, thêm nguồn dữ liệu mới (GA4, Ads...) mà không phải sửa lại toàn bộ cấu trúc.

---

## 8. Gợi ý ngăn xếp công nghệ (Tech stack — tham khảo, dev có thể điều chỉnh)

- **Backend:** Node.js (NestJS/Express) hoặc Python (FastAPI/Django) — có SDK/thư viện hỗ trợ tốt Google API.
- **Frontend:** React/Vue, dùng thư viện chart như Recharts, ECharts, hoặc Chart.js để vẽ funnel & line chart.
- **Database:** PostgreSQL/MySQL (dữ liệu quan hệ rõ ràng, phù hợp cho báo cáo tổng hợp).
- **Job đồng bộ GSC:** Cron job (node-cron, Celery, hoặc Cloud Scheduler nếu deploy trên GCP).
- **Xác thực GSC API:** Google Service Account + thư viện `googleapis` (Node) hoặc `google-api-python-client` (Python).

---

## 9. Danh sách công việc gợi ý cho Dev (Task breakdown)

1. Thiết lập Service Account & xin quyền truy cập GSC cho các property website.
2. Xây dựng job đồng bộ dữ liệu GSC (Traffic tổng + Từ khóa) → lưu database, chạy hàng ngày + cho phép chạy tay/backfill.
3. Thiết kế database: bảng `websites`, `gsc_daily_traffic`, `gsc_keywords`, `leads`, `orders`, `users`.
4. Xây dựng API nội bộ phục vụ Dashboard (tổng hợp funnel, tính %, lọc theo thời gian/website).
5. Xây dựng form nhập liệu Lead/Đơn hàng (+ chức năng import Excel).
6. Xây dựng giao diện Dashboard (Funnel chart, KPI card, bảng từ khóa).
7. Xây dựng module phân quyền & đăng nhập.
8. Kiểm thử (test) với dữ liệu thật, đối chiếu số liệu GSC thủ công để đảm bảo đồng bộ đúng.
9. Viết tài liệu hướng dẫn sử dụng ngắn gọn cho đội Sales.

---

*Tài liệu này là bản mô tả yêu cầu ban đầu (business requirement), dev có thể trao đổi thêm để làm rõ chi tiết kỹ thuật (database schema cụ thể, wireframe UI, API spec) trước khi triển khai.*
