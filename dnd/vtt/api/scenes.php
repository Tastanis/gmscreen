<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

try {
    $auth = getVttUserContext();
    if (!($auth['isLoggedIn'] ?? false)) {
        respondJson(401, [
            'success' => false,
            'error' => 'Authentication required.',
        ]);
    }

    if (!($auth['isGM'] ?? false)) {
        respondJson(403, [
            'success' => false,
            'error' => 'Only the GM can manage scenes.',
        ]);
    }

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

        if ($action === 'update-scene-grid') {
            $scene = updateSceneGrid($payload);
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

    $thumbnailUrl = isset($payload['thumbnailUrl']) ? trim((string) $payload['thumbnailUrl']) : '';

    $scene = [
        'id' => generateId('scn'),
        'name' => truncateString(trim((string) ($payload['name'] ?? '')), 160) ?: 'Untitled Scene',
        'folderId' => $folderId,
        'mapUrl' => $mapUrl,
        'thumbnailUrl' => $thumbnailUrl !== '' ? $thumbnailUrl : null,
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

function updateSceneGrid(array $payload): array
{
    $sceneId = trim((string) ($payload['sceneId'] ?? $payload['id'] ?? ''));
    if ($sceneId === '') {
        respondJson(400, [
            'success' => false,
            'error' => 'Scene id is required.',
        ]);
    }

    $storage = loadScenesPayload();
    foreach ($storage['items'] as &$scene) {
        if (($scene['id'] ?? null) !== $sceneId) {
            continue;
        }

        $scene['grid'] = sanitizeGrid($payload['grid'] ?? []);
        $scene['updatedAt'] = date(DATE_ATOM);
        $updatedScene = $scene;
        unset($scene);
        persistScenes($storage);
        return $updatedScene;
    }
    unset($scene);

    respondJson(404, [
        'success' => false,
        'error' => 'Scene not found.',
    ]);
}

function sanitizeGrid($grid): array
{
    $size = 64.0;
    $locked = false;
    $visible = true;
    $offsetX = 0.0;
    $offsetY = 0.0;

    if (is_array($grid)) {
        $sizeValue = isset($grid['size']) && is_numeric($grid['size']) ? (float) $grid['size'] : 64.0;
        $size = roundGridValue(max(8.0, min(320.0, $sizeValue)));
        $locked = isset($grid['locked']) ? (bool) $grid['locked'] : false;
        $visible = isset($grid['visible']) ? (bool) $grid['visible'] : true;
        $offsetX = normalizeGridOffset($grid['offsetX'] ?? $grid['originX'] ?? $grid['x'] ?? null, $size);
        $offsetY = normalizeGridOffset($grid['offsetY'] ?? $grid['originY'] ?? $grid['y'] ?? null, $size);
    }

    return [
        'size' => $size,
        'locked' => $locked,
        'visible' => $visible,
        'offsetX' => $offsetX,
        'offsetY' => $offsetY,
    ];
}

function roundGridValue(float $value): float
{
    $rounded = round($value, 2);
    return abs($rounded) < 0.01 ? 0.0 : $rounded;
}

function normalizeGridOffset($value, float $size): float
{
    if (!is_numeric($value) || $size <= 0) {
        return 0.0;
    }

    $offset = fmod((float) $value, $size);
    if ($offset < 0) {
        $offset += $size;
    }

    if ($offset < 0.01 || $offset >= $size - 0.01) {
        return 0.0;
    }

    return roundGridValue($offset);
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
