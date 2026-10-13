<?php
/**
 * Cài tracking đăng nhập LeadsTracking cho website Laravel 5.4 họ "tnadmin" (cùng code với xuongquaviet.com).
 *
 * Chạy ở thư mục gốc của website (nơi có file artisan):
 *     php laravel54-install.php <LOGIN_INGEST_API_KEY>
 *
 * Script chỉ sửa khi cấu trúc file khớp đúng mẫu; nếu không khớp sẽ dừng và KHÔNG đổi gì.
 * Chạy lại nhiều lần vẫn an toàn (bước nào đã làm thì bỏ qua). File bị sửa được sao lưu thành *.bak-lt.
 */

$ENDPOINT = 'https://leadstracking.nghiadang.site/api/login-events';
$key = isset($argv[1]) ? trim($argv[1]) : '';
if ($key === '') { fwrite(STDERR, "Thiếu API key. Dùng: php laravel54-install.php <KEY>\n"); exit(1); }

$root = getcwd();
$ctl  = $root . '/app/Http/Controllers/Auth/LoginController.php';
$svc  = $root . '/config/services.php';
$sup  = $root . '/app/Support/LeadsTracking.php';
$env  = $root . '/.env';
foreach ([$root . '/artisan', $ctl, $svc, $env] as $f) {
    if (!file_exists($f)) { fwrite(STDERR, "Không thấy $f - hãy chạy script ở thư mục gốc website.\n"); exit(1); }
}

// ---- 1. Kiểm tra mọi thứ TRƯỚC khi ghi bất cứ gì ----
$USE  = 'use App\Models\LogLogin;';
$SAVE = '$log_login->save();';
$INC  = '$this->incrementLoginAttempts($request);';
$ELSE_RE = '/(\}\s*else\s*\{[ \t]*\r?\n)([ \t]*)(Auth::guard\(\'web\'\)->logout\(\);)/';

$c = file_get_contents($ctl);
$ctlDone = strpos($c, 'LeadsTracking::reportLogin') !== false;
if (!$ctlDone) {
    foreach ([$USE, $SAVE] as $needle) {
        if (substr_count($c, $needle) !== 1) {
            fwrite(STDERR, "DỪNG: LoginController không khớp mẫu (cần đúng 1 dòng: $needle). Chưa sửa gì. Gửi file này cho người hỗ trợ.\n");
            exit(2);
        }
    }
    // Chỗ gắn báo "đăng nhập thất bại": bản có giới hạn số lần sai (incrementLoginAttempts) hoặc bản cũ "} else { logout".
    if (substr_count($c, $INC) === 1) {
        $failMode = 'inc';
    } elseif (preg_match_all($ELSE_RE, $c) === 1) {
        $failMode = 'else';
    } else {
        fwrite(STDERR, "DỪNG: không tìm thấy đúng 1 chỗ gắn báo đăng nhập thất bại trong LoginController. Chưa sửa gì. Gửi file này cho người hỗ trợ.\n");
        exit(2);
    }
}
$s = file_get_contents($svc);
$svcDone = strpos($s, "'leadstracking'") !== false;
if (!$svcDone && !preg_match('/\n\];\s*$/', $s)) {
    fwrite(STDERR, "DỪNG: config/services.php không có dạng mong đợi. Chưa sửa gì.\n");
    exit(2);
}

