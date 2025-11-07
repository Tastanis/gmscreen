<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/monster_helpers.php';

header('Content-Type: application/json');

try {
    $auth = getVttUserContext();
    $isGm = (bool) ($auth['isGM'] ?? false);

    if (!$isGm) {
        respondJson(403, [
            'success' => false,
            'error' => 'Only the GM can access monster data.',
        ]);
    }

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method !== 'GET') {
        respondJson(405, [
            'success' => false,
            'error' => 'Method not allowed.',
        ]);
    }

    $monsterId = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($monsterId !== '') {
        $monster = findMonsterById($monsterId);
        if ($monster === null) {
            respondJson(404, [
                'success' => false,
                'error' => 'Monster not found.',
            ]);
        }

        respondJson(200, [
            'success' => true,
            'data' => $monster,
        ]);
    }

    $summaries = getMonsterSummaries();
    respondJson(200, [
        'success' => true,
        'data' => $summaries,
    ]);
} catch (Throwable $exception) {
    error_log('[VTT] Monster API error: ' . $exception->getMessage());
    respondJson(500, [
        'success' => false,
        'error' => 'Unexpected server error.',
    ]);
}

function respondJson(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}
