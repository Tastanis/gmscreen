<?php
session_start();
require_once 'config.php';

$token = isset($_GET['token']) ? $_GET['token'] : '';
$valid_token = false;
$user_data = null;

if (!empty($token)) {
    try {
        // Check if token is valid and not expired
        $stmt = $pdo->prepare("
            SELECT id, first_name, last_name, email 
            FROM users 
            WHERE password_reset_token = ? 
            AND password_reset_expires > NOW()
        ");
        $stmt->execute([$token]);
        $user_data = $stmt->fetch();
        
        if ($user_data) {
            $valid_token = true;
        }
    } catch(PDOException $e) {
        error_log("Database error in reset_password.php: " . $e->getMessage());
    }
}

if ($_POST && $valid_token) {
    $new_password = trim($_POST['new_password']);
    $confirm_password = trim($_POST['confirm_password']);
    
    if (empty($new_password) || empty($confirm_password)) {
        $_SESSION['message'] = 'Please fill in all fields.';
        $_SESSION['message_type'] = 'error';
    } elseif ($new_password !== $confirm_password) {
        $_SESSION['message'] = 'Passwords do not match.';
        $_SESSION['message_type'] = 'error';
    } elseif (strlen($new_password) < 6) {
        $_SESSION['message'] = 'Password must be at least 6 characters long.';
        $_SESSION['message_type'] = 'error';
    } else {
        try {
            // Update password and clear reset token
            $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("
                UPDATE users 
                SET password = ?, password_reset_token = NULL, password_reset_expires = NULL 
                WHERE password_reset_token = ?
            ");
            $stmt->execute([$hashed_password, $token]);
            
            $_SESSION['message'] = 'Your password has been successfully reset. You can now log in with your new password.';
            $_SESSION['message_type'] = 'success';
            header('Location: index.php');
            exit;
            
        } catch(PDOException $e) {
            error_log("Database error in reset_password.php: " . $e->getMessage());
            $_SESSION['message'] = 'An error occurred while resetting your password. Please try again.';
            $_SESSION['message_type'] = 'error';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL Hub - Reset Password</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <div class="login-header">
                <h1>Reset Password</h1>
                <p class="login-subtitle">Enter your new password</p>
            </div>
            
            <?php if (isset($_SESSION['message'])): ?>
                <div class="message <?php echo $_SESSION['message_type']; ?>">
                    <?php echo $_SESSION['message']; ?>
                </div>
                <?php
                unset($_SESSION['message']);
                unset($_SESSION['message_type']);
                ?>
            <?php endif; ?>
            
            <?php if ($valid_token): ?>
                <div class="form-section">
                    <h2>Reset Password for <?php echo htmlspecialchars($user_data['first_name'] . ' ' . $user_data['last_name']); ?></h2>
                    <form action="reset_password.php?token=<?php echo htmlspecialchars($token); ?>" method="POST">
                        <div class="form-group">
                            <label for="new_password">New Password</label>
                            <input type="password" id="new_password" name="new_password" class="form-input" 
                                   placeholder="Enter your new password" required minlength="6">
                        </div>
                        <div class="form-group">
                            <label for="confirm_password">Confirm New Password</label>
                            <input type="password" id="confirm_password" name="confirm_password" class="form-input" 
                                   placeholder="Confirm your new password" required minlength="6">
                        </div>
                        <button type="submit" class="form-button">Reset Password</button>
                    </form>
                </div>
            <?php else: ?>
                <div class="form-section">
                    <h2>Invalid or Expired Link</h2>
                    <p>This password reset link is invalid or has expired. Please request a new password reset.</p>
                    <a href="index.php" class="form-button" style="display: inline-block; text-align: center; text-decoration: none;">
                        Back to Login
                    </a>
                </div>
            <?php endif; ?>
            
            <div class="text-center" style="margin-top: 20px;">
                <a href="index.php" class="back-btn">← Back to Login</a>
            </div>
        </div>
    </div>
</body>
</html>