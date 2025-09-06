<?php
/**
 * Hex API Endpoints
 * RESTful API for hex data operations
 */

session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Check authentication
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

require_once '../../../includes/hex-data-manager.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = $_SESSION['user'] ?? 'unknown';
$sessionId = session_id();
$isGM = ($user === 'GM');

$hexManager = new HexDataManager();

// Error handling function
function sendError($code, $message, $details = null) {
    http_response_code($code);
    $response = ['error' => $message];
    if ($details) {
        $response['details'] = $details;
    }
    echo json_encode($response);
    exit;
}

// Success response function
function sendSuccess($data = null, $message = null) {
    $response = ['success' => true];
    if ($message) {
        $response['message'] = $message;
    }
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response);
    exit;
}

try {
    switch ($method) {
        case 'GET':
            handleGetRequest();
            break;
        case 'POST':
            handlePostRequest();
            break;
        case 'PUT':
            handlePutRequest();
            break;
        case 'DELETE':
            handleDeleteRequest();
            break;
        default:
            sendError(405, 'Method not allowed');
    }
} catch (Exception $e) {
    error_log("Hex API error: " . $e->getMessage());
    sendError(500, 'Internal server error', $e->getMessage());
}

function handleGetRequest() {
    global $hexManager, $isGM;
    
    $action = $_GET['action'] ?? 'get_hex';
    
    switch ($action) {
        case 'get_hex':
            $hexId = $_GET['hex_id'] ?? '';
            if (empty($hexId)) {
                sendError(400, 'Hex ID required');
            }
            
            $data = $hexManager->getHexData($hexId);
            
            if (!$data) {
                sendSuccess(['hex_id' => $hexId, 'has_data' => false]);
            }
            
            // Filter GM-only data for non-GM users
            if (!$isGM && isset($data['gm_notes'])) {
                $data['gm_notes'] = null;
            }
            
            sendSuccess($data);
            break;
            
        case 'get_all_hexes':
            $filters = [];
            if (isset($_GET['has_data']) && $_GET['has_data'] === 'true') {
                $filters['has_data'] = true;
            }
            if (isset($_GET['updated_after'])) {
                $filters['updated_after'] = $_GET['updated_after'];
            }
            
            $data = $hexManager->getAllHexData($filters);
            
            // Filter GM-only data for non-GM users
            if (!$isGM) {
                foreach ($data as &$hex) {
                    if (isset($hex['gm_notes'])) {
                        $hex['gm_notes'] = null;
                    }
                }
            }
            
            sendSuccess($data);
            break;
            
        case 'system_status':
            if (!$isGM) {
                sendError(403, 'GM access required');
            }
            
            $status = $hexManager->getSystemStatus();
            sendSuccess($status);
            break;
            
        default:
            sendError(400, 'Invalid action');
    }
}

function handlePostRequest() {
    global $hexManager, $user, $sessionId, $isGM;
    
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        // Fallback to $_POST for form data
        $input = $_POST;
    }
    
    $action = $input['action'] ?? '';
    
    switch ($action) {
        case 'acquire_lock':
            $hexId = $input['hex_id'] ?? '';
            if (empty($hexId)) {
                sendError(400, 'Hex ID required');
            }
            
            $result = $hexManager->acquireEditLock($hexId, $user, $sessionId);
            
            if ($result['success']) {
                sendSuccess($result);
            } else {
                sendError(409, $result['error'], $result);
            }
            break;
            
        case 'release_lock':
            $hexId = $input['hex_id'] ?? '';
            if (empty($hexId)) {
                sendError(400, 'Hex ID required');
            }
            
            $success = $hexManager->releaseEditLock($hexId, $sessionId);
            
            if ($success) {
                sendSuccess(null, 'Lock released');
            } else {
                sendError(500, 'Failed to release lock');
            }
            break;
            
        case 'save_hex':
            $hexId = $input['hex_id'] ?? '';
            $data = $input['data'] ?? [];
            $expectedVersion = $input['expected_version'] ?? null;
            
            if (empty($hexId)) {
                sendError(400, 'Hex ID required');
            }
            
            // Filter GM-only data for non-GM users
            if (!$isGM && isset($data['gm_notes'])) {
                unset($data['gm_notes']);
            }
            
            // Validate data
            $data = validateHexData($data);
            
            $result = $hexManager->saveHexData($hexId, $data, $user, $sessionId, $expectedVersion);
            
            if ($result['success']) {
                sendSuccess($result);
            } else if (isset($result['conflict'])) {
                sendError(409, $result['error'], $result);
            } else {
                sendError(500, $result['error']);
            }
            break;
            
        case 'upload_image':
            handleImageUpload();
            break;
            
        default:
            sendError(400, 'Invalid action');
    }
}

