<?php
require_once __DIR__ . '/config.php';

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
    <?php $cssV = @filemtime(__DIR__ . '/css/asl-style.css') ?: 1; $hubV = @filemtime(__DIR__ . '/css/hub.css') ?: 1; ?>
    <link rel="stylesheet" href="css/asl-style.css?v=<?php echo $cssV; ?>">
    <link rel="stylesheet" href="css/hub.css?v=<?php echo $hubV; ?>">
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <div class="login-header">
                <h1>ASL Hub</h1>
                <div class="level-indicator">ASL 1 &middot; 2 &middot; 3</div>
                <p class="login-subtitle">Your ASL Learning Portal</p>
            </div>

            <?php if (isset($_SESSION['message'])): ?>
                <div class="message <?php echo aslhub_h($_SESSION['message_type'] ?? 'info'); ?>">
                    <?php echo aslhub_h($_SESSION['message']); ?>
                </div>
                <?php unset($_SESSION['message'], $_SESSION['message_type']); ?>
            <?php endif; ?>

            <div class="form-section">
                <h2>Student &amp; Teacher Login</h2>
                <form action="login.php" method="POST">
                    <input type="hidden" name="csrf_token" value="<?php echo $csrf; ?>">
                    <div class="form-group">
                        <label for="identifier">First Name or Email</label>
                        <input type="text" id="identifier" name="identifier" class="form-input" placeholder="First name or school email" required autocomplete="username">
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" class="form-input" placeholder="Enter your password" required autocomplete="current-password">
                    </div>
                    <button type="submit" class="form-button">Login</button>
                </form>
                <a href="signup.php" class="form-button create-account-btn" style="display:block;text-align:center;text-decoration:none;">Create New Account</a>
            </div>

            <div class="text-center" style="margin-top: 20px;">
                <a href="../" class="back-btn">&larr; Back to Main Portal</a>
            </div>
        </div>
    </div>
</body>
</html>
