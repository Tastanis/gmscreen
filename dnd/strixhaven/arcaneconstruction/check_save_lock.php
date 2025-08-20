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

// Ensure data directory exists
$dataDir = 'data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

$lockFile = $dataDir . '/save_lock.json';

// Check if lock file exists and is recent
if (file_exists($lockFile)) {
    $content = file_get_contents($lockFile);
    $lockData = json_decode($content, true);
    
    if ($lockData && isset($lockData['timestamp'])) {
        $lockTime = strtotime($lockData['timestamp']);
        $currentTime = time();
        
        // Lock expires after 10 seconds
        if (($currentTime - $lockTime) < 10) {
            // Lock is active
            echo json_encode([
                'locked' => true,
                'user' => $lockData['user'] ?? 'unknown',
                'timestamp' => $lockTime * 1000 // Convert to milliseconds for JavaScript
            ]);
            exit;
        } else {
            // Lock has expired, remove it
            unlink($lockFile);
        }
    }
}

// No active lock
echo json_encode([
    'locked' => false,
    'timestamp' => time() * 1000 // Current time in milliseconds
]);
?>