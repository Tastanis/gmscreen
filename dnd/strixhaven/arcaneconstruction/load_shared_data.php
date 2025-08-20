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

$gmDataFile = 'data/gm_data.json';
$zephaDataFile = 'data/zepha_data.json';

// Initialize response structure
$response = [
    'gm_data' => null,
    'zepha_data' => null
];

// Load GM data
if (file_exists($gmDataFile)) {
    $gmContent = file_get_contents($gmDataFile);
    $gmData = json_decode($gmContent, true);
    
    if ($gmData !== null) {
        $response['gm_data'] = $gmData;
    }
}

// Load Zepha data
if (file_exists($zephaDataFile)) {
    $zephaContent = file_get_contents($zephaDataFile);
    $zephaData = json_decode($zephaContent, true);
    
    if ($zephaData !== null) {
        $response['zepha_data'] = $zephaData;
    }
}

// If no data exists, return empty structure
if ($response['gm_data'] === null) {
    $response['gm_data'] = [
        'editableCells' => [],
        'customConnections' => [],
        'lastSaved' => null,
        'savedBy' => null,
        'timestamp' => null
    ];
}

if ($response['zepha_data'] === null) {
    $response['zepha_data'] = [
        'learnedSkills' => [],
        'lastSaved' => null,
        'savedBy' => null,
        'timestamp' => null
    ];
}

// Return combined data
header('Content-Type: application/json');
echo json_encode($response);
?>