<?php
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit;
}
aslhub_require_csrf(false);

$identifier = trim($_POST['identifier'] ?? '');
$password = (string)($_POST['password'] ?? '');

function aslhub_login_fail(string $msg): void {
    $_SESSION['message'] = $msg;
    $_SESSION['message_type'] = 'error';
    header('Location: index.php');
    exit;
}

if ($identifier === '' || $password === '') {
    aslhub_login_fail('Please fill in all fields.');
}
if (!aslhub_login_throttle($pdo, $identifier)) {
    aslhub_login_fail('Too many attempts. Wait a minute and try again.');
}

try {
    // Match by email (exact) or first name (may match several students)
    $stmt = $pdo->prepare("SELECT * FROM users WHERE (email = ? OR first_name = ?) AND is_active = 1");
    $stmt->execute([$identifier, $identifier]);
    $candidates = $stmt->fetchAll();

    $authed = null;
    foreach ($candidates as $user) {
        if (!empty($user['password']) && password_verify($password, $user['password'])) {
            $authed = $user;
            break;
        }
    }

    if (!$authed) {
        aslhub_login_fail($candidates ? 'Invalid password.' : 'No account found with that name or email.');
    }

    aslhub_login_clear($pdo, $identifier);
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$authed['id'];
    $_SESSION['aslhub_csrf'] = null; // fresh token for the new session
    aslhub_csrf_token();

    if (!empty($authed['is_teacher'])) {
        header('Location: ' . (!empty($authed['must_change_password']) ? 'teacher/settings.php?change_pw=1' : 'teacher/dashboard.php'));
    } else {
        header('Location: dashboard.php');
    }
    exit;
} catch (PDOException $e) {
    error_log('ASL login error: ' . $e->getMessage());
    aslhub_login_fail('Login error. Please try again.');
}
