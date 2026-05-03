<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/monster_helpers.php';

header('Content-Type: application/json');

try {
    $auth = getVttUserContext();
    $isGm = (bool) ($auth['isGM'] ?? false);

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method !== 'GET') {
        respondJson(405, [
            'success' => false,
            'error' => 'Method not allowed.',
        ]);
    }

    $action = isset($_GET['action']) ? trim((string) $_GET['action']) : '';
    $monsterId = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($action === 'movement') {
        if ($monsterId === '') {
            respondJson(400, [
                'success' => false,
                'error' => 'Monster id is required.',
            ]);
        }
        $monster = findMonsterById($monsterId);
        if ($monster === null) {
            respondJson(404, [
                'success' => false,
                'error' => 'Monster not found.',
            ]);
        }

        respondJson(200, [
            'success' => true,
            'data' => [
                'id' => $monster['id'] ?? $monsterId,
                'name' => $monster['name'] ?? '',
                'speed' => $monster['speed'] ?? null,
                'movement' => $monster['movement'] ?? null,
            ],
        ]);
    }

    if (!$isGm) {
        respondJson(403, [
            'success' => false,
            'error' => 'Only the GM can access monster data.',
        ]);
    }

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
