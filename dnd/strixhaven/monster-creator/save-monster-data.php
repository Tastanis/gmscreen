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

// Set JSON response header
header('Content-Type: application/json');

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['action'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid request']);
    exit;
}

// Data file path - each user has their own file
$dataDir = __DIR__ . '/data/';
$dataFile = $dataDir . 'monsters_' . $user . '.json';
$lockFile = $dataDir . 'monsters_' . $user . '.lock';

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Handle different actions
switch ($input['action']) {
    case 'save':
        saveMonsterData($input['data'], $dataFile, $lockFile);
        break;
        
    case 'load':
        loadMonsterData($dataFile);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action']);
}

/**
 * Save monster data with file locking to prevent race conditions
 */
function saveMonsterData($data, $dataFile, $lockFile) {
    // Validate data
    if (!is_array($data) || !isset($data['tabs']) || !isset($data['monsters'])) {
        echo json_encode(['success' => false, 'error' => 'Invalid data format']);
        return;
    }
    
    // Acquire lock
    $lockHandle = fopen($lockFile, 'c+');
    if (!$lockHandle) {
        echo json_encode(['success' => false, 'error' => 'Failed to create lock file']);
        return;
    }
    
    $lockAcquired = false;
    $attempts = 0;
    
    // Try to acquire exclusive lock with timeout
    while ($attempts < 50) { // 5 second timeout (50 * 100ms)
        if (flock($lockHandle, LOCK_EX | LOCK_NB)) {
            $lockAcquired = true;
            break;
        }
        usleep(100000); // Wait 100ms
        $attempts++;
    }
    
    if (!$lockAcquired) {
        fclose($lockHandle);
        echo json_encode(['success' => false, 'error' => 'Failed to acquire lock']);
        return;
    }
    
    try {
        // Add metadata
        $data['metadata'] = [
            'lastSaved' => date('Y-m-d H:i:s'),
            'version' => '1.0'
        ];
        
        // Encode data
        $jsonData = json_encode($data, JSON_PRETTY_PRINT);
        if ($jsonData === false) {
            throw new Exception('Failed to encode data');
        }
        
        // Write to temporary file first
        $tempFile = $dataFile . '.tmp';
        if (file_put_contents($tempFile, $jsonData, LOCK_EX) === false) {
            throw new Exception('Failed to write temporary file');
        }
        
        // Atomic rename
        if (!rename($tempFile, $dataFile)) {
            throw new Exception('Failed to rename temporary file');
        }
        
        echo json_encode(['success' => true, 'message' => 'Data saved successfully']);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        
        // Clean up temp file if exists
        if (file_exists($tempFile)) {
            unlink($tempFile);
        }
        
    } finally {
        // Release lock
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}

/**
 * Load monster data
 */
function loadMonsterData($dataFile) {
    if (!file_exists($dataFile)) {
        // Return empty structure if file doesn't exist - let JavaScript create defaults
        $emptyData = [
            'tabs' => new stdClass(), // Empty object
            'monsters' => new stdClass(), // Empty object
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
        
        echo json_encode(['success' => true, 'data' => $data]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
?>