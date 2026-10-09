<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Check if user is GM - restrict access
if (!$is_gm) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'GM access required']);
    exit;
}

// Include backup and lock systems
require_once 'includes/monster-backup-helper.php';
require_once 'includes/monster-store.php';
require_once '../gm/includes/file-lock-manager.php';

// Set JSON response header
header('Content-Type: application/json');

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['action'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid request']);
    exit;
}

// Data file path - single GM file
$dataDir = __DIR__ . '/data/';
$dataFile = $dataDir . 'gm-monsters.json';
$lockFile = $dataDir . 'gm-monsters.lock';

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Handle different actions
switch ($input['action']) {
    case 'save':
        $backupType = $input['backup_type'] ?? 'pre-save';
        saveMonsterData($input['data'], $dataFile, $lockFile, $backupType);
        break;
        
    case 'load':
        loadMonsterData($dataFile);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action']);
}

/**
 * Save monster data with file locking, backups, and atomic writes
 */
function saveMonsterData($data, $dataFile, $lockFile, $backupType = 'pre-save') {
    global $dataDir;
    
    // Debug: Log received data
    error_log("Save received data: " . json_encode($data));
    error_log("Monster count in received data: " . count((array)$data['monsters']));
    error_log("Tab count in received data: " . count((array)$data['tabs']));
    
    // Validate data
    if (!is_array($data) || !isset($data['tabs']) || !isset($data['monsters'])) {
        echo json_encode(['success' => false, 'error' => 'Invalid data format']);
        return;
    }
    
    // Use file lock manager
    $lockManager = new FileLockManager($dataDir);
    
    // The write itself is shared with the key-guarded site upload (includes/monster-store.php).
    $result = $lockManager->withLock($dataFile, function() use ($data, $dataFile, $dataDir, $backupType) {
        return monsterStoreWriteLocked($data, $dataFile, $dataDir, $backupType, $_SESSION['user'] ?? 'unknown');
    });

    if ($result['success']) {
        echo json_encode(['success' => true, 'message' => 'Data saved successfully']);
    } else {
        echo json_encode(['success' => false, 'error' => $result['error'] ?? 'Failed to save data']);
    }
}

/**
 * Validate monster data structure
 */
function validateMonsterData($data) {
    return monsterStoreValidate($data);
}

/**
 * Load monster data
 */
function loadMonsterData($dataFile) {
    if (!file_exists($dataFile)) {
        // Return empty structure if file doesn't exist - let JavaScript create defaults
        $emptyData = [
            'tabs' => (object)[], // Ensure proper empty object
            'monsters' => (object)[], // Ensure proper empty object
            'abilityTabs' => [
                'common' => [
                    'name' => 'Common',
                    'abilities' => []
                ]
            ]
        ];
        
        echo json_encode(['success' => true, 'data' => $emptyData]);
        return;
    }
    
    try {
        $content = file_get_contents($dataFile);
        if ($content === false) {
            throw new Exception('Failed to read file');
        }
        
        $data = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Invalid JSON: ' . json_last_error_msg());
        }
        
        // Debug: Log loaded data
        error_log("Load returning data: " . json_encode($data));
        error_log("Monster count in loaded data: " . count((array)$data['monsters']));
        error_log("Tab count in loaded data: " . count((array)$data['tabs']));
        
        echo json_encode(['success' => true, 'data' => $data]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
?>