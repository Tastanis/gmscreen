<?php
session_start();
require_once 'config.php';

// Determine whether any teacher row already has a real bcrypt hash.
// If not, this page operates in "bootstrap" mode and lets the operator
// set an initial password without being logged in. Once a real hash
// exists, the page requires the current teacher password to rotate it.
function teacher_has_real_hash(PDO $pdo): bool {
    $stmt = $pdo->query("SELECT password FROM users WHERE is_teacher = TRUE");
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $hash) {
        if (!is_string($hash) || $hash === '') {
            continue;
        }
        $info = password_get_info($hash);
        if (!empty($info['algo'])) {
            return true;
        }
    }
    return false;
}

$bootstrap = !teacher_has_real_hash($pdo);
$is_logged_in_teacher = !empty($_SESSION['user_id']) && !empty($_SESSION['is_teacher']);

$message = '';
$message_type = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $new_password = trim($_POST['new_password'] ?? '');
    $confirm_password = trim($_POST['confirm_password'] ?? '');
    $current_password = trim($_POST['current_password'] ?? '');

    if (!$bootstrap && !$is_logged_in_teacher) {
        $message = 'You must be logged in as the teacher to change the password.';
        $message_type = 'error';
    } elseif ($new_password === '' || $confirm_password === '') {
        $message = 'Please fill in all password fields.';
        $message_type = 'error';
    } elseif ($new_password !== $confirm_password) {
        $message = 'New passwords do not match.';
        $message_type = 'error';
    } elseif (strlen($new_password) < 10) {
        $message = 'New password must be at least 10 characters long.';
        $message_type = 'error';
    } else {
        $allow = $bootstrap;
        if (!$bootstrap) {
            // Rotation: verify current password against any teacher hash.
            $stmt = $pdo->query("SELECT password FROM users WHERE is_teacher = TRUE");
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $hash) {
                if (is_string($hash) && $hash !== '' && password_verify($current_password, $hash)) {
                    $allow = true;
                    break;
                }
            }
            if (!$allow) {
                $message = 'Current password is incorrect.';
                $message_type = 'error';
            }
        }

        if ($allow) {
            $new_hash = password_hash($new_password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE is_teacher = TRUE");
            $stmt->execute([$new_hash]);
            $message = 'Teacher password updated. You can now log in with the new password.';
            $message_type = 'success';
            $bootstrap = false;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Set Teacher Password - ASL 1</title>
    <link rel="stylesheet" href="css/asl-style.css">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f7; margin: 0; padding: 40px 20px; }
        .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        h1 { margin: 0 0 8px; font-size: 24px; color: #1d1d1f; }
        p.subtitle { margin: 0 0 24px; color: #6e6e73; font-size: 14px; }
        label { display: block; margin-top: 16px; font-size: 13px; color: #1d1d1f; font-weight: 500; }
        input[type=password] { width: 100%; box-sizing: border-box; padding: 10px 12px; margin-top: 6px; border: 1px solid #d2d2d7; border-radius: 8px; font-size: 14px; }
        button { margin-top: 24px; width: 100%; padding: 12px; background: #0071e3; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
        button:hover { background: #0077ed; }
        .msg { margin: 16px 0; padding: 12px 14px; border-radius: 8px; font-size: 14px; }
        .msg.error { background: #ffe9e9; color: #8a1a1a; }
        .msg.success { background: #e6f7ec; color: #1a6b3a; }
        .mode-badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; background: #eef3ff; color: #0040a8; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Set Teacher Password</h1>
        <p class="subtitle">
            ASL 1
            <span class="mode-badge"><?php echo $bootstrap ? 'Initial setup' : 'Change password'; ?></span>
        </p>

        <?php if ($message): ?>
            <div class="msg <?php echo htmlspecialchars($message_type); ?>">
                <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>

        <?php if (!$bootstrap && !$is_logged_in_teacher && $message_type !== 'success'): ?>
            <p>The teacher password is already set. Log in first, then return here to change it.</p>
            <p><a href="index.php">Back to login</a></p>
        <?php else: ?>
            <form method="post" autocomplete="off">
                <?php if (!$bootstrap): ?>
                    <label for="current_password">Current password</label>
                    <input id="current_password" type="password" name="current_password" required>
                <?php endif; ?>

                <label for="new_password">New password (at least 10 characters)</label>
                <input id="new_password" type="password" name="new_password" minlength="10" required>

                <label for="confirm_password">Confirm new password</label>
                <input id="confirm_password" type="password" name="confirm_password" minlength="10" required>

                <button type="submit"><?php echo $bootstrap ? 'Set password' : 'Update password'; ?></button>
            </form>
            <p style="margin-top: 16px;"><a href="index.php">Back to login</a></p>
        <?php endif; ?>
    </div>
</body>
</html>
