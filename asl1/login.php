<?php
session_start();
require_once 'config.php';

if ($_POST) {
    $first_name = trim($_POST['first_name']);
    $password = trim($_POST['password']);
    
    if (empty($first_name) || empty($password)) {
        $_SESSION['message'] = 'Please fill in all fields.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    try {
        // Get ALL users with this first name (could be multiple)
        $stmt = $pdo->prepare("SELECT * FROM users WHERE first_name = ? AND (level = 1 OR is_teacher = TRUE)");
        $stmt->execute([$first_name]);
        $users = $stmt->fetchAll();
        
        if ($users) {
            $authenticated_user = null;
            
            // Try to authenticate against each user with this first name
            foreach ($users as $user) {
                // Check if this is the teacher account
                if ($user['is_teacher']) {
                    // Teacher login - check specific password
                    if ($password === 'Dark-dude3') {
                        $authenticated_user = $user;
                        break;
                    }
                } else {
                    // Student login - check MGHS password or stored password
                    if ($password === 'MGHS' || password_verify($password, $user['password'])) {
                        $authenticated_user = $user;
                        break;
                    }
                }
            }
            
            if ($authenticated_user) {
                // Login successful
                $_SESSION['user_id'] = $authenticated_user['id'];
                $_SESSION['user_first_name'] = $authenticated_user['first_name'];
                $_SESSION['user_last_name'] = $authenticated_user['last_name'];
                $_SESSION['is_teacher'] = $authenticated_user['is_teacher'];
                $_SESSION['user_level'] = $authenticated_user['level'] ?? 1;
                $_SESSION['class_period'] = $authenticated_user['class_period'] ?? null;
                
                // Redirect based on user type
                if ($authenticated_user['is_teacher']) {
                    header('Location: teacher_dashboard.php');
                } else {
                    header('Location: dashboard.php');
                }
                exit;
            } else {
                $_SESSION['message'] = 'Invalid password.';
                $_SESSION['message_type'] = 'error';
                header('Location: index.php');
                exit;
            }
        } else {
            $_SESSION['message'] = 'No ASL 1 account found with that name. Please create an account first.';
            $_SESSION['message_type'] = 'error';
            header('Location: index.php');
            exit;
        }
    } catch(PDOException $e) {
        $_SESSION['message'] = 'Login error. Please try again.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
}
?>