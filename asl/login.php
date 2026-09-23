<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/account_auth.php';
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit;
}
aslhub_require_csrf(false);

$first = trim((string)($_POST['first_name'] ?? ''));
$last = trim((string)($_POST['last_name'] ?? ''));
$identifier = $first . '|' . $last;
unset($_SESSION['claim_user_id'], $_SESSION['claim_expires']);
$password = (string)($_POST['password'] ?? '');

function aslhub_login_fail(string $msg): void {
    $_SESSION['message'] = $msg;
    $_SESSION['message_type'] = 'error';
    header('Location: index.php');
    exit;
}

if ($first === '' || $last === '' || $password === '') {
    aslhub_login_fail('Please fill in all fields.');
}
if (!aslhub_login_throttle($pdo, $identifier)) {
    aslhub_login_fail('Too many attempts. Wait a minute and try again.');
}

try {
    $authed = aslhub_authenticate($pdo, $first, $last, $password);

    if (!$authed) {
        aslhub_login_fail('First name, last name, or password is incorrect.');
    }

    aslhub_login_clear($pdo, $identifier);
    session_regenerate_id(true);
    $_SESSION = [];
    if (!empty($authed['is_unclaimed'])) {
        $_SESSION['claim_user_id'] = (int)$authed['id'];
        $_SESSION['claim_expires'] = time() + 900;
        aslhub_csrf_token();
        header('Location: create-password.php', true, 303);
        exit;
    }
    $_SESSION['user_id'] = (int)$authed['id'];
    $_SESSION['aslhub_csrf'] = null; // fresh token for the new session
    aslhub_csrf_token();

    if (!empty($authed['is_teacher'])) {
        header('Location: ' . (!empty($authed['must_change_password']) ? 'teacher/settings.php?change_pw=1' : 'teacher/grading.php'));
    } else {
        header('Location: dashboard.php');
    }
    exit;
} catch (Throwable $e) {
    error_log('ASL login error: ' . $e->getMessage());
    aslhub_login_fail('Login error. Please try again.');
}
