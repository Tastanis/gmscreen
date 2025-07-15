<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    echo json_encode(array('success' => false, 'error' => 'Not logged in'));
    exit;
}

// Check if user is GM - case insensitive
$is_gm = (strtolower($_SESSION['user']) === 'gm');

$combat_file = '../data/combat.json';
$pcs_file = '../data/pcs.json';

// Handle different actions
$action = $_POST['action'] ?? '';

// BLOCK SAVE/MODIFY OPERATIONS FOR NON-GM USERS (but allow load_data)
if (!$is_gm && $action !== 'load_data') {
    echo json_encode(array('success' => false, 'error' => 'Only GM can make changes'));
    exit;
}

switch ($action) {
    case 'save_combat_data':
        handleSaveCombatData();
        break;
        
    case 'save_position':
        handleSavePosition();
        break;
        
    case 'load_data':
        handleLoadData();
        break;
        
    case 'upload_image':
        handleUploadImage();
        break;
        
    case 'get_pcs':
        handleGetPCs();
        break;
        
    case 'save_pc':
        handleSavePC();
        break;
        
    case 'remove_pc':
        handleRemovePC();
        break;
        
    case 'toggle_visibility':
        handleToggleVisibility();
        break;
        
    default:
        echo json_encode(array('success' => false, 'error' => 'Unknown action: ' . $action));
        break;
}

function handleSaveCombatData() {
    global $combat_file;
    
    $data_json = $_POST['data'] ?? '';
    if (empty($data_json)) {
        echo json_encode(array('success' => false, 'error' => 'No data provided'));
        return;
    }
    
    $data = json_decode($data_json, true);
    if ($data === null) {
        echo json_encode(array('success' => false, 'error' => 'Invalid JSON data'));
        return;
    }
    
    // Validate required fields
    $validated_data = array(
        'round_count' => (int)($data['round_count'] ?? 1),
        'player_turn_first' => $data['player_turn_first'],
        'initiative_rolled' => (bool)($data['initiative_rolled'] ?? false),
        'creatures' => $data['creatures'] ?? array(),
        'pcs' => array() // Will be loaded from separate file
    );
    
    // Validate creatures data
    foreach ($validated_data['creatures'] as $id => $creature) {
        if (!is_array($creature) || !isset($creature['id'])) {
            unset($validated_data['creatures'][$id]);
            continue;
        }
        
        // Ensure required fields exist with defaults
        $validated_data['creatures'][$id] = array(
            'id' => $creature['id'],
            'creature_type' => $creature['creature_type'] ?? 'enemy',
            'name' => $creature['name'] ?? 'Unnamed',
            'x_pos' => (int)($creature['x_pos'] ?? 10),
            'y_pos' => (int)($creature['y_pos'] ?? 10),
            'status' => in_array($creature['status'] ?? '', ['waiting', 'complete']) ? $creature['status'] : 'waiting',
            'column' => (int)($creature['column'] ?? 0), // 0 or 1 for left side, 2 or 3 for right side
            'conditions' => array_slice((array)($creature['conditions'] ?? ['', '']), 0, 2),
            'other_condition' => $creature['other_condition'] ?? '',
            'triggered_used' => (bool)($creature['triggered_used'] ?? false),
            'image_path' => $creature['image_path'] ?? null,
            'hidden_from_players' => (bool)($creature['hidden_from_players'] ?? false)
        );
    }
    
    if (saveJsonFile($combat_file, $validated_data)) {
        echo json_encode(array(
            'success' => true, 
            'message' => 'Combat data saved',
            'data' => $validated_data
        ));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save file'));
    }
}

