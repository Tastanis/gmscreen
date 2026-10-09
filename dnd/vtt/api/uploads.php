<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (strtoupper($method) !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Only POST requests are supported for uploads.',
    ]);
    return;
}

$auth = getVttUserContext();
if (!($auth['isLoggedIn'] ?? false)) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Authentication required.',
    ]);
    return;
}

if (!($auth['isGM'] ?? false)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'Only the GM can upload scene maps.',
    ]);
    return;
}

if (!isset($_FILES['map'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'No map image was provided.',
    ]);
    return;
}

// Checking the picture and filing it is shared with the key-guarded site upload.
require_once __DIR__ . '/../lib/MapImageStore.php';
[$status, $payload] = MapImageStore::store($_FILES['map']);
if ($status !== 200) {
    http_response_code($status);
}
echo json_encode($payload);
