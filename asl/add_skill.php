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
$skill_name = trim($_POST['skill_name'] ?? '');
$skill_description = trim($_POST['skill_description'] ?? '');
$resources_text = trim($_POST['resources'] ?? '');

// Validate required fields
if (empty($skill_name)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Skill name is required']);
    exit;
}

try {
    // Check if skill name already exists
    $stmt = $pdo->prepare("SELECT id FROM skills WHERE skill_name = ?");
    $stmt->execute([$skill_name]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'A skill with this name already exists']);
        exit;
    }
    
    // Get the next order index
    $stmt = $pdo->prepare("SELECT MAX(order_index) + 1 as next_order FROM skills");
    $stmt->execute();
    $next_order = $stmt->fetchColumn() ?: 1;
    
    // Insert the new skill
    $stmt = $pdo->prepare("
        INSERT INTO skills (skill_name, skill_description, points_not_started, points_progressing, points_proficient, order_index) 
        VALUES (?, ?, 0, 1, 3, ?)
    ");
    $stmt->execute([$skill_name, $skill_description, $next_order]);
    
    $skill_id = $pdo->lastInsertId();
    
    // Process resources if provided
    $resources_added = 0;
    if (!empty($resources_text)) {
        $resources_lines = explode("\n", $resources_text);
        $order_index = 1;
        
        foreach ($resources_lines as $line) {
            $resource_name = trim($line);
            if (!empty($resource_name)) {
                $stmt = $pdo->prepare("
                    INSERT INTO resources (skill_id, resource_name, resource_url, order_index) 
                    VALUES (?, ?, '#', ?)
                ");
                $stmt->execute([$skill_id, $resource_name, $order_index]);
                $resources_added++;
                $order_index++;
            }
        }
    }
    
    // Success response
    echo json_encode([
        'success' => true,
        'message' => 'Skill added successfully!',
        'skill_id' => $skill_id,
        'skill_name' => $skill_name,
        'resources_added' => $resources_added
    ]);
    
} catch(PDOException $e) {
    error_log("Database error in add_skill.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred']);
}
?>