function handleSavePosition() {
    global $combat_file;
    
    $creature_id = $_POST['creature_id'] ?? '';
    $x = (int)($_POST['x'] ?? 0);
    $y = (int)($_POST['y'] ?? 0);
    $status = $_POST['status'] ?? 'waiting';
    $column = (int)($_POST['column'] ?? 0);
    
    if (empty($creature_id)) {
        echo json_encode(array('success' => false, 'error' => 'Missing creature ID'));
        return;
    }
    
    if (!in_array($status, ['waiting', 'complete'])) {
        $status = 'waiting';
    }
    
    // Validate column (0-3: 0,1 = waiting columns, 2,3 = complete columns)
    if ($column < 0 || $column > 3) {
        $column = 0;
    }
    
    $combat_data = loadJsonFile($combat_file);
    if (!$combat_data) {
        echo json_encode(array('success' => false, 'error' => 'Could not load combat data'));
        return;
    }
    
    if (!isset($combat_data['creatures'][$creature_id])) {
        echo json_encode(array('success' => false, 'error' => 'Creature not found'));
        return;
    }
    
    $combat_data['creatures'][$creature_id]['x_pos'] = $x;
    $combat_data['creatures'][$creature_id]['y_pos'] = $y;
    $combat_data['creatures'][$creature_id]['status'] = $status;
    $combat_data['creatures'][$creature_id]['column'] = $column;
    
    if (saveJsonFile($combat_file, $combat_data)) {
        echo json_encode(array(
            'success' => true,
            'message' => 'Position saved',
            'data' => $combat_data
        ));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save file'));
    }
}

function handleLoadData() {
    global $combat_file;
    
    $combat_data = loadJsonFile($combat_file);
    if ($combat_data === false) {
        // Return default structure if file doesn't exist
        $combat_data = array(
            'round_count' => 1,
            'player_turn_first' => null,
            'initiative_rolled' => false,
            'creatures' => array(),
            'pcs' => array()
        );
    }
    
    echo json_encode(array(
        'success' => true,
        'data' => $combat_data
    ));
}

function handleUploadImage() {
    $creature_id = $_POST['creature_id'] ?? '';
    
    if (empty($creature_id)) {
        echo json_encode(array('success' => false, 'error' => 'Missing creature ID'));
        return;
    }
    
    if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(array('success' => false, 'error' => 'No image uploaded or upload error'));
        return;
    }
    
    $file = $_FILES['image'];
    $allowed_types = array('image/jpeg', 'image/png', 'image/gif', 'image/webp');
    
    if (!in_array($file['type'], $allowed_types)) {
        echo json_encode(array('success' => false, 'error' => 'Invalid file type. Use JPG, PNG, GIF, or WebP.'));
        return;
    }
    
    if ($file['size'] > 5 * 1024 * 1024) { // 5MB limit
        echo json_encode(array('success' => false, 'error' => 'File too large. Maximum size is 5MB.'));
        return;
    }
    
    // Create LOCAL portraits directory if it doesn't exist (combat/portraits/)
    $portraits_dir = 'portraits';
    if (!file_exists($portraits_dir)) {
        if (!mkdir($portraits_dir, 0755, true)) {
            echo json_encode(array('success' => false, 'error' => 'Could not create portraits directory'));
            return;
        }
    }
    
    // Generate unique filename
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = $creature_id . '_' . time() . '.' . $extension;
    $filepath = $portraits_dir . '/' . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        // Update creature data
        global $combat_file;
        $combat_data = loadJsonFile($combat_file);
        
        if ($combat_data && isset($combat_data['creatures'][$creature_id])) {
            // Remove old image if it exists
            $old_image = $combat_data['creatures'][$creature_id]['image_path'] ?? null;
            if ($old_image && file_exists($portraits_dir . '/' . $old_image)) {
                unlink($portraits_dir . '/' . $old_image);
            }
            
            $combat_data['creatures'][$creature_id]['image_path'] = $filename;
            saveJsonFile($combat_file, $combat_data);
        }
        
        echo json_encode(array(
            'success' => true,
            'filename' => $filename,
            'message' => 'Image uploaded successfully'
        ));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save uploaded file'));
    }
}

function handleGetPCs() {
    global $pcs_file;
    
    $pcs_data = loadJsonFile($pcs_file);
    if ($pcs_data === false) {
        $pcs_data = array();
    }
    
    echo json_encode(array(
        'success' => true,
        'pcs' => $pcs_data
    ));
}

