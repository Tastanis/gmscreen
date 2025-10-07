<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

try {
    $config = getVttBootstrapConfig();
    echo json_encode([
        'success' => true,
        'data' => [
            'scenes' => $config['scenes'],
            'tokens' => $config['tokens'],
            'boardState' => $config['boardState'],
        ],
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to load VTT state.',
        'details' => $exception->getMessage(),
    ]);
}
