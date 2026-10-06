<?php

/**
 * Báo mỗi lượt đăng nhập (thành công/thất bại) của website Laravel về LeadsTracking. Không gửi mật khẩu.
 *
 * Cài đặt:
 *  1. Chép file này vào app/Providers/LeadsTrackingLoginServiceProvider.php
 *  2. Đăng ký provider: Laravel 11+ thêm App\Providers\LeadsTrackingLoginServiceProvider::class vào bootstrap/providers.php;
 *     Laravel 10 trở xuống thêm vào mảng 'providers' trong config/app.php.
 *  3. Thêm vào .env của website:
 *       LT_LOGIN_ENDPOINT=https://<domain-leadstracking>/api/login-events
 *       LT_LOGIN_API_KEY=<giá trị LOGIN_INGEST_API_KEY trên server>
 *  4. php artisan config:clear
 *
 * Domain lấy tự động từ APP_URL, phải khớp Website.domain trong LeadsTracking.
 * Mặc định theo dõi guard 'web'. Nếu trang admin dùng guard khác (vd. 'admin'), sửa $guards bên dưới.
 */

namespace App\Providers;

use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

class LeadsTrackingLoginServiceProvider extends ServiceProvider
{
    /** Guard của trang admin cần theo dõi. */
    private array $guards = ['web'];

    public function boot(): void
    {
        if (!env('LT_LOGIN_ENDPOINT') || !env('LT_LOGIN_API_KEY')) {
            return;
        }

        Event::listen(Login::class, function (Login $e) {
            if (!in_array($e->guard, $this->guards, true)) return;
            $user = $e->user;
            $this->report($user->email ?? $user->username ?? $user->name ?? (string) $user->getAuthIdentifier(), true);
        });

        Event::listen(Failed::class, function (Failed $e) {
            if (!in_array($e->guard, $this->guards, true)) return;
            $c = $e->credentials;
            $this->report($c['email'] ?? $c['username'] ?? $c['name'] ?? 'unknown', false);
        });
    }

    private function report(string $username, bool $success): void
    {
        $payload = [
            'domain'     => parse_url(config('app.url'), PHP_URL_HOST),
            'username'   => $username,
            'success'    => $success,
            'ip'         => request()->ip(),
            'userAgent'  => substr((string) request()->userAgent(), 0, 500),
            'occurredAt' => now()->toIso8601String(),
        ];

        // Gửi sau khi đã trả response cho người dùng; lỗi mạng/LeadsTracking tắt thì chỉ ghi log, không ảnh hưởng đăng nhập.
        dispatch(function () use ($payload) {
            try {
                Http::timeout(3)
                    ->withHeaders(['x-api-key' => env('LT_LOGIN_API_KEY')])
                    ->post(env('LT_LOGIN_ENDPOINT'), $payload);
            } catch (\Throwable $ex) {
                Log::warning('LeadsTracking login report failed: ' . $ex->getMessage());
            }
        })->afterResponse();
    }
}
