<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/state_helpers.php';
require_once __DIR__ . '/../lib/PusherClient.php';

const VTT_PING_RETENTION_MS = 10000;
const VTT_VERSION_FILE = 'board-state-version.json';

/**
 * Get the current board state version.
 * Version is a monotonically increasing integer that prevents stale updates.
 */
function getVttBoardStateVersion(): int
{
    $data = loadVttJson(VTT_VERSION_FILE);
    if (!is_array($data) || !isset($data['version'])) {
        return 0;
    }
    return max(0, (int) $data['version']);
}

/**
 * Increment and save the board state version.
 * Returns the new version number.
 */
function incrementVttBoardStateVersion(): int
{
    $current = getVttBoardStateVersion();
    $next = $current + 1;
    saveVttJson(VTT_VERSION_FILE, [
        'version' => $next,
        'updatedAt' => time(),
    ]);
    return $next;
}

/**
 * Create a Pusher client instance if configured and enabled.
 * Returns null if Pusher is not configured or disabled.
 */
function createVttPusherClient(): ?PusherClient
{
    $configPath = __DIR__ . '/../config/pusher.php';
    if (!is_file($configPath)) {
        return null;
    }

    $config = require $configPath;
    if (!is_array($config) || empty($config['enabled'])) {
        return null;
    }

    $appId = $config['app_id'] ?? '';
    $key = $config['key'] ?? '';
    $secret = $config['secret'] ?? '';
    $cluster = $config['cluster'] ?? 'us3';
    $timeout = (int) ($config['timeout'] ?? 5);

    if ($appId === '' || $key === '' || $secret === '') {
        return null;
    }

    return new PusherClient($appId, $key, $secret, $cluster, $timeout);
}

/**
 * Get the Pusher configuration for client-side initialization.
 * Only returns public information (key and cluster).
 */
function getVttPusherConfig(): ?array
{
    $configPath = __DIR__ . '/../config/pusher.php';
    if (!is_file($configPath)) {
        return null;
    }

    $config = require $configPath;
    if (!is_array($config) || empty($config['enabled'])) {
        return null;
    }

    return [
        'key' => $config['key'] ?? '',
        'cluster' => $config['cluster'] ?? 'us3',
        'channel' => $config['channel'] ?? 'vtt-board',
    ];
}

/**
 * Broadcast a state update via Pusher.
 * Fails silently if Pusher is not configured or the request fails.
 */
function broadcastVttStateUpdate(array $update, ?string $excludeSocketId = null): bool
{
    $pusher = createVttPusherClient();
    if ($pusher === null) {
        return false;
    }

    $configPath = __DIR__ . '/../config/pusher.php';
    $config = is_file($configPath) ? require $configPath : [];
    $channel = $config['channel'] ?? 'vtt-board';

    try {
        return $pusher->trigger($channel, 'state-updated', $update, $excludeSocketId);
    } catch (Throwable $e) {
        error_log('[VTT] Pusher broadcast failed: ' . $e->getMessage());
        return false;
    }
}

