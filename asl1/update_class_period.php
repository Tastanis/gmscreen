<?php
session_start();
require_once 'config.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not logged in']);
    exit;
}

// Check if this is a teacher (teachers don't have class periods)
if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Teachers cannot set class periods']);
    exit;
}

// Validate input
if (!isset($_POST['class_period'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing class period parameter']);
    exit;
}

$class_period = $_POST['class_period'];

// Validate class period (empty string for unselected, or 1-6)
if ($class_period !== '' && ($class_period < 1 || $class_period > 6)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid class period. Must be 1-6']);
    exit;
}

// Convert empty string to NULL for database
$class_period = $class_period === '' ? null : intval($class_period);

try {
    // Update user's class period
    $stmt = $pdo->prepare("UPDATE users SET class_period = ? WHERE id = ?");
    $stmt->execute([$class_period, $_SESSION['user_id']]);
    
    // Update session
    $_SESSION['class_period'] = $class_period;
    
    echo json_encode([
        'success' => true,
        'message' => 'Class period updated successfully',
        'class_period' => $class_period
    ]);
    
} catch(PDOException $e) {
    error_log("Database error in update_class_period.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error']);
}
?>