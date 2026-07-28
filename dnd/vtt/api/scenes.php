<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/../lib/PusherClient.php';

// This helper must be declared before the request router. Because the
// declaration is guarded for include-based tests, PHP does not register it
// until execution reaches this block.
if (!function_exists('respondSceneJson')) {
    function respondSceneJson(int $status, array $payload): void
    {
        http_response_code($status);
        echo json_encode($payload);
        exit;
    }
}

if (!defined('VTT_SCENES_API_INCLUDE_ONLY')) {
header('Content-Type: application/json');

try {
    $auth = getVttUserContext();
    if (!($auth['isLoggedIn'] ?? false)) {
        respondSceneJson(401, [
            'success' => false,
            'error' => 'Authentication required.',
        ]);
    }

    if (!($auth['isGM'] ?? false)) {
        respondSceneJson(403, [
            'success' => false,
            'error' => 'Only the GM can manage scenes.',
        ]);
    }

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'GET') {
        respondSceneJson(200, [
            'success' => true,
            'data' => loadScenesPayload(),
        ]);
    }

    if ($method === 'POST') {
        $payload = readSceneJsonInput();
        $action = $payload['action'] ?? 'create-scene';

        if ($action === 'create-folder') {
            $folder = createFolder($payload);
            respondSceneJson(200, [
                'success' => true,
                'data' => $folder,
            ]);
        }

        if ($action === 'create-scene') {
            $scene = createScene($payload);
            respondSceneJson(200, [
                'success' => true,
                'data' => $scene,
            ]);
        }

        if ($action === 'update-scene-grid') {
            $scene = updateSceneGrid($payload);
            respondSceneJson(200, [
                'success' => true,
                'data' => $scene,
            ]);
        }

        if ($action === 'update-scene-visibility') {
            $scene = updateSceneVisibility($payload);
            respondSceneJson(200, [
                'success' => true,
                'data' => $scene,
            ]);
        }

        respondSceneJson(400, [
            'success' => false,
            'error' => 'Unsupported action.',
        ]);
    }

    if ($method === 'DELETE') {
        $payload = readSceneJsonInput();
        $sceneId = (string) ($payload['sceneId'] ?? $payload['id'] ?? '');
        if ($sceneId === '') {
            respondSceneJson(400, [
                'success' => false,
                'error' => 'Scene id is required.',
            ]);
        }

        $version = deleteScene($sceneId);

        respondSceneJson(200, [
            'success' => true,
            'data' => [
                'sceneId' => $sceneId,
                'version' => $version,
            ],
        ]);
    }

    respondSceneJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
} catch (Throwable $exception) {
    error_log('[VTT] Scene API error: ' . $exception->getMessage());
    respondSceneJson(500, [
        'success' => false,
        'error' => 'Unexpected server error.',
    ]);
}
}

