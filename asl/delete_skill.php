<?php
session_start();
require_once 'config.php';

// Check if user is logged in and is a teacher
if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied. Teachers only.']);
    exit;
}

// Check if this is a POST request
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

// Get and validate skill ID
$skill_id = intval($_POST['skill_id'] ?? 0);

if ($skill_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid skill ID']);
    exit;
}

try {
    // Check if skill exists
    $stmt = $pdo->prepare("SELECT skill_name FROM skills WHERE id = ?");
    $stmt->execute([$skill_id]);
    $skill = $stmt->fetch();
    
    if (!$skill) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Skill not found']);
        exit;
    }
    
    $skill_name = $skill['skill_name'];
    
    // Begin transaction for safe deletion
    $pdo->beginTransaction();
    
    try {
        // Delete all resources associated with this skill
        $stmt = $pdo->prepare("DELETE FROM resources WHERE skill_id = ?");
        $stmt->execute([$skill_id]);
        $resources_deleted = $stmt->rowCount();
        
        // Delete all user progress associated with this skill
        $stmt = $pdo->prepare("DELETE FROM user_skills WHERE skill_id = ?");
        $stmt->execute([$skill_id]);
        $progress_deleted = $stmt->rowCount();
        
        // Delete the skill itself
        $stmt = $pdo->prepare("DELETE FROM skills WHERE id = ?");
        $stmt->execute([$skill_id]);
        
        // Commit the transaction
        $pdo->commit();
        
        // Success response
        echo json_encode([
            'success' => true,
            'message' => 'Skill deleted successfully!',
            'skill_name' => $skill_name,
            'resources_deleted' => $resources_deleted,
            'progress_records_deleted' => $progress_deleted
        ]);
        
    } catch (Exception $e) {
        // Rollback transaction on error
        $pdo->rollback();
        throw $e;
    }
    
} catch(PDOException $e) {
    error_log("Database error in delete_skill.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}
?>