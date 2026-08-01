<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
taskAppStartSession();
header("Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');

$errorMessage = '';
$action = (string) ($_POST['action'] ?? '');
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'logout') {
    if (taskAppCsrfIsValid($_POST['csrf_token'] ?? null)) {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
    }
    header('Location: ./index.php');
    exit;
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'login') {
    if (!taskAppCsrfIsValid($_POST['csrf_token'] ?? null)) {
        $errorMessage = 'Please refresh the page and try again.';
    } elseif (!taskAppIsConfigured()) {
        $errorMessage = 'Task sync has not been configured yet.';
    } else {
        $blockedUntil = (int) ($_SESSION['task_app_login_blocked_until'] ?? 0);
        if ($blockedUntil > time()) {
            $errorMessage = 'Too many attempts. Please wait 15 minutes and try again.';
        } else {
            if ($blockedUntil > 0) {
                $_SESSION['task_app_login_attempts'] = 0;
                $_SESSION['task_app_login_blocked_until'] = 0;
            }
            $attempts = (int) ($_SESSION['task_app_login_attempts'] ?? 0);
            $password = (string) ($_POST['password'] ?? '');
            $hash = (string) taskAppConfig()['password_hash'];
            if ($password !== '' && password_verify($password, $hash)) {
                session_regenerate_id(true);
                $_SESSION['task_app_authenticated'] = true;
                $_SESSION['task_app_login_attempts'] = 0;
                $_SESSION['task_app_csrf'] = bin2hex(random_bytes(24));
                header('Location: ./index.php');
                exit;
            }
            $attempts++;
            $_SESSION['task_app_login_attempts'] = $attempts;
            if ($attempts >= 10) {
                $_SESSION['task_app_login_blocked_until'] = time() + 900;
            }
            usleep(250000);
            $errorMessage = 'That password was not accepted.';
        }
    }
}

$configured = taskAppIsConfigured();
$authenticated = $configured && taskAppIsAuthenticated();
$csrfToken = taskAppCsrfToken();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f4f7fb">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="My Tasks">
  <title>My Tasks</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="assets/icon-180.png">
  <link rel="stylesheet" href="assets/app.css">
</head>
<body>
<?php if (!$configured): ?>
  <main class="login-page"><section class="login-card">
    <img src="assets/icon.svg" alt=""><h1>Setup needed</h1>
    <p>The private password configuration has not been created. Follow the one-time cPanel steps in <code>tasks/CPANEL-SETUP.md</code>.</p>
  </section></main>
<?php elseif (!$authenticated): ?>
  <main class="login-page"><form class="login-card" method="post" autocomplete="on">
    <img src="assets/icon.svg" alt=""><h1>My Tasks</h1><p>Enter your task password.</p>
    <?php if ($errorMessage !== ''): ?><div class="login-error" role="alert"><?= htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
    <input type="hidden" name="action" value="login"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8') ?>">
    <label>Password<input type="password" name="password" required autofocus autocomplete="current-password"></label>
    <button class="primary" type="submit">Sign in</button>
  </form></main>
<?php else: ?>
  <?php define('TASK_APP_INTERNAL', true); require __DIR__ . '/views/app.php'; ?>
<?php endif; ?>
</body>
</html>
