<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

header('Content-Type: application/json');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    if ($method === 'GET') {
        $config = getVttBootstrapConfig();
        $auth = getVttUserContext();
        if (!($auth['isGM'] ?? false)) {
            $config['boardState'] = filterPlacementsForPlayerView($config['boardState'] ?? []);
        }
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

        $isGm = (bool) ($auth['isGM'] ?? false);
        if (!$isGm) {
            $combatUpdates = [];
            if (isset($updates['sceneState']) && is_array($updates['sceneState'])) {
                $combatUpdates = extractCombatUpdates($updates['sceneState']);
            }

            if (empty($combatUpdates)) {
                respondJson(403, [
                    'success' => false,
                    'error' => 'Only combat tracker updates are permitted for players.',
                ]);
            }

            foreach ($combatUpdates as $sceneId => $combatState) {
                if (!isset($nextState['sceneState'][$sceneId]) || !is_array($nextState['sceneState'][$sceneId])) {
                    $nextState['sceneState'][$sceneId] = [
                        'grid' => normalizeGridSettings([]),
                    ];
                }
                $nextState['sceneState'][$sceneId]['combat'] = $combatState;
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

        foreach ($updates as $key => $value) {
            if ($key === 'sceneState' && is_array($value)) {
                foreach ($value as $sceneId => $config) {
                    if (!isset($nextState['sceneState'][$sceneId]) || !is_array($nextState['sceneState'][$sceneId])) {
                        $nextState['sceneState'][$sceneId] = $config;
                        continue;
                    }
                    $nextState['sceneState'][$sceneId] = array_merge($nextState['sceneState'][$sceneId], $config);
                }
                continue;
            }
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

    if (array_key_exists('overlay', $raw)) {
        $rawOverlay = $raw['overlay'];
        if ($rawOverlay === null) {
            $updates['overlay'] = normalizeOverlayPayload([]);
        } elseif (is_array($rawOverlay)) {
            $updates['overlay'] = normalizeOverlayPayload($rawOverlay);
        } else {
            throw new InvalidArgumentException('Overlay must be an array or object.');
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
        'overlay' => normalizeOverlayPayload([]),
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

    if (array_key_exists('overlay', $raw) && is_array($raw['overlay'])) {
        $state['overlay'] = normalizeOverlayPayload($raw['overlay']);
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
        $entry = [
            'grid' => normalizeGridSettings($gridSource),
            'overlay' => normalizeOverlayPayload($config['overlay'] ?? []),
        ];

        if (array_key_exists('combat', $config)) {
            $entry['combat'] = normalizeCombatStatePayload($config['combat']);
        }

        $normalized[$key] = $entry;
    }

    return $normalized;
}

/**
 * @param mixed $rawCombat
 */
function normalizeCombatStatePayload($rawCombat): array
{
    $state = [
        'active' => false,
        'round' => 0,
        'activeCombatantId' => null,
        'completedCombatantIds' => [],
        'startingTeam' => null,
        'currentTeam' => null,
        'lastTeam' => null,
        'roundTurnCount' => 0,
        'updatedAt' => time(),
        'turnLock' => null,
    ];

    if (!is_array($rawCombat)) {
        return $state;
    }

    $state['active'] = !empty($rawCombat['active']) || !empty($rawCombat['isActive']);
    if (array_key_exists('round', $rawCombat) && is_numeric($rawCombat['round'])) {
        $state['round'] = max(0, (int) round((float) $rawCombat['round']));
    }

    if (isset($rawCombat['activeCombatantId']) && is_string($rawCombat['activeCombatantId'])) {
        $trimmed = trim($rawCombat['activeCombatantId']);
        $state['activeCombatantId'] = $trimmed === '' ? null : $trimmed;
    }

    if (isset($rawCombat['completedCombatantIds']) && is_array($rawCombat['completedCombatantIds'])) {
        $ids = [];
        foreach ($rawCombat['completedCombatantIds'] as $candidate) {
            if (!is_string($candidate)) {
                continue;
            }
            $trimmed = trim($candidate);
            if ($trimmed === '' || in_array($trimmed, $ids, true)) {
                continue;
            }
            $ids[] = $trimmed;
        }
        $state['completedCombatantIds'] = $ids;
    }

    $state['startingTeam'] = normalizeCombatTeamValue($rawCombat['startingTeam'] ?? $rawCombat['initialTeam'] ?? null);
    $state['currentTeam'] = normalizeCombatTeamValue($rawCombat['currentTeam'] ?? $rawCombat['activeTeam'] ?? null);
    $state['lastTeam'] = normalizeCombatTeamValue($rawCombat['lastTeam'] ?? $rawCombat['previousTeam'] ?? null);

    if (isset($rawCombat['roundTurnCount']) && is_numeric($rawCombat['roundTurnCount'])) {
        $state['roundTurnCount'] = max(0, (int) round((float) $rawCombat['roundTurnCount']));
    }

    if (isset($rawCombat['updatedAt']) && is_numeric($rawCombat['updatedAt'])) {
        $state['updatedAt'] = max(0, (int) round((float) $rawCombat['updatedAt']));
    }

    $state['turnLock'] = normalizeCombatTurnLock($rawCombat['turnLock'] ?? null);

    return $state;
}

/**
 * @param mixed $value
 */
function normalizeCombatTeamValue($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === 'ally' || $normalized === 'enemy') {
        return $normalized;
    }

    return null;
}

/**
 * @param mixed $rawLock
 */
function normalizeCombatTurnLock($rawLock): ?array
{
    if (!is_array($rawLock)) {
        return null;
    }

    $holderId = isset($rawLock['holderId']) && is_string($rawLock['holderId']) ? strtolower(trim($rawLock['holderId'])) : '';
    if ($holderId === '') {
        return null;
    }

    $holderName = isset($rawLock['holderName']) && is_string($rawLock['holderName']) ? trim($rawLock['holderName']) : '';
    $combatantId = isset($rawLock['combatantId']) && is_string($rawLock['combatantId']) ? trim($rawLock['combatantId']) : '';
    $lockedAt = isset($rawLock['lockedAt']) && is_numeric($rawLock['lockedAt'])
        ? max(0, (int) round((float) $rawLock['lockedAt']))
        : time();

    return [
        'holderId' => $holderId,
        'holderName' => $holderName,
        'combatantId' => $combatantId === '' ? null : $combatantId,
        'lockedAt' => $lockedAt,
    ];
}

/**
 * @param array<string,mixed> $sceneStateUpdates
 * @return array<string,array<string,mixed>>
 */
function extractCombatUpdates(array $sceneStateUpdates): array
{
    $updates = [];

    foreach ($sceneStateUpdates as $sceneId => $config) {
        if (!is_array($config) || !array_key_exists('combat', $config)) {
            continue;
        }

        $key = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
        if ($key === '') {
            continue;
        }

        $updates[$key] = normalizeCombatStatePayload($config['combat']);
    }

    return $updates;
}

/**
 * @param array<string,mixed> $rawOverlay
 */
function normalizeOverlayPayload($rawOverlay): array
{
    $overlay = [
        'mapUrl' => null,
        'mask' => createEmptyOverlayMask(),
    ];

    if (!is_array($rawOverlay)) {
        return $overlay;
    }

    if (array_key_exists('mapUrl', $rawOverlay) && is_string($rawOverlay['mapUrl'])) {
        $trimmed = trim($rawOverlay['mapUrl']);
        $overlay['mapUrl'] = $trimmed === '' ? null : $trimmed;
    }

    if (array_key_exists('mask', $rawOverlay)) {
        $overlay['mask'] = normalizeOverlayMaskPayload($rawOverlay['mask']);
    }

    return $overlay;
}

function createEmptyOverlayMask(): array
{
    return ['visible' => true, 'polygons' => []];
}

function normalizeOverlayMaskPayload($rawMask): array
{
    $mask = createEmptyOverlayMask();

    if (!is_array($rawMask)) {
        return $mask;
    }

    if (array_key_exists('visible', $rawMask)) {
        $mask['visible'] = (bool) $rawMask['visible'];
    }

    if (array_key_exists('url', $rawMask) && is_string($rawMask['url'])) {
        $trimmed = trim($rawMask['url']);
        if ($trimmed !== '') {
            $mask['url'] = $trimmed;
        }
    }

    $polygons = [];
    if (array_key_exists('polygons', $rawMask) && is_array($rawMask['polygons'])) {
        foreach ($rawMask['polygons'] as $polygon) {
            $pointsSource = null;
            if (is_array($polygon)) {
                if (array_key_exists('points', $polygon) && is_array($polygon['points'])) {
                    $pointsSource = $polygon['points'];
                } elseif (array_keys($polygon) === range(0, count($polygon) - 1)) {
                    $pointsSource = $polygon;
                }
            }

            if (!is_array($pointsSource)) {
                continue;
            }

            $points = [];
            foreach ($pointsSource as $point) {
                $normalizedPoint = normalizeOverlayMaskPoint($point);
                if ($normalizedPoint !== null) {
                    $points[] = $normalizedPoint;
                }
            }

            if (count($points) >= 3) {
                $polygons[] = ['points' => $points];
            }
        }
    }

    if (!empty($polygons)) {
        $mask['polygons'] = $polygons;
    }

    return $mask;
}

function normalizeOverlayMaskPoint($point): ?array
{
    if (!is_array($point)) {
        return null;
    }

    $column = coerceFloat($point['column'] ?? ($point['x'] ?? null), null, 4);
    $row = coerceFloat($point['row'] ?? ($point['y'] ?? null), null, 4);

    if ($column === null || $row === null) {
        return null;
    }

    return ['column' => $column, 'row' => $row];
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
