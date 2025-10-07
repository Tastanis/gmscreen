<?php
declare(strict_types=1);

header('Content-Type: application/json');
http_response_code(501);

echo json_encode([
    'success' => false,
    'error' => 'Upload handling will be implemented in a future iteration.',
]);
