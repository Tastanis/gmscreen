<?php
require_once __DIR__ . '/config.php';
header('Cache-Control: no-store');

// Already logged in? Go to the right dashboard.
$me = aslhub_current_user($pdo);
if ($me) {
    header('Location: ' . (!empty($me['is_teacher']) ? 'teacher/dashboard.php' : 'dashboard.php'));
    exit;
}

$csrf = aslhub_csrf_token();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Login</title>
    <link rel="stylesheet" href="css/auth.css?v=<?php echo filemtime(__DIR__ . '/css/auth.css'); ?>">
</head>
<body class="auth-page">
    <div class="login-container">
        <div class="login-card">
            <div class="login-header">
                <h1>ASL Hub</h1>
            </div>

            <?php if (isset($_SESSION['message']) && ($_SESSION['message_type'] ?? '') === 'error'): ?>
                <div class="message" role="alert">
                    <?php echo aslhub_h($_SESSION['message']); ?>
                </div>
            <?php endif; ?>
            <?php unset($_SESSION['message'], $_SESSION['message_type']); ?>

            <div class="form-section">
                <h2>Login</h2>
                <form action="login.php" method="POST">
                    <input type="hidden" name="csrf_token" value="<?php echo $csrf; ?>">
                    <div class="form-group">
                        <label for="first_name">First name</label>
                        <input type="text" id="first_name" name="first_name" class="form-input" required autocomplete="username" autocapitalize="none" spellcheck="false">
                    </div>
                    <div class="form-group">
                        <label for="last_name">Last name</label>
                        <input type="text" id="last_name" name="last_name" class="form-input" required autocomplete="family-name" autocapitalize="none" spellcheck="false">
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" class="form-input" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="form-button">Login</button>
                </form>
            </div>

        </div>
    </div>
</body>
</html>
