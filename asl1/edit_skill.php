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
$asl_level = intval($_POST['asl_level'] ?? 0);

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

if (!in_array($asl_level, [1, 2], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A valid ASL level is required']);
    exit;
}

try {
    // Check if skill exists
    $stmt = $pdo->prepare("SELECT skill_name, asl_level, order_index FROM skills WHERE id = ?");
    $stmt->execute([$skill_id]);
    $existing_skill = $stmt->fetch();

    if (!$existing_skill) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Skill not found']);
        exit;
    }

    // Check if skill name already exists (excluding current skill)
    $stmt = $pdo->prepare("SELECT id FROM skills WHERE skill_name = ? AND asl_level = ? AND id != ?");
    $stmt->execute([$skill_name, $asl_level, $skill_id]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'A skill with this name already exists']);
        exit;
    }

    $unit_value = empty($unit) ? null : $unit;

    $pdo->beginTransaction();

    $new_order_index = $existing_skill['order_index'];

    if ($existing_skill['asl_level'] != $asl_level) {
        // Close the gap in the old level ordering
        $stmt = $pdo->prepare("UPDATE skills SET order_index = order_index - 1 WHERE asl_level = ? AND order_index > ?");
        $stmt->execute([$existing_skill['asl_level'], $existing_skill['order_index']]);

        // Determine the new order index at the end of the selected level
        $stmt = $pdo->prepare("SELECT COALESCE(MAX(order_index), 0) + 1 FROM skills WHERE asl_level = ?");
        $stmt->execute([$asl_level]);
        $new_order_index = $stmt->fetchColumn() ?: 1;
    }

    // Update the skill
    $stmt = $pdo->prepare("
        UPDATE skills
        SET skill_name = ?, skill_description = ?, unit = ?, asl_level = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $stmt->execute([$skill_name, $skill_description, $unit_value, $asl_level, $new_order_index, $skill_id]);

    $pdo->commit();

    // Success response
    echo json_encode([
        'success' => true,
        'message' => 'Skill updated successfully!',
        'skill_id' => $skill_id,
        'skill_name' => $skill_name,
        'asl_level' => $asl_level
    ]);

} catch(PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Database error in edit_skill.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}
?>