if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    header('Content-Type: application/json');

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    try {
        if ($method === 'GET') {
            $config = getVttBootstrapConfig();
            $auth = getVttUserContext();
            if (!($auth['isGM'] ?? false)) {
                $config['boardState'] = filterPlacementsForPlayerView($config['boardState'] ?? []);
            }

            // Include version for sync conflict detection
            $version = getVttBoardStateVersion();
            $boardState = $config['boardState'] ?? [];
            $boardState['_version'] = $version;
            // Mark as full sync so clients know to replace (not merge) scene data
            // This enables proper deletion sync - items not in this response should be removed
            $boardState['_fullSync'] = true;

            // Include Pusher config for client-side initialization
            $pusherConfig = getVttPusherConfig();

            respondJson(200, [
                'success' => true,
                'data' => [
                    'scenes' => $config['scenes'],
                    'tokens' => $config['tokens'],
                    'boardState' => $boardState,
                    'pusher' => $pusherConfig,
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

            // Extract client version and socket ID for Pusher exclusion
            $clientVersion = isset($rawState['_version']) ? (int) $rawState['_version'] : null;
            $clientSocketId = isset($rawState['_socketId']) && is_string($rawState['_socketId'])
                ? trim($rawState['_socketId'])
                : null;
            // Check if this is a delta-only update (only changed entities)
            $isDeltaOnly = !empty($rawState['_deltaOnly']);
            // Remove internal fields before processing
            unset($rawState['_version'], $rawState['_socketId'], $rawState['_deltaOnly']);

            $updates = sanitizeBoardStateUpdates($rawState);
            if (empty($updates)) {
                respondJson(422, [
                    'success' => false,
                    'error' => 'No board state changes were provided.',
                ]);
            }

            // Determine what changed for targeted Pusher broadcasts
            $changedFields = array_keys($updates);

            $responseState = withVttBoardStateLock(function () use ($updates, $auth, $clientVersion, $isDeltaOnly) {
                $existing = loadVttJson('board-state.json');
                $nextState = normalizeBoardState($existing);

                $isGm = (bool) ($auth['isGM'] ?? false);
                if (!$isGm) {
                    $combatUpdates = [];
                    if (isset($updates['sceneState']) && is_array($updates['sceneState'])) {
                        $combatUpdates = extractCombatUpdates($updates['sceneState']);
                    }

                    $placementUpdates = isset($updates['placements']) && is_array($updates['placements'])
                        ? $updates['placements']
                        : [];
                    $templateUpdates = isset($updates['templates']) && is_array($updates['templates'])
                        ? $updates['templates']
                        : [];
                    $drawingUpdates = isset($updates['drawings']) && is_array($updates['drawings'])
                        ? $updates['drawings']
                        : [];
                    $pingUpdates = isset($updates['pings']) && is_array($updates['pings'])
                        ? $updates['pings']
                        : [];

                    $hasCombatUpdates = !empty($combatUpdates);
                    $hasPlacementUpdates = !empty($placementUpdates);
                    $hasTemplateUpdates = !empty($templateUpdates);
                    $hasDrawingUpdates = !empty($drawingUpdates);
                    $hasPingUpdates = !empty($pingUpdates);

                    if (!$hasCombatUpdates && !$hasPlacementUpdates && !$hasTemplateUpdates && !$hasDrawingUpdates && !$hasPingUpdates) {
                        respondJson(403, [
                            'success' => false,
                            'error' => 'Only combat, placement, template, drawing, or ping updates are permitted for players.',
                        ]);
                    }

                    if ($hasPlacementUpdates) {
                        if (!isset($nextState['placements']) || !is_array($nextState['placements'])) {
                            $nextState['placements'] = [];
                        }
                        foreach ($placementUpdates as $sceneId => $placements) {
                            if (!is_array($placements)) {
                                continue;
                            }
                            $sceneKey = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
                            if ($sceneKey === '') {
                                continue;
                            }
                            $existingPlacements = isset($nextState['placements'][$sceneKey]) && is_array($nextState['placements'][$sceneKey])
                                ? $nextState['placements'][$sceneKey]
                                : [];
                            // Always use timestamp-based merge for players to prevent token deletion
                            // Players should only be able to update existing tokens, not delete them
                            // Only GMs can delete tokens (via the separate GM update path)
                            $nextState['placements'][$sceneKey] = mergeSceneEntriesByTimestamp(
                                $existingPlacements,
                                $placements
                            );
                        }
                    }

                    if ($hasTemplateUpdates) {
                        if (!isset($nextState['templates']) || !is_array($nextState['templates'])) {
                            $nextState['templates'] = [];
                        }
                        foreach ($templateUpdates as $sceneId => $templates) {
                            if (!is_array($templates)) {
                                continue;
                            }
                            $sceneKey = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
                            if ($sceneKey === '') {
                                continue;
                            }
                            $existingTemplates = isset($nextState['templates'][$sceneKey]) && is_array($nextState['templates'][$sceneKey])
                                ? $nextState['templates'][$sceneKey]
                                : [];
                            // Always use timestamp-based merge for players to prevent deletion
                            // Only GMs can delete templates
                            $nextState['templates'][$sceneKey] = mergeSceneEntriesByTimestamp(
                                $existingTemplates,
                                $templates
                            );
                        }
                    }

                    if ($hasDrawingUpdates) {
                        if (!isset($nextState['drawings']) || !is_array($nextState['drawings'])) {
                            $nextState['drawings'] = [];
                        }
                        foreach ($drawingUpdates as $sceneId => $drawings) {
                            if (!is_array($drawings)) {
                                continue;
                            }
                            $sceneKey = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
                            if ($sceneKey === '') {
                                continue;
                            }
                            $existingDrawings = isset($nextState['drawings'][$sceneKey]) && is_array($nextState['drawings'][$sceneKey])
                                ? $nextState['drawings'][$sceneKey]
                                : [];
                            // Always use timestamp-based merge for players to prevent deletion
                            // Only GMs can delete drawings
                            $nextState['drawings'][$sceneKey] = mergeSceneEntriesByTimestamp(
                                $existingDrawings,
                                $drawings
                            );
                        }
                    }

                    if ($hasCombatUpdates) {
                        foreach ($combatUpdates as $sceneId => $combatState) {
                            if (!isset($nextState['sceneState'][$sceneId]) || !is_array($nextState['sceneState'][$sceneId])) {
                                $nextState['sceneState'][$sceneId] = [
                                    'grid' => normalizeGridSettings([]),
                                ];
                            }
                            $nextState['sceneState'][$sceneId]['combat'] = $combatState;
                        }
                    }

                    if ($hasPingUpdates) {
                        $nextState['pings'] = $pingUpdates;
                    }

                    if (!saveVttJson('board-state.json', $nextState)) {
                        respondJson(500, [
                            'success' => false,
                            'error' => 'Failed to persist board state.',
                        ]);
                    }

                    return filterPlacementsForPlayerView($nextState);
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
                    // Use timestamp-based merge for placements in delta mode
                    if ($key === 'placements' && $isDeltaOnly && is_array($value)) {
                        if (!isset($nextState['placements']) || !is_array($nextState['placements'])) {
                            $nextState['placements'] = [];
                        }
                        foreach ($value as $sceneId => $placements) {
                            if (!is_array($placements)) {
                                continue;
                            }
                            $sceneKey = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
                            if ($sceneKey === '') {
                                continue;
                            }
                            $existingPlacements = isset($nextState['placements'][$sceneKey]) && is_array($nextState['placements'][$sceneKey])
                                ? $nextState['placements'][$sceneKey]
                                : [];
                            $nextState['placements'][$sceneKey] = mergeSceneEntriesByTimestamp(
                                $existingPlacements,
                                $placements
                            );
                        }
                        continue;
                    }
                    // Use timestamp-based merge for templates in delta mode
                    if ($key === 'templates' && $isDeltaOnly && is_array($value)) {
                        if (!isset($nextState['templates']) || !is_array($nextState['templates'])) {
                            $nextState['templates'] = [];
                        }
                        foreach ($value as $sceneId => $templates) {
                            if (!is_array($templates)) {
                                continue;
                            }
                            $sceneKey = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
                            if ($sceneKey === '') {
                                continue;
                            }
                            $existingTemplates = isset($nextState['templates'][$sceneKey]) && is_array($nextState['templates'][$sceneKey])
                                ? $nextState['templates'][$sceneKey]
                                : [];
                            $nextState['templates'][$sceneKey] = mergeSceneEntriesByTimestamp(
                                $existingTemplates,
                                $templates
                            );
                        }
                        continue;
                    }
                    // Use timestamp-based merge for drawings in delta mode
                    if ($key === 'drawings' && $isDeltaOnly && is_array($value)) {
                        if (!isset($nextState['drawings']) || !is_array($nextState['drawings'])) {
                            $nextState['drawings'] = [];
                        }
                        foreach ($value as $sceneId => $drawings) {
                            if (!is_array($drawings)) {
                                continue;
                            }
                            $sceneKey = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
                            if ($sceneKey === '') {
                                continue;
                            }
                            $existingDrawings = isset($nextState['drawings'][$sceneKey]) && is_array($nextState['drawings'][$sceneKey])
                                ? $nextState['drawings'][$sceneKey]
                                : [];
                            $nextState['drawings'][$sceneKey] = mergeSceneEntriesByTimestamp(
                                $existingDrawings,
                                $drawings
                            );
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

                return $nextState;
            });

            // Increment version after successful save
            $newVersion = incrementVttBoardStateVersion();

            // Add version to response state
            $responseState['_version'] = $newVersion;

            // Broadcast update via Pusher (non-blocking, fails silently)
            $broadcastData = [
                'version' => $newVersion,
                'timestamp' => time() * 1000, // milliseconds for JS
                'authorId' => strtolower(trim($auth['user'] ?? '')),
                'authorRole' => ($auth['isGM'] ?? false) ? 'gm' : 'player',
                'changedFields' => $changedFields,
            ];

            // Include delta updates for efficient client-side merging
            if (isset($updates['placements'])) {
                $broadcastData['placements'] = $updates['placements'];
            }
            if (isset($updates['templates'])) {
                $broadcastData['templates'] = $updates['templates'];
            }
            if (isset($updates['drawings'])) {
                $broadcastData['drawings'] = $updates['drawings'];
            }
            if (isset($updates['pings'])) {
                $broadcastData['pings'] = $updates['pings'];
            }
            if (isset($updates['sceneState'])) {
                $broadcastData['sceneState'] = $updates['sceneState'];
            }
            if (isset($updates['activeSceneId'])) {
                $broadcastData['activeSceneId'] = $updates['activeSceneId'];
            }
            if (isset($updates['mapUrl'])) {
                $broadcastData['mapUrl'] = $updates['mapUrl'];
            }
            if (isset($updates['overlay'])) {
                $broadcastData['overlay'] = $updates['overlay'];
            }

            // Broadcast asynchronously (don't wait for response)
            broadcastVttStateUpdate($broadcastData, $clientSocketId);

            respondJson(200, [
                'success' => true,
                'data' => $responseState,
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

    if (array_key_exists('drawings', $raw)) {
        $rawDrawings = $raw['drawings'];
        if ($rawDrawings === null) {
            $updates['drawings'] = [];
        } elseif (is_array($rawDrawings)) {
            $updates['drawings'] = normalizeDrawingsPayload($rawDrawings);
        } else {
            throw new InvalidArgumentException('Drawings must be an array or object.');
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

    if (array_key_exists('pings', $raw)) {
        $rawPings = $raw['pings'];
        if ($rawPings === null) {
            $updates['pings'] = [];
        } elseif (is_array($rawPings)) {
            $updates['pings'] = normalizePingsPayload($rawPings);
        } else {
            throw new InvalidArgumentException('Pings must be an array.');
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
        'drawings' => [],
        'overlay' => normalizeOverlayPayload([]),
        'pings' => [],
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

    if (array_key_exists('drawings', $raw) && is_array($raw['drawings'])) {
        $state['drawings'] = normalizeDrawingsPayload($raw['drawings']);
    }

    if (array_key_exists('overlay', $raw) && is_array($raw['overlay'])) {
        $state['overlay'] = normalizeOverlayPayload($raw['overlay']);
    }

    if (array_key_exists('pings', $raw) && is_array($raw['pings'])) {
        $state['pings'] = normalizePingsPayload($raw['pings']);
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
 * @param array<string|int,mixed> $rawDrawings
 * @return array<string,array<int,array<string,mixed>>>
 */
function normalizeDrawingsPayload(array $rawDrawings): array
{
    $normalized = [];

    foreach ($rawDrawings as $sceneId => $drawings) {
        if (!is_array($drawings)) {
            continue;
        }

        $key = is_string($sceneId) ? trim($sceneId) : (string) $sceneId;
        if ($key === '') {
            continue;
        }

        $normalized[$key] = [];
        foreach ($drawings as $entry) {
            $drawing = normalizeDrawingEntry($entry);
            if ($drawing !== null) {
                $normalized[$key][] = $drawing;
            }
        }
    }

    return $normalized;
}

/**
 * @param mixed $entry
 */
function normalizeDrawingEntry($entry): ?array
{
    if (!is_array($entry)) {
        return null;
    }

    $id = isset($entry['id']) && is_string($entry['id']) ? trim($entry['id']) : '';
    if ($id === '') {
        return null;
    }

    $points = isset($entry['points']) && is_array($entry['points']) ? $entry['points'] : [];
    $normalizedPoints = [];

    foreach ($points as $point) {
        if (!is_array($point)) {
            continue;
        }

        $x = isset($point['x']) && is_numeric($point['x']) ? (float) $point['x'] : null;
        $y = isset($point['y']) && is_numeric($point['y']) ? (float) $point['y'] : null;

        if ($x === null || $y === null) {
            continue;
        }

        $normalizedPoints[] = [
            'x' => round($x, 2),
            'y' => round($y, 2),
        ];
    }

    if (count($normalizedPoints) < 2) {
        return null;
    }

    // Limit points to prevent bloat
    if (count($normalizedPoints) > 10000) {
        $normalizedPoints = array_slice($normalizedPoints, 0, 10000);
    }

    $color = isset($entry['color']) && is_string($entry['color']) ? trim($entry['color']) : '#ff0000';
    if (strlen($color) > 64) {
        $color = '#ff0000';
    }

    $strokeWidth = isset($entry['strokeWidth']) && is_numeric($entry['strokeWidth'])
        ? max(1, min(50, (int) $entry['strokeWidth']))
        : 3;

    $normalized = [
        'id' => $id,
        'points' => $normalizedPoints,
        'color' => $color,
        'strokeWidth' => $strokeWidth,
    ];

    // Preserve authorId if present (for user-specific drawing management)
    if (isset($entry['authorId']) && is_string($entry['authorId'])) {
        $authorId = strtolower(trim($entry['authorId']));
        if ($authorId !== '') {
            $normalized['authorId'] = $authorId;
        }
    }

    return $normalized;
}

/**
 * @param array<int,mixed> $rawPings
 * @return array<int,array<string,mixed>>
 */
function normalizePingsPayload(array $rawPings): array
{
    $byId = [];

    $nowMs = (int) round(microtime(true) * 1000);
    $retentionThreshold = max(0, $nowMs - VTT_PING_RETENTION_MS);

    foreach ($rawPings as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $ping = normalizePingEntry($entry);
        if ($ping === null) {
            continue;
        }

        if ($ping['createdAt'] < $retentionThreshold) {
            continue;
        }

        $id = $ping['id'];
        if (!isset($byId[$id]) || $ping['createdAt'] >= $byId[$id]['createdAt']) {
            $byId[$id] = $ping;
        }
    }

    if (empty($byId)) {
        return [];
    }

    $normalized = array_values($byId);
    usort($normalized, static function (array $a, array $b): int {
        return ($a['createdAt'] <=> $b['createdAt']);
    });

    if (count($normalized) > 8) {
        $normalized = array_slice($normalized, -8);
    }

    return array_values($normalized);
}

function normalizePingEntry(array $entry): ?array
{
    $id = isset($entry['id']) && is_string($entry['id']) ? trim($entry['id']) : '';
    if ($id === '') {
        return null;
    }

    $x = isset($entry['x']) && is_numeric($entry['x']) ? (float) $entry['x'] : null;
    $y = isset($entry['y']) && is_numeric($entry['y']) ? (float) $entry['y'] : null;
    if ($x === null || $y === null) {
        return null;
    }

    $createdAtRaw = null;
    if (isset($entry['createdAt']) && is_numeric($entry['createdAt'])) {
        $createdAtRaw = (float) $entry['createdAt'];
    } elseif (isset($entry['timestamp']) && is_numeric($entry['timestamp'])) {
        $createdAtRaw = (float) $entry['timestamp'];
    }
    if ($createdAtRaw === null) {
        return null;
    }
    $createdAt = (int) round($createdAtRaw);
    if ($createdAt < 0) {
        $createdAt = 0;
    }

    $sceneId = isset($entry['sceneId']) && is_string($entry['sceneId'])
        ? trim($entry['sceneId'])
        : '';
    $scene = $sceneId === '' ? null : $sceneId;

    $typeRaw = isset($entry['type']) && is_string($entry['type']) ? strtolower(trim($entry['type'])) : '';
    $type = $typeRaw === 'focus' ? 'focus' : 'ping';

    $authorIdRaw = isset($entry['authorId']) && is_string($entry['authorId'])
        ? strtolower(trim($entry['authorId']))
        : '';
    $authorId = $authorIdRaw === '' ? null : $authorIdRaw;

    $normalized = [
        'id' => $id,
        'sceneId' => $scene,
        'x' => max(0, min(1, round($x, 4))),
        'y' => max(0, min(1, round($y, 4))),
        'type' => $type,
        'createdAt' => $createdAt,
    ];

    if ($authorId !== null) {
        $normalized['authorId'] = $authorId;
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

        if (array_key_exists('fogOfWar', $config)) {
            $fogOfWar = normalizeFogOfWarPayload($config['fogOfWar']);
            if ($fogOfWar !== null) {
                $entry['fogOfWar'] = $fogOfWar;
            }
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
        'turnPhase' => 'idle',
        'roundTurnCount' => 0,
        'malice' => 0,
        'updatedAt' => time(),
        'sequence' => 0,
        'turnLock' => null,
        'groups' => [],
        'lastEffect' => null,
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

    if (array_key_exists('malice', $rawCombat) || array_key_exists('maliceCount', $rawCombat)) {
        $rawMalice = $rawCombat['malice'] ?? $rawCombat['maliceCount'];
        if (is_numeric($rawMalice)) {
            $state['malice'] = max(0, (int) floor((float) $rawMalice));
        }
    }

    if (isset($rawCombat['updatedAt']) && is_numeric($rawCombat['updatedAt'])) {
        $state['updatedAt'] = max(0, (int) round((float) $rawCombat['updatedAt']));
    }

    // Sequence number for reliable sync ordering (avoids clock drift issues between clients)
    if (isset($rawCombat['sequence']) && is_numeric($rawCombat['sequence'])) {
        $state['sequence'] = max(0, (int) round((float) $rawCombat['sequence']));
    } elseif (isset($rawCombat['seq']) && is_numeric($rawCombat['seq'])) {
        $state['sequence'] = max(0, (int) round((float) $rawCombat['seq']));
    }

    // Turn phase state machine: idle, pick, or active
    $rawTurnPhase = $rawCombat['turnPhase'] ?? $rawCombat['phase'] ?? null;
    if (is_string($rawTurnPhase)) {
        $normalizedPhase = strtolower(trim($rawTurnPhase));
        if ($normalizedPhase === 'idle' || $normalizedPhase === 'pick' || $normalizedPhase === 'active') {
            $state['turnPhase'] = $normalizedPhase;
        }
    }
    // Derive turn phase if not explicitly set
    if ($state['turnPhase'] === 'idle' && $state['active']) {
        $state['turnPhase'] = $state['activeCombatantId'] ? 'active' : 'pick';
    }

    $state['turnLock'] = normalizeCombatTurnLock($rawCombat['turnLock'] ?? null);
    $state['groups'] = normalizeCombatGroups(
        $rawCombat['groups'] ?? $rawCombat['groupings'] ?? $rawCombat['combatGroups'] ?? $rawCombat['combatantGroups'] ?? []
    );
    $state['lastEffect'] = normalizeCombatTurnEffect($rawCombat['lastEffect'] ?? $rawCombat['lastEvent'] ?? null);

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
 * @param mixed $rawEffect
 */
function normalizeCombatTurnEffect($rawEffect): ?array
{
    if (!is_array($rawEffect)) {
        return null;
    }

    $type = isset($rawEffect['type']) && is_string($rawEffect['type']) ? strtolower(trim($rawEffect['type'])) : '';
    if ($type === '') {
        return null;
    }

    $combatantId = isset($rawEffect['combatantId']) && is_string($rawEffect['combatantId']) ? trim($rawEffect['combatantId']) : '';
    $triggeredAt = isset($rawEffect['triggeredAt']) && is_numeric($rawEffect['triggeredAt'])
        ? max(0, (int) round((float) $rawEffect['triggeredAt']))
        : (isset($rawEffect['timestamp']) && is_numeric($rawEffect['timestamp'])
            ? max(0, (int) round((float) $rawEffect['timestamp']))
            : time());
    $initiatorId = isset($rawEffect['initiatorId']) && is_string($rawEffect['initiatorId'])
        ? strtolower(trim($rawEffect['initiatorId']))
        : '';

    $effect = [
        'type' => $type,
        'triggeredAt' => $triggeredAt,
    ];

    if ($combatantId !== '') {
        $effect['combatantId'] = $combatantId;
    }

    if ($initiatorId !== '') {
        $effect['initiatorId'] = $initiatorId;
    }

    return $effect;
}

/**
 * @param mixed $rawGroups
 * @return array<int,array<string,mixed>>
 */
function normalizeCombatGroups($rawGroups): array
{
    $entries = [];

    if (is_array($rawGroups)) {
        $entries = $rawGroups;
    } elseif (is_object($rawGroups)) {
        $entries = (array) $rawGroups;
    }

    $groups = [];

    foreach ($entries as $key => $entry) {
        $representativeId = '';
        $membersSource = [];

        if (is_array($entry) && array_key_exists('representativeId', $entry)) {
            if (is_string($entry['representativeId'])) {
                $representativeId = trim($entry['representativeId']);
            }
            if (isset($entry['memberIds']) && is_array($entry['memberIds'])) {
                $membersSource = $entry['memberIds'];
            } elseif (isset($entry['members']) && is_array($entry['members'])) {
                $membersSource = $entry['members'];
            } elseif (isset($entry['ids']) && is_array($entry['ids'])) {
                $membersSource = $entry['ids'];
            }
        } elseif (is_string($key)) {
            $representativeId = trim($key);
            if (is_array($entry)) {
                $membersSource = $entry;
            }
        }

        if ($representativeId === '') {
            continue;
        }

        $members = [];
        foreach ($membersSource as $member) {
            if (!is_string($member)) {
                continue;
            }
            $trimmed = trim($member);
            if ($trimmed === '' || in_array($trimmed, $members, true)) {
                continue;
            }
            $members[] = $trimmed;
        }

        if (!in_array($representativeId, $members, true)) {
            $members[] = $representativeId;
        }

        if (count($members) <= 1) {
            continue;
        }

        $groups[] = [
            'representativeId' => $representativeId,
            'memberIds' => $members,
        ];
    }

    return $groups;
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
    $overlay = createEmptyOverlayState();

    if (!is_array($rawOverlay)) {
        return $overlay;
    }

    if (array_key_exists('mapUrl', $rawOverlay) && is_string($rawOverlay['mapUrl'])) {
        $trimmed = trim($rawOverlay['mapUrl']);
        $overlay['mapUrl'] = $trimmed === '' ? null : $trimmed;
    }

    $layerSource = [];
    if (array_key_exists('layers', $rawOverlay) && is_array($rawOverlay['layers'])) {
        $layerSource = $rawOverlay['layers'];
    } elseif (array_key_exists('items', $rawOverlay) && is_array($rawOverlay['items'])) {
        $layerSource = $rawOverlay['items'];
    }

    foreach (array_values($layerSource) as $index => $layer) {
        $normalizedLayer = normalizeOverlayLayerPayload($layer, $index);
        if ($normalizedLayer !== null) {
            $overlay['layers'][] = $normalizedLayer;
        }
    }

    $legacyMask = array_key_exists('mask', $rawOverlay)
        ? normalizeOverlayMaskPayload($rawOverlay['mask'])
        : createEmptyOverlayMask();

    if (
        count($overlay['layers']) === 0
        && (maskHasMeaningfulContent($legacyMask) || array_key_exists('name', $rawOverlay) || array_key_exists('visible', $rawOverlay))
    ) {
        $overlay['layers'][] = normalizeOverlayLayerPayload(
            [
                'id' => array_key_exists('id', $rawOverlay) && is_string($rawOverlay['id']) ? $rawOverlay['id'] : null,
                'name' => array_key_exists('name', $rawOverlay) ? $rawOverlay['name'] : null,
                'visible' => array_key_exists('visible', $rawOverlay) ? $rawOverlay['visible'] : null,
                'mask' => $legacyMask,
            ],
            0
        ) ?? createEmptyOverlayLayer(0);
    }

    $preferred = null;
    if (array_key_exists('activeLayerId', $rawOverlay) && is_string($rawOverlay['activeLayerId'])) {
        $preferred = trim($rawOverlay['activeLayerId']);
    } elseif (array_key_exists('activeLayer', $rawOverlay) && is_string($rawOverlay['activeLayer'])) {
        $preferred = trim($rawOverlay['activeLayer']);
    } elseif (array_key_exists('selectedLayerId', $rawOverlay) && is_string($rawOverlay['selectedLayerId'])) {
        $preferred = trim($rawOverlay['selectedLayerId']);
    }

    $overlay['activeLayerId'] = resolveOverlayActiveLayerId($preferred, $overlay['layers']);
    $overlay['mask'] = buildAggregateOverlayMask($overlay['layers']);

    return $overlay;
}

function createEmptyOverlayMask(): array
{
    return ['visible' => true, 'polygons' => []];
}

function createEmptyOverlayState(): array
{
    return [
        'mapUrl' => null,
        'mask' => createEmptyOverlayMask(),
        'layers' => [],
        'activeLayerId' => null,
    ];
}

function createEmptyOverlayLayer(int $index = 0): array
{
    return [
        'id' => generateOverlayLayerId(),
        'name' => 'Overlay ' . ($index + 1),
        'visible' => true,
        'mask' => createEmptyOverlayMask(),
        'mapUrl' => null,
    ];
}

function normalizeOverlayLayerPayload($rawLayer, int $index = 0): ?array
{
    if (!is_array($rawLayer)) {
        return null;
    }

    $id = null;
    if (array_key_exists('id', $rawLayer) && is_string($rawLayer['id'])) {
        $trimmed = trim($rawLayer['id']);
        if ($trimmed !== '') {
            $id = $trimmed;
        }
    }

    $name = null;
    if (array_key_exists('name', $rawLayer) && is_string($rawLayer['name'])) {
        $name = trim($rawLayer['name']);
    }

    $visible = true;
    if (array_key_exists('visible', $rawLayer)) {
        $visible = (bool) $rawLayer['visible'];
    }

    $mapUrl = null;
    if (array_key_exists('mapUrl', $rawLayer) && is_string($rawLayer['mapUrl'])) {
        $trimmedMap = trim($rawLayer['mapUrl']);
        if ($trimmedMap !== '') {
            $mapUrl = $trimmedMap;
        }
    }

    $mask = array_key_exists('mask', $rawLayer)
        ? normalizeOverlayMaskPayload($rawLayer['mask'])
        : normalizeOverlayMaskPayload($rawLayer);

    $layerId = $id ?? generateOverlayLayerId();
    $layerName = $name !== null && $name !== '' ? $name : 'Overlay ' . ($index + 1);

    return [
        'id' => $layerId,
        'name' => $layerName,
        'visible' => $visible,
        'mask' => $mask,
        'mapUrl' => $mapUrl,
    ];
}

function generateOverlayLayerId(): string
{
    return uniqid('overlay-layer-', false);
}

/**
 * @param array<int,array<string,mixed>> $layers
 */
function resolveOverlayActiveLayerId($preferred, array $layers): ?string
{
    if (count($layers) === 0) {
        return null;
    }

    if (is_string($preferred)) {
        $trimmed = trim($preferred);
        if ($trimmed !== '') {
            foreach ($layers as $layer) {
                if (!is_array($layer) || !isset($layer['id']) || $layer['id'] !== $trimmed) {
                    continue;
                }

                $visible = !array_key_exists('visible', $layer) || (bool) $layer['visible'] === true;
                if ($visible) {
                    return $trimmed;
                }

                break;
            }
        }
    }

    foreach ($layers as $layer) {
        if (!is_array($layer)) {
            continue;
        }

        $visible = !array_key_exists('visible', $layer) || (bool) $layer['visible'] === true;
        if ($visible && isset($layer['id'])) {
            return (string) $layer['id'];
        }
    }

    foreach ($layers as $layer) {
        if (is_array($layer) && isset($layer['id'])) {
            return (string) $layer['id'];
        }
    }

    return null;
}

/**
 * @param array<int,array<string,mixed>> $layers
 */
function buildAggregateOverlayMask(array $layers): array
{
    $aggregate = createEmptyOverlayMask();
    $hasVisibleLayer = false;

    foreach ($layers as $layer) {
        if (!is_array($layer)) {
            continue;
        }

        $layerVisible = array_key_exists('visible', $layer) ? (bool) $layer['visible'] : true;
        if (!$layerVisible) {
            continue;
        }

        $mask = array_key_exists('mask', $layer)
            ? normalizeOverlayMaskPayload($layer['mask'])
            : createEmptyOverlayMask();

        if (array_key_exists('visible', $mask) && !$mask['visible']) {
            continue;
        }

        $hasVisibleLayer = true;
        if (!array_key_exists('url', $aggregate) && array_key_exists('url', $mask)) {
            $aggregate['url'] = $mask['url'];
        }

        if (array_key_exists('polygons', $mask) && is_array($mask['polygons'])) {
            foreach ($mask['polygons'] as $polygon) {
                if (!is_array($polygon)) {
                    continue;
                }

                $points = [];
                if (array_key_exists('points', $polygon) && is_array($polygon['points'])) {
                    foreach ($polygon['points'] as $point) {
                        $normalizedPoint = normalizeOverlayMaskPoint($point);
                        if ($normalizedPoint !== null) {
                            $points[] = $normalizedPoint;
                        }
                    }
                }

                if (count($points) >= 3) {
                    $aggregate['polygons'][] = ['points' => $points];
                }
            }
        }
    }

    $aggregate['visible'] = $hasVisibleLayer;
    return $aggregate;
}

function maskHasMeaningfulContent(array $mask): bool
{
    if (array_key_exists('url', $mask) && is_string($mask['url']) && trim($mask['url']) !== '') {
        return true;
    }

    if (!array_key_exists('polygons', $mask) || !is_array($mask['polygons'])) {
        return false;
    }

    foreach ($mask['polygons'] as $polygon) {
        if (is_array($polygon) && array_key_exists('points', $polygon) && is_array($polygon['points'])) {
            if (count($polygon['points']) >= 3) {
                return true;
            }
        }
    }

    return false;
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
 * @param mixed $raw
 * @return array<string,mixed>|null
 */
function normalizeFogOfWarPayload($raw): ?array
{
    if (!is_array($raw)) {
        return null;
    }

    $enabled = !empty($raw['enabled']);
    $revealedCells = [];

    if (isset($raw['revealedCells']) && is_array($raw['revealedCells'])) {
        foreach ($raw['revealedCells'] as $key => $value) {
            if (!is_string($key)) {
                continue;
            }
            $parts = explode(',', $key);
            if (count($parts) !== 2) {
                continue;
            }
            $col = filter_var($parts[0], FILTER_VALIDATE_INT);
            $row = filter_var($parts[1], FILTER_VALIDATE_INT);
            if ($col === false || $row === false || $col < 0 || $row < 0) {
                continue;
            }
            $revealedCells[$col . ',' . $row] = true;
        }
    }

    if (!$enabled && empty($revealedCells)) {
        return null;
    }

    return [
        'enabled' => $enabled,
        'revealedCells' => empty($revealedCells) ? new \stdClass() : $revealedCells,
    ];
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
