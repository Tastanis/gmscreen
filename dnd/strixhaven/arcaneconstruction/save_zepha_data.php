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

// Only Zepha can save Zepha data
if ($user !== 'zepha') {
    http_response_code(403);
    echo json_encode(['error' => 'Only Zepha can save learned skills']);
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

$dataFile = $dataDir . '/zepha_data.json';

// Prepare save data
$saveData = [
    'learnedSkills' => $data['learnedSkills'] ?? [],
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
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save Zepha data']);
} else {
    echo json_encode(['success' => true, 'message' => 'Zepha data saved successfully']);
}
?>