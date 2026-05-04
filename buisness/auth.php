<?php
// Buisness portal - simple session-based auth.
// Uses a dedicated session name so it cannot collide with the dnd or asl portals.

if (session_status() === PHP_SESSION_NONE) {
    session_name('buisness_session');
    session_start();
}

const BUISNESS_USER = 'Bharms';
const BUISNESS_PASS = 'Harms';

function buisness_is_logged_in(): bool {
    return !empty($_SESSION['buisness_logged_in']) && $_SESSION['buisness_logged_in'] === true;
}

function buisness_require_login(): void {
    if (!buisness_is_logged_in()) {
        header('Location: index.php');
        exit;
    }
}

function buisness_require_login_api(): void {
    if (!buisness_is_logged_in()) {
        http_response_code(401);
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'error' => 'unauthorized']);
        exit;
    }
}

function buisness_attempt_login(string $username, string $password): bool {
    if ($username === BUISNESS_USER && $password === BUISNESS_PASS) {
        $_SESSION['buisness_logged_in'] = true;
        return true;
    }
    return false;
}

function buisness_logout(): void {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']
        );
    }
    session_destroy();
}
