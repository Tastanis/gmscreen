<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

// Check if user is logged in as teacher
if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['wordlist_id']) || !isset($input['enabled'])) {
    echo json_encode(['success' => false, 'message' => 'Missing parameters']);
    exit;
}

$wordlistId = intval($input['wordlist_id']);
$enabled = intval($input['enabled']);

try {
    // First check if the column exists
    $checkColumn = $pdo->query("SHOW COLUMNS FROM scroller_wordlists LIKE 'scroller_enabled'");
    if ($checkColumn->rowCount() == 0) {
        // Add the column if it doesn't exist
        $pdo->exec("ALTER TABLE scroller_wordlists ADD COLUMN scroller_enabled BOOLEAN DEFAULT 1 AFTER word_count");
    }
    
    // Update the scroller_enabled setting
    $stmt = $pdo->prepare("UPDATE scroller_wordlists SET scroller_enabled = ? WHERE id = ? AND teacher_id = ?");
    $stmt->execute([$enabled, $wordlistId, $_SESSION['user_id']]);
    
    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Word list not found or not owned by user']);
    }
} catch (PDOException $e) {
    error_log("Error updating scroller_enabled: " . $e->getMessage());
    echo json_encode(['success' => false, 'message' => 'Database error']);
}
?>