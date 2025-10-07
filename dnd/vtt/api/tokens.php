<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    echo json_encode([
        'success' => true,
        'data' => loadVttJson('tokens.json'),
    ]);
    return;
}

http_response_code(501);
echo json_encode([
    'success' => false,
    'error' => 'Token mutations are not yet implemented.',
]);