function readSceneJsonInput(): array
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
        respondSceneJson(422, [
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
        respondSceneJson(422, [
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
            respondSceneJson(422, [
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
        'playerVisible' => isset($payload['playerVisible']) ? (bool) $payload['playerVisible'] : true,
        'createdAt' => date(DATE_ATOM),
    ];

    $storage['items'][] = $scene;
    persistScenes($storage);

    if ($folder !== null) {
        $scene['folder'] = $folder;
    }

    return $scene;
}

function deleteScene(string $sceneId, bool $broadcast = true): int
{
    $result = withVttBoardStateLock(static function () use ($sceneId): array {
        $storage = loadScenesPayload();
        $before = count($storage['items']);
        $storage['items'] = array_values(array_filter(
            $storage['items'],
            static fn ($scene) => ($scene['id'] ?? null) !== $sceneId
        ));

        if ($before === count($storage['items'])) {
            respondSceneJson(404, [
                'success' => false,
                'error' => 'Scene not found.',
            ]);
        }

        $rawBoardState = loadVttJson('board-state.json');
        $boardState = is_array($rawBoardState) ? $rawBoardState : [];
        $boardState = removeSceneBoardStateReferences($boardState, $sceneId);
        $version = bumpSceneDeletionBoardStateVersion($boardState);

        // Commit board cleanup first. If the following scenes.json write ever
        // fails, the scene remains registered but cannot become an active
        // combat ghost. The reverse ordering could permanently orphan an
        // active encounter after a partial failure.
        if (!saveVttJson('board-state.json', $boardState)) {
            throw new RuntimeException('Failed to clean deleted scene board state.');
        }

        $payload = [
            'folders' => normalizeCollection($storage['folders'] ?? []),
            'scenes' => normalizeCollection($storage['items'] ?? []),
        ];
        if (!saveVttJson('scenes.json', $payload)) {
            throw new RuntimeException('Failed to save scene deletion.');
        }

        return [
            'version' => $version,
            'state' => $boardState,
        ];
    });

    $version = (int) ($result['version'] ?? 0);
    if ($broadcast) {
        broadcastSceneDeletionUpdate([
            'type' => 'ops-overflow',
            'version' => $version,
            'timestamp' => (int) round(microtime(true) * 1000),
            'authorId' => 'gm',
            'authorRole' => 'gm',
            'publicView' => true,
        ]);
    }

    return $version;
}

/**
 * @param array<string,mixed> $state
 */
function bumpSceneDeletionBoardStateVersion(array &$state): int
{
    $current = isset($state['_version']) ? max(0, (int) $state['_version']) : 0;
    $state['_version'] = $current + 1;
    return $state['_version'];
}

/**
 * Scene deletion is served separately from state.php, so emit the same
 * content-free resync marker without coupling the two API entrypoints.
 *
 * @param array<string,mixed> $update
 */
function broadcastSceneDeletionUpdate(array $update): bool
{
    $configPath = __DIR__ . '/../config/pusher.php';
    if (!is_file($configPath)) {
        return false;
    }
    $config = require $configPath;
    if (
        !is_array($config)
        || empty($config['enabled'])
        || empty($config['app_id'])
        || empty($config['key'])
        || empty($config['secret'])
    ) {
        return false;
    }

    try {
        $client = new PusherClient(
            (string) $config['app_id'],
            (string) $config['key'],
            (string) $config['secret'],
            (string) ($config['cluster'] ?? 'us3'),
            (int) ($config['timeout'] ?? 5)
        );
        return $client->trigger(
            (string) ($config['channel'] ?? 'vtt-board'),
            'state-updated',
            $update
        );
    } catch (Throwable $exception) {
        error_log('[VTT] Scene deletion broadcast failed: ' . $exception->getMessage());
        return false;
    }
}

/**
 * Removes only data owned by one deleted scene. Other scenes and unknown
 * top-level board fields are preserved verbatim.
 *
 * @param array<string,mixed> $state
 * @return array<string,mixed>
 */
function removeSceneBoardStateReferences(array $state, string $sceneId): array
{
    $sceneId = trim($sceneId);
    if ($sceneId === '') {
        return $state;
    }

    foreach (['placements', 'templates', 'drawings', 'sceneState', 'claims'] as $field) {
        if (isset($state[$field]) && is_array($state[$field])) {
            unset($state[$field][$sceneId]);
        }
    }

    if (isset($state['pings']) && is_array($state['pings'])) {
        unset($state['pings'][$sceneId]);
        $state['pings'] = array_values(array_filter(
            $state['pings'],
            static fn ($ping) => !is_array($ping)
                || !isset($ping['sceneId'])
                || trim((string) $ping['sceneId']) !== $sceneId
        ));
    }

    if (($state['activeSceneId'] ?? null) === $sceneId) {
        $state['activeSceneId'] = null;
        $state['mapUrl'] = null;
    }
    if (($state['playerActiveSceneId'] ?? null) === $sceneId) {
        $state['playerActiveSceneId'] = null;
        $state['playerMapUrl'] = null;
        $state['playerThumbnailUrl'] = null;
    }

    return $state;
}

function updateSceneVisibility(array $payload): array
{
    $sceneId = trim((string) ($payload['sceneId'] ?? $payload['id'] ?? ''));
    if ($sceneId === '') {
        respondSceneJson(400, [
            'success' => false,
            'error' => 'Scene id is required.',
        ]);
    }

    $storage = loadScenesPayload();
    foreach ($storage['items'] as &$scene) {
        if (($scene['id'] ?? null) !== $sceneId) {
            continue;
        }

        $scene['playerVisible'] = isset($payload['playerVisible']) ? (bool) $payload['playerVisible'] : true;
        $scene['updatedAt'] = date(DATE_ATOM);
        $updatedScene = $scene;
        unset($scene);
        persistScenes($storage);
        return $updatedScene;
    }
    unset($scene);

    respondSceneJson(404, [
        'success' => false,
        'error' => 'Scene not found.',
    ]);
}

function updateSceneGrid(array $payload): array
{
    $sceneId = trim((string) ($payload['sceneId'] ?? $payload['id'] ?? ''));
    if ($sceneId === '') {
        respondSceneJson(400, [
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

    respondSceneJson(404, [
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
        respondSceneJson(500, [
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
