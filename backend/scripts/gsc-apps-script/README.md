# GSC → backend qua Apps Script (không dùng Sheet CSV)

Thay cho add-on "Search Analytics for Sheets" (Sheet không tự refresh ở bản
free → dữ liệu đứng im). Script này gọi thẳng Search Console API bằng tài
khoản Google của bạn, chạy độc lập bằng trigger hằng ngày của Apps Script,
không phụ thuộc Sheet hay việc backend có đang chạy đúng lúc 2h sáng không.

**Lưu ý:** Search Console API **không** nằm trong danh sách "Advanced Google
Services" có sẵn của Apps Script (khác Sheets/Drive/Gmail...). Script này gọi
thẳng REST API bằng token OAuth ẩn của chính Apps Script
(`ScriptApp.getOAuthToken()`) — vẫn không cần tạo GCP project hay thẻ tín
dụng riêng, chỉ cần khai báo quyền trong file manifest (bước 3 dưới đây).

## Cài đặt

1. Vào [script.google.com](https://script.google.com) → **New project**.
2. Xoá code mẫu, dán nội dung [Code.gs](Code.gs) vào.
3. Khai báo quyền (manifest): bánh răng ⚙️ **Project Settings** (sidebar
   trái) → tick **"Show appsscript.json manifest file in editor"**. File
   `appsscript.json` xuất hiện ở danh sách file bên trái → mở, thay toàn bộ
   nội dung bằng [appsscript.json](appsscript.json) trong thư mục này → Save.
4. Sửa trong `CONFIG` ở đầu `Code.gs`:
   - `backendUrl`: domain backend **truy cập được từ Internet** (VPS thật,
     hoặc link ngrok khi đang test — không dùng `localhost`).
   - `apiKey`: copy giá trị `GSC_INGEST_API_KEY` trong `backend/.env`.
   - `sites`: liệt kê từng website, `siteUrl` phải khớp **chính xác** cột
     "GSC Property" của website đó trong Quản trị → Website.
5. Chạy thử: chọn hàm `testFirstSite` ở dropdown trên toolbar → bấm ▶ Run.
   Lần đầu Google sẽ hỏi cấp quyền (đọc Search Console + gọi URL ngoài) →
   **Advanced → Go to (tên project) (unsafe) → Allow** (đây là app của
   chính bạn, "unsafe" chỉ vì chưa submit verify công khai với Google, không
   phải cảnh báo thật) — đây vẫn là quyền của chính tài khoản Google bạn
   đang dùng, không cần tạo GCP project hay thẻ tín dụng riêng.
6. Xem log: **View → Logs** (hoặc Ctrl+Enter) — kỳ vọng thấy `HTTP 201` hoặc
   `HTTP 200` kèm số dòng đã ghi. Lỗi thường gặp:
   - `403` từ Search Console API → tài khoản Google đang chạy script chưa
     có quyền xem property đó trong Search Console thật (vào
     search.google.com/search-console → Settings → Users and permissions
     để thêm).
   - `404 Không tìm thấy website` từ backend → `siteUrl` chưa khớp cột GSC
     Property.
   - `401` từ backend → `apiKey` sai.
7. Đặt lịch tự động: đồng hồ ⏰ ở sidebar trái → **Add Trigger** → Function
   `syncAllSites` → Event source **Time-driven** → Day timer, chọn khung giờ
   (vd 3h-4h sáng). Miễn phí, không giới hạn.

## Sau khi đã chạy ổn định

Với các website chuyển sang dùng cách này, **xoá** `trafficCsvUrl` /
`keywordsCsvUrl` của website đó (Quản trị → Website → Sửa → để trống rồi
lưu). Nếu để cả hai, cron CSV cũ (2h sáng, đọc Sheet đã dừng refresh) sẽ ghi
đè lại dữ liệu mới bằng dữ liệu Sheet cũ ngay sau khi Apps Script vừa cập
nhật xong.
