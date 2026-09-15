<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/account_auth.php';
header('Cache-Control: no-store');
function aslhub_claim_exit(): void {
    $_SESSION = [];
    session_regenerate_id(true);
    header('Location: index.php', true, 303); exit;
}
$id = (int)($_SESSION['claim_user_id'] ?? 0);
if (!$id || (int)($_SESSION['claim_expires'] ?? 0) < time()) aslhub_claim_exit();
$stmt = $pdo->prepare('SELECT first_name, last_name FROM users WHERE id = ? AND is_unclaimed = 1 AND is_teacher = 0 AND is_active = 1');
$stmt->execute([$id]);
$claimant = $stmt->fetch();
if (!$claimant) aslhub_claim_exit();
$error = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    aslhub_require_csrf(false);
    $password = (string)($_POST['new_password'] ?? '');
    $error = aslhub_personal_password_error($password, (string)($_POST['confirm_password'] ?? ''));
    if ($error === null) {
        try {
            // Conditional UPDATE permits exactly one winner if two claims race.
            aslhub_save_claim_password($pdo, $id, $password);
            aslhub_claim_exit();
        } catch (Throwable $e) {
            error_log('ASL password creation failed: ' . $e->getMessage());
            $error = 'Password could not be saved. Please try again.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Create password</title>
    <link rel="stylesheet" href="css/auth.css?v=<?php echo filemtime(__DIR__ . '/css/auth.css'); ?>">
</head>
<body class="auth-page">
<div class="login-container"><main class="login-card">
    <h1>ASL Hub</h1>
    <h2>Create password</h2>
    <?php if ($error !== null): ?><div class="message" role="alert"><?php echo aslhub_h($error); ?></div><?php endif; ?>
    <form action="create-password.php" method="POST">
        <input type="hidden" name="csrf_token" value="<?php echo aslhub_csrf_token(); ?>">
        <input type="text" name="username" value="<?php echo aslhub_h($claimant['first_name']); ?>" autocomplete="username" hidden>
        <input type="text" name="last_name" value="<?php echo aslhub_h($claimant['last_name']); ?>" autocomplete="family-name" hidden>
        <div class="form-group"><label for="new_password">New password</label>
            <input class="form-input" type="password" id="new_password" name="new_password" autocomplete="new-password" required></div>
        <div class="form-group"><label for="confirm_password">Confirm password</label>
            <input class="form-input" type="password" id="confirm_password" name="confirm_password" autocomplete="new-password" required></div>
        <button class="form-button" type="submit">Save password</button>
    </form>
</main></div>
</body>
</html>
