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

// Get and validate input
$skill_id = intval($_POST['skill_id'] ?? 0);
$skill_name = trim($_POST['skill_name'] ?? '');
$skill_description = trim($_POST['skill_description'] ?? '');
$unit = trim($_POST['unit'] ?? '');
$asl_level = intval($_POST['asl_level'] ?? 1);

if (!in_array($asl_level, [1, 2, 3], true)) {
    $asl_level = 1;
}

// Validate required fields
if ($skill_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid skill ID']);
    exit;
}

if (empty($skill_name)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Skill name is required']);
    exit;
}

try {
    // Check if skill exists
    $stmt = $pdo->prepare("SELECT skill_name FROM skills WHERE id = ?");
    $stmt->execute([$skill_id]);
    $existing_skill = $stmt->fetch();
    
    if (!$existing_skill) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Skill not found']);
        exit;
    }
    
    // Check if skill name already exists (excluding current skill)
    $stmt = $pdo->prepare("SELECT id FROM skills WHERE skill_name = ? AND id != ?");
    $stmt->execute([$skill_name, $skill_id]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'A skill with this name already exists']);
        exit;
    }
    
    // Update the skill
    $stmt = $pdo->prepare("
        UPDATE skills
        SET skill_name = ?, skill_description = ?, unit = ?, asl_level = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $unit_value = empty($unit) ? null : $unit;
    $stmt->execute([$skill_name, $skill_description, $unit_value, $asl_level, $skill_id]);
    
    // Success response
    echo json_encode([
        'success' => true,
        'message' => 'Skill updated successfully!',
        'skill_id' => $skill_id,
        'skill_name' => $skill_name
    ]);
    
} catch(PDOException $e) {
    error_log("Database error in edit_skill.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}
?>