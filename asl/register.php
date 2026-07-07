<?php
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit;
}
aslhub_require_csrf(false);

$first_name = trim($_POST['first_name'] ?? '');
$last_name = trim($_POST['last_name'] ?? '');
$email = mb_strtolower(trim($_POST['email'] ?? ''));
$teacher = $_POST['teacher'] ?? '';
$period = (int)($_POST['class_period'] ?? 0);
$level = (int)($_POST['level'] ?? 0);
$password = (string)($_POST['password'] ?? '');
$confirm = (string)($_POST['password_confirm'] ?? '');
$code = trim($_POST['preset_password'] ?? '');

$errors = [];
$settings = aslhub_year_settings($pdo);

if (!hash_equals($settings['signup_code'], $code)) $errors[] = 'That class signup code is not correct. Ask your teacher.';
if ($first_name === '' || $last_name === '') $errors[] = 'Please enter your first and last name.';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Please enter a valid email address.';
if (!array_key_exists($teacher, aslhub_valid_teachers())) $errors[] = 'Please choose your teacher.';
if ($period < 1 || $period > 6) $errors[] = 'Please choose your class period.';
if ($level < 1 || $level > 3) $errors[] = 'Please choose your ASL level.';
if (strlen($password) < 6) $errors[] = 'Password must be at least 6 characters.';
if ($password !== $confirm) $errors[] = 'Passwords do not match.';

if (!$errors) {
    try {
        $stmt = $pdo->prepare("SELECT id, is_active FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($existing = $stmt->fetch()) {
            $errors[] = (int)$existing['is_active'] === 1
                ? 'An account with this email already exists. Try logging in instead.'
                : 'An account with this email exists but is deactivated. Ask your teacher to reactivate it.';
        }
    } catch (PDOException $e) {
        error_log('ASL register lookup: ' . $e->getMessage());
        $errors[] = 'Something went wrong. Please try again.';
    }
}

if ($errors) {
    $_SESSION['signup_errors'] = $errors;
    $_SESSION['signup_old'] = [
        'first_name' => $first_name, 'last_name' => $last_name, 'email' => $email,
        'teacher' => $teacher, 'class_period' => $period, 'level' => $level,
    ];
    header('Location: index.php');
    exit;
}

try {
    $stmt = $pdo->prepare("INSERT INTO users
        (first_name, last_name, email, password, is_teacher, level, class_period, teacher, is_active)
        VALUES (?, ?, ?, ?, FALSE, ?, ?, ?, 1)");
    $stmt->execute([$first_name, $last_name, $email, password_hash($password, PASSWORD_DEFAULT), $level, $period, $teacher]);

    // Log them straight in
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$pdo->lastInsertId();
    $_SESSION['aslhub_csrf'] = null;
    aslhub_csrf_token();
    header('Location: dashboard.php');
    exit;
} catch (PDOException $e) {
    error_log('ASL register insert: ' . $e->getMessage());
    $_SESSION['message'] = 'Could not create the account. Please try again.';
    $_SESSION['message_type'] = 'error';
    header('Location: index.php');
    exit;
}
