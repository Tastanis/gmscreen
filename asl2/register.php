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
    
    // Get level from form (should be 2 for ASL 2)
    $level = isset($_POST['level']) ? intval($_POST['level']) : 2;
    
    try {
        // Check if user already exists at this level
        $stmt = $pdo->prepare("SELECT id FROM users WHERE first_name = ? AND last_name = ? AND level = ?");
        $stmt->execute([$first_name, $last_name, $level]);
        
        if ($stmt->fetch()) {
            $_SESSION['message'] = 'An account with this name already exists for ASL ' . $level . '.';
            $_SESSION['message_type'] = 'error';
            header('Location: index.php');
            exit;
        }
        
        // Check if email already exists at this level
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND level = ?");
        $stmt->execute([$email, $level]);
        
        if ($stmt->fetch()) {
            $_SESSION['message'] = 'An account with this email already exists for ASL ' . $level . '.';
            $_SESSION['message_type'] = 'error';
            header('Location: index.php');
            exit;
        }
        
        // Check if someone with the same first name already uses this password or 'MGHS'
        $stmt = $pdo->prepare("SELECT id, password FROM users WHERE first_name = ? AND level = ? AND is_teacher = FALSE");
        $stmt->execute([$first_name, $level]);
        $same_name_users = $stmt->fetchAll();
        
        foreach ($same_name_users as $same_name_user) {
            // Check if they're trying to use MGHS password when someone with same name already uses MGHS
            if ($password === 'MGHS') {
                $_SESSION['message'] = 'Another student named ' . $first_name . ' already uses the default password "MGHS". Please choose a unique password for your account.';
                $_SESSION['message_type'] = 'error';
                header('Location: index.php');
                exit;
            }
            // Check if they're trying to use the same custom password as someone with the same name
            if (password_verify($password, $same_name_user['password'])) {
                $_SESSION['message'] = 'Another student named ' . $first_name . ' already uses that password. Please choose a different password for your account.';
                $_SESSION['message_type'] = 'error';
                header('Location: index.php');
                exit;
            }
        }
        
        // Create new user with custom password and level
        $hashed_password = password_hash($password, PASSWORD_DEFAULT);
        
        $stmt = $pdo->prepare("INSERT INTO users (first_name, last_name, email, password, is_teacher, level) VALUES (?, ?, ?, ?, FALSE, ?)");
        $stmt->execute([$first_name, $last_name, $email, $hashed_password, $level]);
        
        $_SESSION['message'] = 'ASL ' . $level . ' account created successfully! You can now login using your name and password.';
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