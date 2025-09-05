<?php
session_start();
require_once 'config.php';

if ($_POST) {
    $email = trim($_POST['email']);
    
    if (empty($email)) {
        $_SESSION['message'] = 'Please enter your email address.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    // Validate email
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $_SESSION['message'] = 'Please enter a valid email address.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    try {
        // Check if email exists
        $stmt = $pdo->prepare("SELECT id, first_name, last_name FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        
        if ($user) {
            // Generate password reset token
            $token = bin2hex(random_bytes(32));
            $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));
            
            // Store token in database
            $stmt = $pdo->prepare("UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE email = ?");
            $stmt->execute([$token, $expires, $email]);
            
            // Create reset link
            $reset_link = "http://" . $_SERVER['HTTP_HOST'] . dirname($_SERVER['REQUEST_URI']) . "/reset_password.php?token=" . $token;
            
            // Email content
            $subject = "ASL Hub - Password Reset Request";
            $message = "Hello " . $user['first_name'] . " " . $user['last_name'] . ",\n\n";
            $message .= "You have requested to reset your password for your ASL Hub account.\n\n";
            $message .= "Your login information:\n";
            $message .= "First Name: " . $user['first_name'] . "\n";
            $message .= "Last Name: " . $user['last_name'] . "\n";
            $message .= "Email: " . $email . "\n\n";
            $message .= "To reset your password, click the following link:\n";
            $message .= $reset_link . "\n\n";
            $message .= "This link will expire in 1 hour.\n\n";
            $message .= "If you did not request this password reset, please ignore this email.\n\n";
            $message .= "Best regards,\n";
            $message .= "ASL Hub Team";
            
            $headers = "From: noreply@aslhub.com\r\n";
            $headers .= "Reply-To: noreply@aslhub.com\r\n";
            $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
            
            // Send email (in production, you'd use a proper email service)
            // For now, we'll just show a success message
            if (mail($email, $subject, $message, $headers)) {
                $_SESSION['message'] = 'Password reset instructions have been sent to your email address.';
                $_SESSION['message_type'] = 'success';
            } else {
                // Even if email fails, show success message for security
                $_SESSION['message'] = 'If an account with that email exists, password reset instructions have been sent.';
                $_SESSION['message_type'] = 'success';
            }
        } else {
            // For security, always show success message even if email doesn't exist
            $_SESSION['message'] = 'If an account with that email exists, password reset instructions have been sent.';
            $_SESSION['message_type'] = 'success';
        }
        
    } catch(PDOException $e) {
        error_log("Database error in forgot_password.php: " . $e->getMessage());
        $_SESSION['message'] = 'An error occurred. Please try again later.';
        $_SESSION['message_type'] = 'error';
    }
    
    header('Location: index.php');
    exit;
}
?>