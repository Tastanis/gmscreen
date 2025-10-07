<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'GET') {
        respondJson(200, [
            'success' => true,
            'data' => loadScenesPayload(),
        ]);
    }

    if ($method === 'POST') {
        $payload = readJsonInput();
        $action = $payload['action'] ?? 'create-scene';

        if ($action === 'create-folder') {
            $folder = createFolder($payload);
            respondJson(200, [
                'success' => true,
                'data' => $folder,
            ]);
        }

        if ($action === 'create-scene') {
            $scene = createScene($payload);
            respondJson(200, [
                'success' => true,
                'data' => $scene,
            ]);
        }

        respondJson(400, [
            'success' => false,
            'error' => 'Unsupported action.',
        ]);
    }

    if ($method === 'DELETE') {
        $payload = readJsonInput();
        $sceneId = (string) ($payload['sceneId'] ?? $payload['id'] ?? '');
        if ($sceneId === '') {
            respondJson(400, [
                'success' => false,
                'error' => 'Scene id is required.',
            ]);
        }

        deleteScene($sceneId);

        respondJson(200, [
            'success' => true,
            'data' => [ 'sceneId' => $sceneId ],
        ]);
    }

    respondJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
} catch (Throwable $exception) {
    error_log('[VTT] Scene API error: ' . $exception->getMessage());
    respondJson(500, [
        'success' => false,
        'error' => 'Unexpected server error.',
    ]);
}

function readJsonInput(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function loadScenesPayload(): array
{
    $data = loadVttJson('scenes.json');
    if (!is_array($data)) {
        return [ 'folders' => [], 'items' => [] ];
    }

    return [
        'folders' => normalizeCollection($data['folders'] ?? []),
        'items' => normalizeCollection($data['scenes'] ?? []),
    ];
}

function createFolder(array $payload): array
{
    $name = trim((string) ($payload['name'] ?? ''));
    if ($name === '') {
        respondJson(422, [
            'success' => false,
            'error' => 'Folder name cannot be empty.',
        ]);
    }

    $storage = loadScenesPayload();

    $folder = [
        'id' => generateId('fld'),
        'name' => truncateString($name, 120),
        'createdAt' => date(DATE_ATOM),
    ];

    $storage['folders'][] = $folder;
    persistScenes($storage);

    return $folder;
}

function createScene(array $payload): array
{
    $mapUrl = trim((string) ($payload['mapUrl'] ?? ''));
    if ($mapUrl === '') {
        respondJson(422, [
            'success' => false,
            'error' => 'A map upload is required to save a scene.',
        ]);
    }

    $storage = loadScenesPayload();
    $folderId = isset($payload['folderId']) ? trim((string) $payload['folderId']) : '';
    $folderId = $folderId !== '' ? $folderId : null;

    $folder = null;
    if ($folderId !== null) {
        foreach ($storage['folders'] as $existing) {
            if (($existing['id'] ?? null) === $folderId) {
                $folder = $existing;
                break;
            }
        }

        if ($folder === null) {
            respondJson(422, [
                'success' => false,
                'error' => 'Selected folder does not exist.',
            ]);
        }
    }

    $scene = [
        'id' => generateId('scn'),
        'name' => truncateString(trim((string) ($payload['name'] ?? '')), 160) ?: 'Untitled Scene',
        'folderId' => $folderId,
        'mapUrl' => $mapUrl,
        'grid' => sanitizeGrid($payload['grid'] ?? []),
        'createdAt' => date(DATE_ATOM),
    ];

    $storage['items'][] = $scene;
    persistScenes($storage);

    if ($folder !== null) {
        $scene['folder'] = $folder;
    }

    return $scene;
}

function deleteScene(string $sceneId): void
{
    $storage = loadScenesPayload();
    $before = count($storage['items']);
    $storage['items'] = array_values(array_filter(
        $storage['items'],
        static fn ($scene) => ($scene['id'] ?? null) !== $sceneId
    ));

    if ($before === count($storage['items'])) {
        respondJson(404, [
            'success' => false,
            'error' => 'Scene not found.',
        ]);
    }

    persistScenes($storage);
}

function sanitizeGrid($grid): array
{
    $size = 64;
    $locked = false;
    $visible = true;

    if (is_array($grid)) {
        $sizeValue = isset($grid['size']) ? (int) $grid['size'] : 64;
        $size = max(8, min(320, $sizeValue));
        $locked = isset($grid['locked']) ? (bool) $grid['locked'] : false;
        $visible = isset($grid['visible']) ? (bool) $grid['visible'] : true;
    }

    return [
        'size' => $size,
        'locked' => $locked,
        'visible' => $visible,
    ];
}

function persistScenes(array $storage): void
{
    $payload = [
        'folders' => normalizeCollection($storage['folders'] ?? []),
        'scenes' => normalizeCollection($storage['items'] ?? []),
    ];

    if (!saveVttJson('scenes.json', $payload)) {
        respondJson(500, [
            'success' => false,
            'error' => 'Failed to save scenes.',
        ]);
    }
}

function normalizeCollection($collection): array
{
    if (!is_array($collection)) {
        return [];
    }

    return array_values(array_filter(
        $collection,
        static fn ($item) => is_array($item) && isset($item['id'])
    ));
}

function generateId(string $prefix): string
{
    try {
        $random = bin2hex(random_bytes(6));
    } catch (Exception $exception) {
        $random = uniqid();
    }

    return $prefix . '_' . $random;
}

function respondJson(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function truncateString(string $value, int $length): string
{
    if ($length <= 0) {
        return '';
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $length);
    }

    return substr($value, 0, $length);
}
