<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    if ($method === 'GET') {
        $config = getVttBootstrapConfig();
        respondJson(200, [
            'success' => true,
            'data' => [
                'scenes' => $config['scenes'],
                'tokens' => $config['tokens'],
                'boardState' => $config['boardState'],
            ],
        ]);
    }

    if ($method === 'POST') {
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
                'error' => 'Only the GM can update the board state.',
            ]);
        }

        $payload = readJsonInput();
        $rawState = [];
        if (isset($payload['boardState']) && is_array($payload['boardState'])) {
            $rawState = $payload['boardState'];
        } elseif (is_array($payload)) {
            $rawState = $payload;
        }

        $updates = sanitizeBoardStateUpdates($rawState);
        if (empty($updates)) {
            respondJson(422, [
                'success' => false,
                'error' => 'No board state changes were provided.',
            ]);
        }

        $existing = loadVttJson('board-state.json');
        $nextState = normalizeBoardState($existing);

        foreach ($updates as $key => $value) {
            $nextState[$key] = $value;
        }

        if (!saveVttJson('board-state.json', $nextState)) {
            respondJson(500, [
                'success' => false,
                'error' => 'Failed to persist board state.',
            ]);
        }

        respondJson(200, [
            'success' => true,
            'data' => $nextState,
        ]);
    }

    respondJson(405, [
        'success' => false,
        'error' => 'Method not allowed.',
    ]);
} catch (InvalidArgumentException $exception) {
    respondJson(422, [
        'success' => false,
        'error' => $exception->getMessage() ?: 'Invalid board state payload.',
    ]);
} catch (Throwable $exception) {
    error_log('[VTT] State API error: ' . $exception->getMessage());
    respondJson(500, [
        'success' => false,
        'error' => 'Failed to process board state.',
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

/**
 * @param array<string,mixed> $raw
 * @return array<string,mixed>
 */
function sanitizeBoardStateUpdates(array $raw): array
{
    $updates = [];

    if (array_key_exists('activeSceneId', $raw)) {
        $rawId = $raw['activeSceneId'];
        if ($rawId === null) {
            $updates['activeSceneId'] = null;
        } elseif (is_string($rawId)) {
            $trimmed = trim($rawId);
            $updates['activeSceneId'] = $trimmed === '' ? null : $trimmed;
        } else {
            throw new InvalidArgumentException('Active scene id must be a string or null.');
        }
    }

    if (array_key_exists('mapUrl', $raw)) {
        $rawUrl = $raw['mapUrl'];
        if ($rawUrl === null) {
            $updates['mapUrl'] = null;
        } elseif (is_string($rawUrl)) {
            $trimmed = trim($rawUrl);
            $updates['mapUrl'] = $trimmed === '' ? null : $trimmed;
        } else {
            throw new InvalidArgumentException('Map URL must be a string or null.');
        }
    }

    if (array_key_exists('placements', $raw)) {
        $rawPlacements = $raw['placements'];
        if ($rawPlacements === null) {
            $updates['placements'] = [];
        } elseif (is_array($rawPlacements)) {
            $updates['placements'] = normalizePlacementsPayload($rawPlacements);
        } else {
            throw new InvalidArgumentException('Placements must be an array or object.');
        }
    }

    if (array_key_exists('sceneState', $raw)) {
        $rawSceneState = $raw['sceneState'];
        if ($rawSceneState === null) {
            $updates['sceneState'] = [];
        } elseif (is_array($rawSceneState)) {
            $updates['sceneState'] = normalizeSceneStatePayload($rawSceneState);
        } else {
            throw new InvalidArgumentException('Scene state must be an array or object.');
        }
    }

    if (array_key_exists('templates', $raw)) {
        $rawTemplates = $raw['templates'];
        if ($rawTemplates === null) {
            $updates['templates'] = [];
        } elseif (is_array($rawTemplates)) {
            $updates['templates'] = normalizeTemplatesPayload($rawTemplates);
        } else {
            throw new InvalidArgumentException('Templates must be an array or object.');
        }
    }

    return $updates;
}

/**
 * @param mixed $raw
 * @return array{activeSceneId: ?string, mapUrl: ?string, placements: array, sceneState: array, templates: array}
 */
function normalizeBoardState($raw): array
{
    $state = [
        'activeSceneId' => null,
        'mapUrl' => null,
        'placements' => [],
        'sceneState' => [],
        'templates' => [],
    ];

    if (!is_array($raw)) {
        return $state;
    }

    if (array_key_exists('activeSceneId', $raw)) {
        $value = $raw['activeSceneId'];
        if (is_string($value)) {
            $value = trim($value);
            $state['activeSceneId'] = $value === '' ? null : $value;
        } elseif ($value === null) {
            $state['activeSceneId'] = null;
        }
    }

    if (array_key_exists('mapUrl', $raw)) {
        $value = $raw['mapUrl'];
        if (is_string($value)) {
            $value = trim($value);
            $state['mapUrl'] = $value === '' ? null : $value;
        } elseif ($value === null) {
            $state['mapUrl'] = null;
        }
    }

    if (array_key_exists('placements', $raw) && is_array($raw['placements'])) {
        $state['placements'] = normalizePlacementsPayload($raw['placements']);
    }

    if (array_key_exists('sceneState', $raw) && is_array($raw['sceneState'])) {
        $state['sceneState'] = normalizeSceneStatePayload($raw['sceneState']);
    }

    if (array_key_exists('templates', $raw) && is_array($raw['templates'])) {
        $state['templates'] = normalizeTemplatesPayload($raw['templates']);
    }

    return $state;
}

/**
 * @param array<string|int,mixed> $rawPlacements
 * @return array<string,array<int,array<string,mixed>>>
 */
function normalizePlacementsPayload(array $rawPlacements): array
{
    $normalized = [];
    foreach ($rawPlacements as $sceneId => $placements) {
        if (!is_array($placements)) {
            continue;
        }

        $key = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
        if ($key === '') {
            continue;
        }

        $normalized[$key] = array_values(array_filter($placements, 'is_array'));
    }

    return $normalized;
}

/**
 * @param array<string|int,mixed> $rawTemplates
 * @return array<string,array<int,array<string,mixed>>>
 */
function normalizeTemplatesPayload(array $rawTemplates): array
{
    $normalized = [];

    foreach ($rawTemplates as $sceneId => $templates) {
        if (!is_array($templates)) {
            continue;
        }

        $key = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
        if ($key === '') {
            continue;
        }

        $normalized[$key] = [];
        foreach ($templates as $entry) {
            $template = normalizeTemplateEntry($entry);
            if ($template !== null) {
                $normalized[$key][] = $template;
            }
        }
    }

    return $normalized;
}

/**
 * @param array<string|int,mixed> $rawSceneState
 * @return array<string,array<string,mixed>>
 */
function normalizeSceneStatePayload(array $rawSceneState): array
{
    $normalized = [];

    foreach ($rawSceneState as $sceneId => $config) {
        if (!is_array($config)) {
            continue;
        }

        $key = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
        if ($key === '') {
            continue;
        }

        $gridSource = $config['grid'] ?? $config;
        $normalized[$key] = [
            'grid' => normalizeGridSettings($gridSource),
        ];
    }

    return $normalized;
}

/**
 * @param mixed $grid
 */
function normalizeGridSettings($grid): array
{
    $size = 64;
    $locked = false;
    $visible = true;

    if (is_array($grid)) {
        if (array_key_exists('size', $grid) && is_numeric($grid['size'])) {
            $size = max(8, min(320, (int) round((float) $grid['size'])));
        }

        if (array_key_exists('locked', $grid)) {
            $locked = (bool) $grid['locked'];
        }

        if (array_key_exists('visible', $grid)) {
            $visible = (bool) $grid['visible'];
        }
    }

    return [
        'size' => $size,
        'locked' => $locked,
        'visible' => $visible,
    ];
}

/**
 * @param mixed $entry
 */
function normalizeTemplateEntry($entry): ?array
{
    if (!is_array($entry)) {
        return null;
    }

    $type = isset($entry['type']) && is_string($entry['type']) ? strtolower(trim($entry['type'])) : '';
    $id = isset($entry['id']) && is_string($entry['id']) ? trim($entry['id']) : '';
    if ($id === '' || !in_array($type, ['circle', 'rectangle', 'wall'], true)) {
        return null;
    }

    $color = sanitizeTemplateColor($entry['color'] ?? null);

    if ($type === 'circle') {
        $center = is_array($entry['center'] ?? null) ? $entry['center'] : [];
        $column = coerceFloat($center['column'] ?? null, 0.0, 4);
        $row = coerceFloat($center['row'] ?? null, 0.0, 4);
        $radius = max(0.5, coerceFloat($entry['radius'] ?? null, 0.5, 4));

        $normalized = [
            'id' => $id,
            'type' => 'circle',
            'center' => ['column' => $column, 'row' => $row],
            'radius' => $radius,
        ];
        if ($color !== null) {
            $normalized['color'] = $color;
        }

        return $normalized;
    }

    if ($type === 'rectangle') {
        $start = is_array($entry['start'] ?? null) ? $entry['start'] : [];
        $startColumn = max(0.0, coerceFloat($start['column'] ?? null, 0.0, 4));
        $startRow = max(0.0, coerceFloat($start['row'] ?? null, 0.0, 4));
        $length = max(1.0, coerceFloat($entry['length'] ?? null, 1.0, 4));
        $width = max(1.0, coerceFloat($entry['width'] ?? null, 1.0, 4));
        $rotation = coerceFloat($entry['rotation'] ?? null, 0.0, 2);

        $normalized = [
            'id' => $id,
            'type' => 'rectangle',
            'start' => ['column' => $startColumn, 'row' => $startRow],
            'length' => $length,
            'width' => $width,
            'rotation' => $rotation,
        ];
        if ($color !== null) {
            $normalized['color'] = $color;
        }

        if (isset($entry['anchor']) && is_array($entry['anchor'])) {
            $anchorColumn = coerceFloat($entry['anchor']['column'] ?? null, null, 4);
            $anchorRow = coerceFloat($entry['anchor']['row'] ?? null, null, 4);
            if ($anchorColumn !== null && $anchorRow !== null) {
                $normalized['anchor'] = [
                    'column' => max(0.0, $anchorColumn),
                    'row' => max(0.0, $anchorRow),
                ];
            }
        }

        if (isset($entry['orientation']) && is_array($entry['orientation'])) {
            $orientationX = isset($entry['orientation']['x']) && (float) $entry['orientation']['x'] < 0 ? -1 : 1;
            $orientationY = isset($entry['orientation']['y']) && (float) $entry['orientation']['y'] < 0 ? -1 : 1;
            $normalized['orientation'] = ['x' => $orientationX, 'y' => $orientationY];
        }

        return $normalized;
    }

    if ($type === 'wall') {
        $squares = [];
        if (isset($entry['squares']) && is_array($entry['squares'])) {
            foreach ($entry['squares'] as $square) {
                if (!is_array($square)) {
                    continue;
                }

                $column = isset($square['column']) && is_numeric($square['column'])
                    ? (int) round((float) $square['column'])
                    : null;
                $row = isset($square['row']) && is_numeric($square['row'])
                    ? (int) round((float) $square['row'])
                    : null;

                if ($column === null || $row === null) {
                    continue;
                }

                $squares[] = ['column' => max(0, $column), 'row' => max(0, $row)];
            }
        }

        $normalized = [
            'id' => $id,
            'type' => 'wall',
            'squares' => $squares,
        ];
        if ($color !== null) {
            $normalized['color'] = $color;
        }

        return $normalized;
    }

    return null;
}

/**
 * @param mixed $value
 */
function sanitizeTemplateColor($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    if ($trimmed === '' || strlen($trimmed) > 64) {
        return null;
    }

    if (preg_match('/^#([0-9a-f]{3,8})$/i', $trimmed) || preg_match('/^(rgba?|hsla?)\(/i', $trimmed)) {
        return $trimmed;
    }

    return null;
}

function coerceFloat($value, ?float $fallback, int $precision): ?float
{
    if (!is_numeric($value)) {
        return $fallback;
    }

    $float = (float) $value;
    return round($float, $precision);
}

function respondJson(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}
