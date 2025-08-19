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

// Check user access (zepha or GM)
if ($user !== 'zepha' && !$is_gm) {
    http_response_code(403);
    echo json_encode(['error' => 'Access restricted']);
    exit;
}

$dataFile = 'data/grid_data.json';

if (!file_exists($dataFile)) {
    // Return empty data structure if no file exists
    echo json_encode([
        'editableCells' => [],
        'lastSaved' => null,
        'savedBy' => null,
        'timestamp' => null
    ]);
    exit;
}

$content = file_get_contents($dataFile);
$data = json_decode($content, true);

if ($data === null) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to parse grid data']);
} else {
    // Return the data
    echo json_encode($data);
}
?>