// ---- 2. Ghi ----
if (!is_dir(dirname($sup))) mkdir(dirname($sup), 0755, true);
file_put_contents($sup, <<<'LTPHP'
<?php

namespace App\Support;

/**
 * Báo lượt đăng nhập trang quản trị về LeadsTracking. Không gửi mật khẩu.
 * Cấu hình qua .env: LT_LOGIN_ENDPOINT, LT_LOGIN_API_KEY (xem config/services.php).
 * Chưa cấu hình thì bỏ qua, không ảnh hưởng đăng nhập.
 */
class LeadsTracking
{
    public static function reportLogin($username, $success)
    {
        $endpoint = config('services.leadstracking.endpoint');
        $apiKey   = config('services.leadstracking.api_key');
        if (!$endpoint || !$apiKey) {
            \Log::warning('[LeadsTracking] chưa có LT_LOGIN_ENDPOINT / LT_LOGIN_API_KEY (thiếu trong .env hoặc chưa chạy php artisan config:clear)');
            return;
        }
        if (!function_exists('curl_init')) {
            \Log::warning('[LeadsTracking] PHP trên hosting chưa bật extension curl');
            return;
        }

        try {
            $request = request();
            $payload = json_encode([
                'domain'     => $request->getHost(),
                'username'   => (string) $username,
                'success'    => (bool) $success,
                'ip'         => $request->server('HTTP_CF_CONNECTING_IP') ?: $request->ip(),
                'userAgent'  => substr((string) $request->server('HTTP_USER_AGENT'), 0, 500),
                'occurredAt' => gmdate('c'),
            ]);

            // Timeout ngắn để LeadsTracking chậm/tắt cũng không làm treo đăng nhập.
            $ch = curl_init($endpoint);
            curl_setopt_array($ch, [
                CURLOPT_POST              => true,
                CURLOPT_POSTFIELDS        => $payload,
                CURLOPT_HTTPHEADER        => ['Content-Type: application/json', 'x-api-key: ' . $apiKey],
                CURLOPT_RETURNTRANSFER    => true,
                CURLOPT_CONNECTTIMEOUT_MS => 800,
                CURLOPT_TIMEOUT_MS        => 1500,
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($body === false) {
                \Log::warning('[LeadsTracking] gửi thất bại: ' . curl_error($ch));
            } elseif ($code >= 300) {
                \Log::warning('[LeadsTracking] server trả ' . $code . ': ' . $body);
            }
            curl_close($ch);
        } catch (\Exception $e) {
            // Việc báo cáo không được phép làm hỏng đăng nhập: chỉ ghi log.
            \Log::warning('[LeadsTracking] lỗi: ' . $e->getMessage());
        }
    }
}
LTPHP
);
echo "OK app/Support/LeadsTracking.php\n";

if (!$ctlDone) {
    copy($ctl, $ctl . '.bak-lt');
    $c = str_replace($USE, $USE . "\nuse App\\Support\\LeadsTracking;", $c);
    $c = str_replace($SAVE, $SAVE . "\n            LeadsTracking::reportLogin(Auth::user()->email, true);", $c);
    if ($failMode === 'inc') {
        $c = str_replace($INC, $INC . "\n            LeadsTracking::reportLogin(\$request->txtEmail, false);", $c);
    } else {
        $c = preg_replace($ELSE_RE, '${1}${2}LeadsTracking::reportLogin($request->txtEmail, false);' . "\n" . '${2}${3}', $c);
    }
    file_put_contents($ctl, $c);
    echo "OK LoginController.php (bản gốc: LoginController.php.bak-lt)\n";
} else { echo "BỎ QUA LoginController.php (đã cài)\n"; }

if (!$svcDone) {
    copy($svc, $svc . '.bak-lt');
    $block = "\n    // Báo lượt đăng nhập admin về LeadsTracking (bỏ trống thì không báo)\n    'leadstracking' => [\n        'endpoint' => env('LT_LOGIN_ENDPOINT'),\n        'api_key' => env('LT_LOGIN_API_KEY'),\n    ],\n\n];\n";
    $s = preg_replace('/\n\];\s*$/', addcslashes($block, '\\$'), $s);
    file_put_contents($svc, $s);
    echo "OK config/services.php (bản gốc: services.php.bak-lt)\n";
} else { echo "BỎ QUA config/services.php (đã cài)\n"; }

$e = file_get_contents($env);
if (strpos($e, 'LT_LOGIN_ENDPOINT') === false) {
    file_put_contents($env, rtrim($e, "\n") . "\n\nLT_LOGIN_ENDPOINT=$ENDPOINT\nLT_LOGIN_API_KEY=$key\n");
    echo "OK .env (thêm LT_LOGIN_ENDPOINT, LT_LOGIN_API_KEY)\n";
} else { echo "BỎ QUA .env (đã có LT_LOGIN_ENDPOINT; kiểm tra lại giá trị bằng tay nếu cần)\n"; }

// ---- 3. Kiểm tra cú pháp + xoá cache config ----
foreach ([$sup, $ctl, $svc] as $f) {
    $out = []; exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $rc);
    if ($rc !== 0) { fwrite(STDERR, "LỖI cú pháp ở $f: " . implode(' ', $out) . "\nKhôi phục từ file .bak-lt rồi báo lại.\n"); exit(3); }
}
$cache = $root . '/bootstrap/cache/config.php';
if (file_exists($cache)) { unlink($cache); echo "OK xoá bootstrap/cache/config.php\n"; }
echo "XONG. Đăng xuất admin rồi đăng nhập lại để thử.\n";