function handleSavePC() {
    global $pcs_file;
    
    $name = trim($_POST['name'] ?? '');
    $image_path = trim($_POST['image_path'] ?? '');
    
    if (empty($name)) {
        echo json_encode(array('success' => false, 'error' => 'PC name is required'));
        return;
    }
    
    $pcs_data = loadJsonFile($pcs_file);
    if ($pcs_data === false) {
        $pcs_data = array();
    }
    
    // Check if PC already exists
    $existing_index = -1;
    foreach ($pcs_data as $index => $pc) {
        if (isset($pc['name']) && strtolower($pc['name']) === strtolower($name)) {
            $existing_index = $index;
            break;
        }
    }
    
    $pc_data = array(
        'name' => $name,
        'image_path' => $image_path
    );
    
    if ($existing_index >= 0) {
        $pcs_data[$existing_index] = $pc_data;
    } else {
        $pcs_data[] = $pc_data;
    }
    
    // Sort PCs by name
    usort($pcs_data, function($a, $b) {
        return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
    });
    
    if (saveJsonFile($pcs_file, $pcs_data)) {
        echo json_encode(array(
            'success' => true,
            'message' => 'PC saved successfully'
        ));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save PC data'));
    }
}

function handleRemovePC() {
    global $pcs_file;
    
    $name = trim($_POST['name'] ?? '');
    
    if (empty($name)) {
        echo json_encode(array('success' => false, 'error' => 'PC name is required'));
        return;
    }
    
    $pcs_data = loadJsonFile($pcs_file);
    if ($pcs_data === false) {
        echo json_encode(array('success' => false, 'error' => 'No PC data found'));
        return;
    }
    
    // Find and remove PC
    $removed = false;
    foreach ($pcs_data as $index => $pc) {
        if (isset($pc['name']) && strtolower($pc['name']) === strtolower($name)) {
            array_splice($pcs_data, $index, 1);
            $removed = true;
            break;
        }
    }
    
    if (!$removed) {
        echo json_encode(array('success' => false, 'error' => 'PC not found'));
        return;
    }
    
    if (saveJsonFile($pcs_file, $pcs_data)) {
        echo json_encode(array(
            'success' => true,
            'message' => 'PC removed successfully'
        ));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save PC data'));
    }
}

function handleToggleVisibility() {
    global $combat_file;
    
    $creature_id = $_POST['creature_id'] ?? '';
    
    if (empty($creature_id)) {
        echo json_encode(array('success' => false, 'error' => 'Missing creature ID'));
        return;
    }
    
    $combat_data = loadJsonFile($combat_file);
    if (!$combat_data) {
        echo json_encode(array('success' => false, 'error' => 'Could not load combat data'));
        return;
    }
    
    if (!isset($combat_data['creatures'][$creature_id])) {
        echo json_encode(array('success' => false, 'error' => 'Creature not found'));
        return;
    }
    
    // Toggle visibility (default to hidden for enemies, visible for heroes)
    $current_hidden = $combat_data['creatures'][$creature_id]['hidden_from_players'] ?? false;
    $combat_data['creatures'][$creature_id]['hidden_from_players'] = !$current_hidden;
    
    if (saveJsonFile($combat_file, $combat_data)) {
        echo json_encode(array(
            'success' => true,
            'message' => 'Visibility toggled',
            'data' => $combat_data
        ));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Failed to save file'));
    }
}

function loadJsonFile($filepath) {
    if (!file_exists($filepath)) {
        return false;
    }
    
    $json_content = file_get_contents($filepath);
    if ($json_content === false) {
        return false;
    }
    
    $data = json_decode($json_content, true);
    return $data === null ? false : $data;
}

function saveJsonFile($filepath, $data) {
    $json_string = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json_string === false) {
        return false;
    }
    
    // Atomic write using temporary file
    $temp_file = $filepath . '.tmp';
    if (file_put_contents($temp_file, $json_string) === false) {
        return false;
    }
    
    if (!rename($temp_file, $filepath)) {
        unlink($temp_file);
        return false;
    }
    
    return true;
}
?>