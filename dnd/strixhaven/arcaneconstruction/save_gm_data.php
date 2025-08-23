<?php
session_start();

// Check authentication
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Only GM can save GM data
if (!$is_gm) {
    http_response_code(403);
    echo json_encode(['error' => 'Only GM can save GM data']);
    exit;
}

// Get JSON input
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON data']);
    exit;
}

// Ensure data directory exists
$dataDir = 'data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

$dataFile = $dataDir . '/gm_data.json';
$lockFile = $dataDir . '/save_lock.json';

// Create save lock
$lockData = [
    'user' => $user,
    'timestamp' => date('c'),
    'action' => 'saving_gm_data'
];

$lockResult = file_put_contents($lockFile, json_encode($lockData), LOCK_EX);
if ($lockResult === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to acquire save lock']);
    exit;
}

try {
    // Prepare save data
    $saveData = [
        'editableCells' => $data['editableCells'] ?? [],
        'customConnections' => $data['customConnections'] ?? [],
        'lastSaved' => date('Y-m-d H:i:s'),
        'savedBy' => $user,
        'timestamp' => $data['timestamp'] ?? date('c')
    ];

    // Save with backup
    if (file_exists($dataFile)) {
        copy($dataFile, $dataFile . '.backup');
    }

    $result = file_put_contents($dataFile, json_encode($saveData, JSON_PRETTY_PRINT), LOCK_EX);

    if ($result === false) {
        throw new Exception('Failed to write GM data to file');
    }

    // Success - remove lock
    if (file_exists($lockFile)) {
        unlink($lockFile);
    }

    echo json_encode(['success' => true, 'message' => 'GM data saved successfully']);

} catch (Exception $e) {
    // Remove lock on failure
    if (file_exists($lockFile)) {
        unlink($lockFile);
    }
    
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save GM data: ' . $e->getMessage()]);
}
?>