<?php
declare(strict_types=1);

http_response_code(501);
header('Content-Type: application/json');
echo json_encode([
    'status' => 'error',
    'message' => 'Combat tracker snapshot API not implemented yet.'
]);