function handlePutRequest() {
    // PUT requests handled same as POST for simplicity
    $_POST = json_decode(file_get_contents('php://input'), true);
    handlePostRequest();
}

function handleDeleteRequest() {
    global $hexManager, $user, $sessionId, $isGM;
    
    $hexId = $_GET['hex_id'] ?? '';
    if (empty($hexId)) {
        sendError(400, 'Hex ID required');
    }
    
    // Only GM can delete hex data
    if (!$isGM) {
        sendError(403, 'GM access required for deletion');
    }
    
    // For now, we'll clear the data rather than actually delete the record
    $emptyData = [
        'hex_name' => null,
        'image_path' => null,
        'custom_field_1' => null,
        'custom_field_2' => null,
        'custom_field_3' => null,
        'gm_notes' => null,
        'player_notes' => null
    ];
    
    $result = $hexManager->saveHexData($hexId, $emptyData, $user, $sessionId);
    
    if ($result['success']) {
        sendSuccess(null, 'Hex data cleared');
    } else {
        sendError(500, 'Failed to clear hex data');
    }
}

function validateHexData($data) {
    $validatedData = [];
    
    // Validate hex_name
    if (isset($data['hex_name'])) {
        $validatedData['hex_name'] = trim(substr($data['hex_name'], 0, 255));
    }
    
    // Validate image_path
    if (isset($data['image_path'])) {
        $validatedData['image_path'] = trim(substr($data['image_path'], 0, 500));
    }
    
    // Validate custom fields
    for ($i = 1; $i <= 3; $i++) {
        $field = "custom_field_$i";
        if (isset($data[$field])) {
            $validatedData[$field] = trim(substr($data[$field], 0, 10000));
        }
    }
    
    // Validate notes
    if (isset($data['gm_notes'])) {
        $validatedData['gm_notes'] = trim(substr($data['gm_notes'], 0, 10000));
    }
    
    if (isset($data['player_notes'])) {
        $validatedData['player_notes'] = trim(substr($data['player_notes'], 0, 10000));
    }
    
    return $validatedData;
}

function handleImageUpload() {
    global $user, $sessionId;
    
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        sendError(400, 'No image uploaded or upload error');
    }
    
    $file = $_FILES['image'];
    $hexId = $_POST['hex_id'] ?? '';
    
    if (empty($hexId)) {
        sendError(400, 'Hex ID required for image upload');
    }
    
    // Validate file type
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($file['type'], $allowedTypes)) {
        sendError(400, 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
    }
    
    // Validate file size (max 5MB)
    if ($file['size'] > 5 * 1024 * 1024) {
        sendError(400, 'File too large. Maximum size is 5MB.');
    }
    
    // Create upload directory
    $uploadDir = __DIR__ . '/../images/hexes/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = $hexId . '_' . time() . '_' . substr(md5($file['name']), 0, 8) . '.' . $extension;
    $filepath = $uploadDir . $filename;
    
    // Move uploaded file
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        // Return relative path for database storage
        $relativePath = 'images/hexes/' . $filename;
        
        sendSuccess([
            'image_path' => $relativePath,
            'filename' => $filename,
            'size' => $file['size'],
            'type' => $file['type']
        ], 'Image uploaded successfully');
    } else {
        sendError(500, 'Failed to save uploaded file');
    }
}

// Helper function to clean up old image files
function cleanupOldImages($hexId, $newImagePath) {
    $uploadDir = __DIR__ . '/../images/hexes/';
    $pattern = $uploadDir . $hexId . '_*';
    
    foreach (glob($pattern) as $oldFile) {
        $oldRelativePath = 'images/hexes/' . basename($oldFile);
        if ($oldRelativePath !== $newImagePath) {
            unlink($oldFile);
        }
    }
}
?>