<?php
session_start();
require_once 'config.php';

// Bootstrap mode: allow setting the teacher password without auth ONLY if no
// valid bcrypt hash is currently stored on any teacher row. Once a real hash
// is in place, the page requires being logged in as a teacher to rotate it.
function teacher_needs_bootstrap(PDO $pdo): bool
{
    try {
        $stmt = $pdo->query("SELECT password FROM users WHERE is_teacher = TRUE");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        return false;
    }
    if (!$rows) {
        return false;
    }
    foreach ($rows as $row) {
        $hash = $row['password'] ?? '';
        if (is_string($hash) && preg_match('/^\$2[ayb]\$\d{2}\$.{50,}$/', $hash)) {
            return false;
        }
    }
    return true;
}

$bootstrap = teacher_needs_bootstrap($pdo);
$is_teacher_session = !empty($_SESSION['is_teacher']);
$allowed = $bootstrap || $is_teacher_session;

$message = '';
$message_type = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$allowed) {
        http_response_code(403);
        $message = 'Not allowed. Log in as a teacher to change the password.';
        $message_type = 'error';
    } else {
        $current = $_POST['current_password'] ?? '';
        $new = (string) ($_POST['new_password'] ?? '');
        $confirm = (string) ($_POST['confirm_password'] ?? '');

        // When not in bootstrap mode, require the current teacher password too.
        $current_ok = $bootstrap;
        if (!$bootstrap) {
            try {
                $stmt = $pdo->prepare("SELECT password FROM users WHERE id = ? AND is_teacher = TRUE");
                $stmt->execute([$_SESSION['user_id'] ?? 0]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row && !empty($row['password']) && password_verify($current, $row['password'])) {
                    $current_ok = true;
                }
            } catch (PDOException $e) {
                $current_ok = false;
            }
        }

        if (!$current_ok) {
            $message = 'Current password is incorrect.';
            $message_type = 'error';
        } elseif (strlen($new) < 10) {
            $message = 'New password must be at least 10 characters.';
            $message_type = 'error';
        } elseif ($new !== $confirm) {
            $message = 'New passwords do not match.';
            $message_type = 'error';
        } else {
            $hash = password_hash($new, PASSWORD_DEFAULT);
            try {
                $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE is_teacher = TRUE");
                $stmt->execute([$hash]);
                $message = 'Teacher password updated. You can now log in with the new password.';
                $message_type = 'success';
                $bootstrap = false;
            } catch (PDOException $e) {
                $message = 'Database error updating password.';
                $message_type = 'error';
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Set Teacher Password - ASL Hub</title>
    <link rel="stylesheet" href="css/asl-style.css">
    <style>
        .pw-shell { max-width: 520px; margin: 60px auto; padding: 28px; background: #fff;
            border: 1px solid rgba(210, 210, 215, 0.8); border-radius: 12px;
            box-shadow: 0 16px 42px rgba(0, 0, 0, 0.06); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif; color: #1d1d1f; }
        .pw-shell h1 { margin: 0 0 4px; font-size: 1.5rem; }
        .pw-shell p.kicker { color: #6e6e73; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; margin: 0 0 16px; }
        .pw-shell label { display: grid; gap: 6px; margin: 14px 0; }
        .pw-shell label span { font-weight: 600; font-size: 0.9rem; }
        .pw-shell input { border: 1px solid #d2d2d7; border-radius: 8px; padding: 10px 12px; font: inherit; min-height: 42px; }
        .pw-shell input:focus { outline: none; border-color: #0071e3; box-shadow: 0 0 0 3px rgba(0,113,227,0.18); }
        .pw-shell button { background: #0071e3; color: #fff; border: 0; border-radius: 8px; padding: 11px 18px; font: inherit; font-weight: 600; cursor: pointer; min-height: 44px; }
        .pw-shell button:hover { background: #0062c4; }
        .pw-msg { padding: 10px 14px; border-radius: 8px; font-weight: 600; margin: 14px 0; }
        .pw-msg.success { background: #e8faec; color: #248a3d; border: 1px solid #b6efc4; }
        .pw-msg.error { background: #fff1f2; color: #b4233a; border: 1px solid #fecdd3; }
        .pw-note { background: #fbfbfd; border: 1px solid #e8e8ed; border-radius: 8px; padding: 12px; font-size: 0.88rem; color: #6e6e73; margin-top: 18px; }
        .pw-back { display: inline-block; margin-top: 18px; color: #0071e3; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body class="student-dashboard-page">
    <div class="pw-shell">
        <p class="kicker">ASL Hub</p>
        <h1>Set Teacher Password</h1>

        <?php if ($message): ?>
            <div class="pw-msg <?php echo htmlspecialchars($message_type); ?>">
                <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>

        <?php if (!$allowed): ?>
            <p>This page is only available during initial setup, or when logged in as the teacher.</p>
            <a class="pw-back" href="index.php">Back to login</a>
        <?php else: ?>
            <p>
                <?php if ($bootstrap): ?>
                    No teacher password is set yet. Choose a strong one below to enable teacher login.
                <?php else: ?>
                    Logged in as teacher. Confirm your current password and choose a new one.
                <?php endif; ?>
            </p>

            <form method="POST" autocomplete="off">
                <?php if (!$bootstrap): ?>
                    <label>
                        <span>Current Password</span>
                        <input type="password" name="current_password" required autocomplete="current-password">
                    </label>
                <?php endif; ?>
                <label>
                    <span>New Password (10+ characters)</span>
                    <input type="password" name="new_password" required minlength="10" autocomplete="new-password">
                </label>
                <label>
                    <span>Confirm New Password</span>
                    <input type="password" name="confirm_password" required minlength="10" autocomplete="new-password">
                </label>
                <button type="submit">Save Password</button>
            </form>

            <div class="pw-note">
                After saving, return to the <a href="index.php">login page</a> and sign in
                as <strong>Brandon</strong> with your new password.
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
