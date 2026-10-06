<?php
/**
 * Plugin Name: LeadsTracking Login Reporter
 * Description: Báo mỗi lượt đăng nhập (thành công/thất bại) trang admin về LeadsTracking. Không gửi mật khẩu.
 *
 * Cài đặt: chép file này vào wp-content/mu-plugins/ của từng website, rồi thêm vào wp-config.php:
 *   define('LT_LOGIN_ENDPOINT', 'https://<domain-leadstracking>/api/login-events');
 *   define('LT_LOGIN_API_KEY',  '<giá trị LOGIN_INGEST_API_KEY trên server>');
 * Domain của website được lấy tự động từ home_url() và phải khớp Website.domain trong LeadsTracking.
 */

if (!defined('ABSPATH')) exit;

function lt_report_login($username, $success) {
    if (!defined('LT_LOGIN_ENDPOINT') || !defined('LT_LOGIN_API_KEY')) return;

    $ip = isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? $_SERVER['HTTP_CF_CONNECTING_IP']
        : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');

    // blocking=false: không làm chậm đăng nhập, cũng không lỗi nếu LeadsTracking đang tắt.
    wp_remote_post(LT_LOGIN_ENDPOINT, array(
        'timeout'  => 3,
        'blocking' => false,
        'headers'  => array('Content-Type' => 'application/json', 'x-api-key' => LT_LOGIN_API_KEY),
        'body'     => wp_json_encode(array(
            'domain'     => wp_parse_url(home_url(), PHP_URL_HOST),
            'username'   => (string) $username,
            'success'    => (bool) $success,
            'ip'         => $ip,
            'userAgent'  => isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : '',
            'occurredAt' => gmdate('c'),
        )),
    ));
}

add_action('wp_login', function ($user_login) { lt_report_login($user_login, true); }, 10, 1);
add_action('wp_login_failed', function ($username) { lt_report_login($username, false); }, 10, 1);
