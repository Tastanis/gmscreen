<?php
declare(strict_types=1);

http_response_code(410);
header('Content-Type: application/json');
echo json_encode([
    'status' => 'error',
    'message' => 'Standalone combat tracker API is disabled. Use the canonical VTT board state combat field.',
    'canonicalStatePath' => 'boardState.sceneState[sceneId].combat'
]);
