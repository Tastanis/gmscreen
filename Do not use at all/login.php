<?php
session_start();
require_once 'config.php';

if ($_POST) {
    $first_name = trim($_POST['first_name']);
    $last_name = trim($_POST['last_name']);
    $password = trim($_POST['password']);
    
    if (empty($first_name) || empty($last_name) || empty($password)) {
        $_SESSION['message'] = 'Please fill in all fields.';
        $_SESSION['message_type'] = 'error';
        header('Location: index.php');
        exit;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE first_name = ? AND last_name = ?");
        $stmt->execute([$first_name, $last_name]);
        $user = $stmt->fetch();
        
        if ($user) {
            // Check if this is the teacher account
            if ($user['is_teacher']) {
                // Teacher login - check specific password
                if ($password !== 'Dark-dude3') {
                    $_SESSION['message'] = 'Invalid teacher password.';
                    $_SESSION['message_type'] = 'error';
                    header('Location: index.php');
                    exit;
                }
            } else {
                // Student login - check MGHS password or stored password
                if ($password !== 'MGHS' && !password_verify($password, $user['password'])) {
                    $_SESSION['message'] = 'Invalid password.';
                    $_SESSION['message_type'] = 'error';
                    header('Location: index.php');
                    exit;
                }
            }
            
            // Login successful
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_first_name'] = $user['first_name'];
            $_SESSION['user_last_name'] = $user['last_name'];
            $_SESSION['is_teacher'] = $user['is_teacher'];
            
            // Redirect based on user type
            if ($user['is_teacher']) {
                header('Location: teacher_dashboard.php');
            } else {
                header('Location: dashboard.php');
            }
            exit;
        } else {
            $_SESSION['message'] = 'No account found with that name. Please create an account first.';
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