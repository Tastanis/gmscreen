<?php
session_start();
require_once 'config.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not logged in']);
    exit;
}

// Check if this is a teacher (teachers can't update their own skills)
if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Teachers cannot update skill status']);
    exit;
}

// Validate input
if (!isset($_POST['skill_id']) || !isset($_POST['status'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required parameters']);
    exit;
}

$skill_id = intval($_POST['skill_id']);
$status = $_POST['status'];
$user_level = intval($_SESSION['user_level'] ?? 1);

// Validate status
if (!in_array($status, ['not_started', 'progressing', 'proficient'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid status']);
    exit;
}

try {
    // Check if the skill exists
    $stmt = $pdo->prepare("SELECT id, asl_level FROM skills WHERE id = ?");
    $stmt->execute([$skill_id]);
    $skill = $stmt->fetch();
    if (!$skill) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Skill not found']);
        exit;
    }

    if ((int)$skill['asl_level'] !== $user_level) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You cannot update skills from another ASL level']);
        exit;
    }
    
    // Update or insert user skill status
    $stmt = $pdo->prepare("
        INSERT INTO user_skills (user_id, skill_id, status) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE status = ?, updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([$_SESSION['user_id'], $skill_id, $status, $status]);
    
    // Calculate new progress percentage
    $stmt = $pdo->prepare("
        SELECT
            SUM(CASE
                WHEN s.asl_level = ? AND us.status = 'not_started' THEN s.points_not_started
                WHEN s.asl_level = ? AND us.status = 'progressing' THEN s.points_progressing
                WHEN s.asl_level = ? AND us.status = 'proficient' THEN s.points_proficient
                ELSE 0
            END) as earned_points,
            SUM(CASE WHEN s.asl_level = ? THEN s.points_proficient ELSE 0 END) as total_possible_points
        FROM skills s
        LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = ?
        WHERE s.asl_level = ?
    ");
    $stmt->execute([$user_level, $user_level, $user_level, $user_level, $_SESSION['user_id'], $user_level]);
    $progress = $stmt->fetch();
    
    $earned_points = $progress['earned_points'] ?? 0;
    $total_possible_points = $progress['total_possible_points'] ?? 1;
    $progress_percentage = $total_possible_points > 0 ? round(($earned_points / $total_possible_points) * 100) : 0;
    
    echo json_encode([
        'success' => true,
        'message' => 'Skill status updated successfully',
        'progress_percentage' => $progress_percentage,
        'earned_points' => $earned_points,
        'total_possible_points' => $total_possible_points
    ]);
    
} catch(PDOException $e) {
    error_log("Database error in update_skill_status.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error']);
}
?>