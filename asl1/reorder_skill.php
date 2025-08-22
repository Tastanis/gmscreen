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
$action = $_POST['action'] ?? '';
$target_position = intval($_POST['target_position'] ?? 0);

if ($skill_id <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid skill ID']);
    exit;
}

try {
    // Get current skill position
    $stmt = $pdo->prepare("SELECT order_index FROM skills WHERE id = ?");
    $stmt->execute([$skill_id]);
    $current_skill = $stmt->fetch();
    
    if (!$current_skill) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Skill not found']);
        exit;
    }
    
    $current_position = $current_skill['order_index'];
    
    // Get total number of skills
    $stmt = $pdo->prepare("SELECT COUNT(*) as total FROM skills");
    $stmt->execute();
    $total_skills = $stmt->fetchColumn();
    
    switch ($action) {
        case 'move_up':
            if ($current_position <= 1) {
                echo json_encode(['success' => false, 'message' => 'Skill is already at the top']);
                exit;
            }
            
            // Find the skill immediately above
            $stmt = $pdo->prepare("SELECT id, order_index FROM skills WHERE order_index < ? ORDER BY order_index DESC LIMIT 1");
            $stmt->execute([$current_position]);
            $skill_above = $stmt->fetch();
            
            if ($skill_above) {
                // Swap positions
                $pdo->beginTransaction();
                
                $stmt = $pdo->prepare("UPDATE skills SET order_index = ? WHERE id = ?");
                $stmt->execute([$skill_above['order_index'], $skill_id]);
                
                $stmt = $pdo->prepare("UPDATE skills SET order_index = ? WHERE id = ?");
                $stmt->execute([$current_position, $skill_above['id']]);
                
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Skill moved up successfully']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Could not move skill up']);
            }
            break;
            
        case 'move_down':
            if ($current_position >= $total_skills) {
                echo json_encode(['success' => false, 'message' => 'Skill is already at the bottom']);
                exit;
            }
            
            // Find the skill immediately below
            $stmt = $pdo->prepare("SELECT id, order_index FROM skills WHERE order_index > ? ORDER BY order_index ASC LIMIT 1");
            $stmt->execute([$current_position]);
            $skill_below = $stmt->fetch();
            
            if ($skill_below) {
                // Swap positions
                $pdo->beginTransaction();
                
                $stmt = $pdo->prepare("UPDATE skills SET order_index = ? WHERE id = ?");
                $stmt->execute([$skill_below['order_index'], $skill_id]);
                
                $stmt = $pdo->prepare("UPDATE skills SET order_index = ? WHERE id = ?");
                $stmt->execute([$current_position, $skill_below['id']]);
                
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Skill moved down successfully']);
            } else {
                echo json_encode(['success' => false, 'message' => 'Could not move skill down']);
            }
            break;
            
        case 'move_to_position':
            if ($target_position < 1 || $target_position > $total_skills) {
                echo json_encode(['success' => false, 'message' => 'Invalid target position']);
                exit;
            }
            
            if ($target_position == $current_position) {
                echo json_encode(['success' => true, 'message' => 'Skill is already at position ' . $target_position]);
                exit;
            }
            
            $pdo->beginTransaction();
            
            // First, ensure all skills have sequential order_index values
            $stmt = $pdo->prepare("SELECT id FROM skills ORDER BY order_index, id");
            $stmt->execute();
            $all_skills = $stmt->fetchAll();
            
            $index = 1;
            foreach ($all_skills as $skill) {
                $stmt = $pdo->prepare("UPDATE skills SET order_index = ? WHERE id = ?");
                $stmt->execute([$index, $skill['id']]);
                if ($skill['id'] == $skill_id) {
                    $current_position = $index;
                }
                $index++;
            }
            
            // Now move the skill to the target position
            if ($target_position < $current_position) {
                // Moving up - shift skills down
                $stmt = $pdo->prepare("
                    UPDATE skills 
                    SET order_index = order_index + 1 
                    WHERE order_index >= ? AND order_index < ?
                ");
                $stmt->execute([$target_position, $current_position]);
            } else {
                // Moving down - shift skills up
                $stmt = $pdo->prepare("
                    UPDATE skills 
                    SET order_index = order_index - 1 
                    WHERE order_index > ? AND order_index <= ?
                ");
                $stmt->execute([$current_position, $target_position]);
            }
            
            // Set the skill to its target position
            $stmt = $pdo->prepare("UPDATE skills SET order_index = ? WHERE id = ?");
            $stmt->execute([$target_position, $skill_id]);
            
            $pdo->commit();
            echo json_encode(['success' => true, 'message' => 'Skill moved to position ' . $target_position]);
            break;
            
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
    }
    
} catch(PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Database error in reorder_skill.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}
?>