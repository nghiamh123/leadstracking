/**
 * Google Apps Script - lấy dữ liệu Search Console THẬT (gọi thẳng REST API bằng token
 * OAuth ẩn của chính Apps Script, không qua Google Sheet CSV) rồi đẩy vào backend
 * Phễu Chuyển Đổi qua POST /api/gsc/ingest.
 *
 * Search Console API KHÔNG nằm trong danh sách Advanced Services có sẵn của Apps Script
 * (khác Sheets/Drive/Gmail...), nên gọi thẳng bằng UrlFetchApp + ScriptApp.getOAuthToken()
 * - vẫn dùng project ẩn của Apps Script, không cần tạo GCP project/thẻ tín dụng riêng.
 * Phải khai báo quyền (oauthScopes) trong appsscript.json - xem README.md.
 *
 * Thay thế cho add-on "Search Analytics for Sheets" (bị dừng tự refresh ở bản free) -
 * script này chạy độc lập bằng trigger hằng ngày của Apps Script, không phụ thuộc việc
 * backend hay Sheet có đang mở hay không.
 *
 * CÁCH CÀI ĐẶT - xem chi tiết trong README.md cùng thư mục.
 */

const CONFIG = {
  // URL backend, PHẢI truy cập được từ Internet (VPS thật, hoặc ngrok khi test).
  // KHÔNG dùng http://localhost - Google không gọi được vào máy của bạn.
  backendUrl: 'https://your-backend-domain.example.com/api/gsc/ingest',

  // Giá trị GSC_INGEST_API_KEY trong backend/.env
  apiKey: 'PASTE_GSC_INGEST_API_KEY_HERE',

  // Mỗi phần tử là 1 property đã verify trong Search Console của tài khoản Google
  // đang chạy script này. siteUrl phải khớp CHÍNH XÁC với cột "GSC Property" của
  // website trong Quản trị → Website (vd "https://vidu.vn/" hoặc "sc-domain:vidu.vn").
  sites: [
    { siteUrl: 'https://vidu.vn/', trafficDays: 30, keywordsDays: 28 },
  ],
};

/** Hàm để gán vào trigger hằng ngày (Apps Script → đồng hồ bên trái → Add Trigger). */
function syncAllSites() {
  CONFIG.sites.forEach((site) => {
    try {
      syncSite(site);
    } catch (err) {
      Logger.log(`Lỗi khi đồng bộ ${site.siteUrl}: ${err}`);
    }
  });
}

function syncSite(site) {
  const trafficRows = fetchSearchAnalytics(site.siteUrl, site.trafficDays, ['date']);
  const keywordRows = fetchSearchAnalytics(site.siteUrl, site.keywordsDays, ['query']);

  const rangeEnd = addDays(new Date(), -1);
  const rangeStart = addDays(new Date(), -site.keywordsDays);

  const payload = {
    siteUrl: site.siteUrl,
    // ctr từ Search Console API đã là tỉ lệ 0-1 (vd 0.027 = 2.7%), gửi thẳng không cần đổi đơn vị.
    traffic: trafficRows.map((r) => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    keywords: keywordRows.map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    keywordsRangeStart: formatDate(rangeStart),
    keywordsRangeEnd: formatDate(rangeEnd),
  };

  const res = UrlFetchApp.fetch(CONFIG.backendUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': CONFIG.apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  Logger.log(`${site.siteUrl}: HTTP ${res.getResponseCode()} - ${res.getContentText()}`);
}

/**
 * Gọi thẳng REST endpoint searchAnalytics.query của Search Console API bằng token OAuth
 * ẩn của Apps Script (ScriptApp.getOAuthToken()) - endpoint này không đổi từ thời "Webmasters
 * API" cũ, vẫn dùng chung host googleapis.com/webmasters/v3.
 */
function fetchSearchAnalytics(siteUrl, days, dimensions) {
  const endDate = addDays(new Date(), -1); // GSC thường trễ 1-2 ngày, lấy tới hôm qua cho chắc.
  const startDate = addDays(new Date(), -days);

  const request = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    dimensions,
    rowLimit: 5000,
  };

  const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(request),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    throw new Error(`Search Console API lỗi cho ${siteUrl}: HTTP ${res.getResponseCode()} - ${res.getContentText()}`);
  }

  const data = JSON.parse(res.getContentText());
  return data.rows || [];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  return Utilities.formatDate(date, 'GMT', 'yyyy-MM-dd');
}

/** Chạy hàm này thủ công 1 lần để test nhanh, xem log ở View → Logs (Ctrl+Enter). */
function testFirstSite() {
  syncSite(CONFIG.sites[0]);
}
