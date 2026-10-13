<?php
/**
 * Cài tracking đăng nhập LeadsTracking cho website PHP thuần họ "quanly" (cùng code với sanxuatcaptuida.com).
 *
 * Chạy ở thư mục gốc của website (nơi có thư mục quanly/):
 *     php quanly-install.php <LOGIN_INGEST_API_KEY>
 *
 * Script chỉ sửa khi cấu trúc file khớp đúng mẫu; nếu không khớp sẽ dừng và KHÔNG đổi gì.
 * Chạy lại nhiều lần vẫn an toàn. File bị sửa được sao lưu thành *.bak-lt.
 */

$ENDPOINT = 'https://leadstracking.nghiadang.site/api/login-events';
$key = isset($argv[1]) ? trim($argv[1]) : '';
if ($key === '') { fwrite(STDERR, "Thiếu API key. Dùng: php quanly-install.php <KEY>\n"); exit(1); }

$root = getcwd();
$user = $root . '/quanly/sources/user.php';
$cfg  = $root . '/quanly/lib/config.php';
$lib  = $root . '/quanly/lib/leadstracking.php';
foreach ([$user, $cfg] as $f) {
    if (!file_exists($f)) { fwrite(STDERR, "Không thấy $f - hãy chạy script ở thư mục gốc website (nơi có thư mục quanly/).\n"); exit(1); }
}

// ---- 1. Kiểm tra mọi thứ TRƯỚC khi ghi bất cứ gì ----
$FN_RE   = '/(function\s+login\s*\(\s*\)\s*\{[ \t]*\r?\n[ \t]*global\s+\$d\s*,\s*\$login_name\s*;)/';
$OK      = '$_SESSION[\'login\'][\'username\'] = $username;';
$FAIL_RE = '/^([ \t]*)(transfer\("Tên đăng nhập, mật khẩu không chính xác")/m';

$u = file_get_contents($user);
$userDone = strpos($u, 'lt_report_login') !== false;
if (!$userDone) {
    if (preg_match_all($FN_RE, $u) !== 1 || substr_count($u, $OK) !== 1 || preg_match_all($FAIL_RE, $u) !== 1) {
        fwrite(STDERR, "DỪNG: quanly/sources/user.php không khớp mẫu (hàm login()). Chưa sửa gì. Gửi file này cho người hỗ trợ.\n");
        exit(2);
    }
}
$c = file_get_contents($cfg);
$cfgDone = strpos($c, "['leadstracking']") !== false;

// ---- 2. Ghi ----
file_put_contents($lib, <<<'LTPHP'
<?php
/**
 * Báo lượt đăng nhập trang quản trị về LeadsTracking. Không gửi mật khẩu.
 * Cấu hình trong lib/config.php (file này không commit):
 *   $config['leadstracking']['endpoint'] = 'https://<domain-leadstracking>/api/login-events';
 *   $config['leadstracking']['api_key']  = '<LOGIN_INGEST_API_KEY trên server>';
 * Chưa cấu hình thì bỏ qua, không ảnh hưởng đăng nhập.
 */
function lt_report_login($username, $success)
{
	global $config;
	$cfg = isset($config['leadstracking']) ? $config['leadstracking'] : array();
	if (empty($cfg['endpoint']) || empty($cfg['api_key'])) {
		error_log('[LeadsTracking] chưa cấu hình endpoint/api_key trong lib/config.php');
		return;
	}
	if (!function_exists('curl_init')) {
		error_log('[LeadsTracking] PHP chưa bật extension curl');
		return;
	}

	$payload = json_encode(array(
		'domain'     => isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '',
		'username'   => (string) $username,
		'success'    => (bool) $success,
		'ip'         => isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? $_SERVER['HTTP_CF_CONNECTING_IP'] : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''),
		'userAgent'  => isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : '',
		'occurredAt' => gmdate('c'),
	));

	// Timeout ngắn để LeadsTracking chậm/tắt cũng không làm treo đăng nhập.
	$ch = curl_init($cfg['endpoint']);
	curl_setopt_array($ch, array(
		CURLOPT_POST           => true,
		CURLOPT_POSTFIELDS     => $payload,
		CURLOPT_HTTPHEADER     => array('Content-Type: application/json', 'x-api-key: ' . $cfg['api_key']),
		CURLOPT_RETURNTRANSFER => true,
		CURLOPT_CONNECTTIMEOUT_MS => 800,
		CURLOPT_TIMEOUT_MS     => 1500,
	));
	$body = curl_exec($ch);
	$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	if ($body === false) {
		error_log('[LeadsTracking] gửi thất bại: ' . curl_error($ch));
	} elseif ($code >= 300) {
		error_log('[LeadsTracking] server trả ' . $code . ': ' . $body);
	}
	curl_close($ch);
}
LTPHP
);
echo "OK quanly/lib/leadstracking.php\n";

if (!$userDone) {
    copy($user, $user . '.bak-lt');
    $u = preg_replace($FN_RE, '$1' . "\n\tinclude_once _lib.\"leadstracking.php\";", $u, 1);
    $u = str_replace($OK, $OK . "\n\t\t\tlt_report_login(\$username, true);", $u);
    $u = preg_replace($FAIL_RE, '${1}lt_report_login($username, false);' . "\n" . '${1}${2}', $u, 1);
    file_put_contents($user, $u);
    echo "OK quanly/sources/user.php (bản gốc: user.php.bak-lt)\n";
} else { echo "BỎ QUA quanly/sources/user.php (đã cài)\n"; }

if (!$cfgDone) {
    copy($cfg, $cfg . '.bak-lt');
    $add = "\n// Báo lượt đăng nhập admin về LeadsTracking\n\$config['leadstracking']['endpoint'] = '$ENDPOINT';\n\$config['leadstracking']['api_key'] = '$key';\n";
    $pos = strrpos($c, '?>');
    $c = $pos === false ? rtrim($c) . "\n" . $add : substr($c, 0, $pos) . ltrim($add, "\n") . "\n" . substr($c, $pos);
    file_put_contents($cfg, $c);
    echo "OK quanly/lib/config.php (bản gốc: config.php.bak-lt)\n";
} else { echo "BỎ QUA quanly/lib/config.php (đã có cấu hình leadstracking; kiểm tra lại giá trị bằng tay nếu cần)\n"; }

// ---- 3. Kiểm tra cú pháp ----
foreach ([$lib, $user, $cfg] as $f) {
    $out = []; exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $rc);
    if ($rc !== 0) { fwrite(STDERR, "LỖI cú pháp ở $f: " . implode(' ', $out) . "\nKhôi phục từ file .bak-lt rồi báo lại.\n"); exit(3); }
}
echo "XONG. Đăng xuất admin rồi đăng nhập lại (đúng một lần, sai một lần) để thử.\n";
