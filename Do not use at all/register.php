<?php
session_start();
require_once 'config.php';

if ($_POST) {
    $preset_password = trim($_POST['preset_password']);
    $first_name = trim($_POST['first_name']);
    $last_name = trim($_POST['last_name']);
    $email = trim($_POST['email']);
    $password = trim($_POST['password']);
    $password_confirm = trim($_POST['password_confirm']);
    
    // Check preset password
    if ($preset_password !== 'MGHS') {
        $_SESSION['message'] = 'Invalid preset password.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    if (empty($first_name) || empty($last_name) || empty($email) || empty($password) || empty($password_confirm)) {
        $_SESSION['message'] = 'Please fill in all fields.';
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
    
    // Check password confirmation
    if ($password !== $password_confirm) {
        $_SESSION['message'] = 'Passwords do not match.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    // Password strength check
    if (strlen($password) < 6) {
        $_SESSION['message'] = 'Password must be at least 6 characters long.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    try {
        // Check if user already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE first_name = ? AND last_name = ?");
        $stmt->execute([$first_name, $last_name]);
        
        if ($stmt->fetch()) {
            $_SESSION['message'] = 'An account with this name already exists.';
            $_SESSION['message_type'] = 'error';
            header('Location: index.php');
            exit;
        }
        
        // Check if email already exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        
        if ($stmt->fetch()) {
            $_SESSION['message'] = 'An account with this email already exists.';
            $_SESSION['message_type'] = 'error';
            header('Location: index.php');
            exit;
        }
        
        // Create new user with custom password
        $hashed_password = password_hash($password, PASSWORD_DEFAULT);
        
        $stmt = $pdo->prepare("INSERT INTO users (first_name, last_name, email, password, is_teacher) VALUES (?, ?, ?, ?, FALSE)");
        $stmt->execute([$first_name, $last_name, $email, $hashed_password]);
        
        $_SESSION['message'] = 'Account created successfully! You can now login using your name and password.';
        $_SESSION['message_type'] = 'success';
        header('Location: index.php');
        exit;
        
    } catch(PDOException $e) {
        $_SESSION['message'] = 'Registration error. Please try again.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
}
?>