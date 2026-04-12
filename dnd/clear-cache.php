<?php
// Server-side cache clearing endpoint
// Clears PHP OPcache and realpath cache so updated files are picked up immediately.
// Only the GM may invoke this (it's a testing/dev helper).

session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || ($_SESSION['user'] ?? '') !== 'GM') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Not authorized']);
    exit;
}

$cleared = [];

// Reset PHP OPcache if available (this is what usually causes "old file" behavior on hosts with OPcache enabled)
if (function_exists('opcache_reset')) {
    if (@opcache_reset()) {
        $cleared[] = 'opcache';
    }
}

// Reset realpath cache
if (function_exists('clearstatcache')) {
    clearstatcache(true);
    $cleared[] = 'statcache';
}

// Clear APCu user cache if available
if (function_exists('apcu_clear_cache')) {
    @apcu_clear_cache();
    $cleared[] = 'apcu';
}

echo json_encode([
    'success' => true,
    'cleared' => $cleared,
    'timestamp' => time()
]);
