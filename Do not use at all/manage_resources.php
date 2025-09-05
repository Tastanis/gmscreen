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

// Get action type
$action = $_POST['action'] ?? '';
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
    
    switch ($action) {
        case 'get_resources':
            // Get all resources for this skill
            $stmt = $pdo->prepare("
                SELECT id, resource_name, resource_url, resource_description, order_index
                FROM resources 
                WHERE skill_id = ? 
                ORDER BY order_index
            ");
            $stmt->execute([$skill_id]);
            $resources = $stmt->fetchAll();
            
            echo json_encode([
                'success' => true,
                'skill_name' => $skill['skill_name'],
                'resources' => $resources
            ]);
            break;
            
        case 'add_resource':
            $resource_name = trim($_POST['resource_name'] ?? '');
            $resource_url = trim($_POST['resource_url'] ?? '#');
            $resource_description = trim($_POST['resource_description'] ?? '');
            
            if (empty($resource_name)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Resource name is required']);
                exit;
            }
            
            // Get next order index
            $stmt = $pdo->prepare("SELECT MAX(order_index) + 1 as next_order FROM resources WHERE skill_id = ?");
            $stmt->execute([$skill_id]);
            $next_order = $stmt->fetchColumn() ?: 1;
            
            // Insert new resource
            $stmt = $pdo->prepare("
                INSERT INTO resources (skill_id, resource_name, resource_url, resource_description, order_index) 
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([$skill_id, $resource_name, $resource_url, $resource_description, $next_order]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Resource added successfully!',
                'resource_id' => $pdo->lastInsertId()
            ]);
            break;
            
        case 'update_resource':
            $resource_id = intval($_POST['resource_id'] ?? 0);
            $resource_name = trim($_POST['resource_name'] ?? '');
            $resource_url = trim($_POST['resource_url'] ?? '#');
            $resource_description = trim($_POST['resource_description'] ?? '');
            
            if ($resource_id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid resource ID']);
                exit;
            }
            
            if (empty($resource_name)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Resource name is required']);
                exit;
            }
            
            // Update resource
            $stmt = $pdo->prepare("
                UPDATE resources 
                SET resource_name = ?, resource_url = ?, resource_description = ?
                WHERE id = ? AND skill_id = ?
            ");
            $stmt->execute([$resource_name, $resource_url, $resource_description, $resource_id, $skill_id]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Resource updated successfully!'
            ]);
            break;
            
        case 'delete_resource':
            $resource_id = intval($_POST['resource_id'] ?? 0);
            
            if ($resource_id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid resource ID']);
                exit;
            }
            
            // Delete resource
            $stmt = $pdo->prepare("DELETE FROM resources WHERE id = ? AND skill_id = ?");
            $stmt->execute([$resource_id, $skill_id]);
            
            echo json_encode([
                'success' => true,
                'message' => 'Resource deleted successfully!'
            ]);
            break;
            
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
            break;
    }
    
} catch(PDOException $e) {
    error_log("Database error in manage_resources.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}
?>