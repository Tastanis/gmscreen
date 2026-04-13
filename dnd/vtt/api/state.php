<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/state_helpers.php';
require_once __DIR__ . '/../lib/PusherClient.php';

const VTT_PING_RETENTION_MS = 10000;
const VTT_VERSION_FILE = 'board-state-version.json';

/**
 * Phase 3-C: Feature flag for broadcasting delta ops over Pusher instead
 * of the full board state. When `true`, an ops-only POST (one whose
 * payload carried `payload.ops` and no snapshot updates) emits a compact
 * `{type: 'ops', version, ops, ...}` Pusher message; subscribers apply
 * the ops locally. When `false`, the existing full-state broadcast path
 * runs unconditionally — useful as an emergency kill-switch without
 * having to revert the whole phase.
 */
const VTT_USE_DELTA_BROADCASTS = true;

/**
 * Phase 3-C: Pusher imposes a 10 KB hard limit on a single message
 * payload. We budget a little headroom for the channel/event metadata
 * Pusher itself adds and refuse to broadcast anything larger. When an
 * ops broadcast exceeds this size we fall back to a compact
 * `ops-overflow` marker that forces every subscriber to GET fresh
 * state. This is a safety net — the client-side ops escape hatch
 * (PHASE_3B_MAX_OPS_PER_FLUSH) should already prevent ops payloads
 * from getting this large in practice.
 */
const VTT_BROADCAST_MAX_BYTES = 9500;

/**
 * Resolve the on-disk path to the version file.
 */
function vttBoardStateVersionPath(): string
{
    return __DIR__ . '/../storage/' . VTT_VERSION_FILE;
}

/**
 * Get the current board state version.
 * Version is a monotonically increasing integer that prevents stale updates.
 *
 * Reads the `_version` field from `board-state.json`. Falls back to the
 * legacy `board-state-version.json` file for any deployment that has not
 * yet written the state since the consolidation (phase 2-2). The legacy
 * file is removed on the first write after migration, so this fallback
 * becomes inert shortly after deploy.
 */
function getVttBoardStateVersion(): int
{
    $state = loadVttJson('board-state.json');
    if (is_array($state) && isset($state['_version'])) {
        return max(0, (int) $state['_version']);
    }

    $legacyPath = vttBoardStateVersionPath();
    if (is_file($legacyPath)) {
        $content = @file_get_contents($legacyPath);
        if (is_string($content) && $content !== '') {
            $data = json_decode($content, true);
            if (is_array($data) && isset($data['version'])) {
                return max(0, (int) $data['version']);
            }
        }
    }

    return 0;
}

/**
 * Bump the `_version` field on an in-memory board state array and return
 * the new value. Must be called with the board state lock held so two
 * concurrent writers cannot observe the same "current" value.
 *
 * @param array<string,mixed> $state
 */
function bumpVttBoardStateVersion(array &$state): int
{
    $current = isset($state['_version']) ? max(0, (int) $state['_version']) : 0;
    $next = $current + 1;
    $state['_version'] = $next;
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
            // Phase 3-A: Conditional GET. The polling fallback hits this
            // endpoint every 30 seconds (safety-net) or 1 second (fallback).
            // When the board state version has not advanced since the
            // client's last applied version, return 304 Not Modified with
            // no body so the safety-net poll is effectively free on the
            // server: no scene/token loads, no player-view filtering, no
            // JSON serialization. We use a weak ETag because the response
            // body varies by user role (player view vs. GM view), but the
            // version is always a sufficient freshness key.
            $currentVersion = getVttBoardStateVersion();
            $currentEtag = 'W/"v' . $currentVersion . '"';
            $clientEtag = isset($_SERVER['HTTP_IF_NONE_MATCH'])
                ? trim((string) $_SERVER['HTTP_IF_NONE_MATCH'])
                : '';
            if ($clientEtag !== '' && $clientEtag === $currentEtag) {
                header('ETag: ' . $currentEtag);
                header('Cache-Control: no-store');
                http_response_code(304);
                exit;
            }

            // Phase 3-D: APCu memoization of the loaded + filtered state.
            // After 3-A the safety-net poll is already near-free via 304,
            // but there are still cases that must hit the full load path:
            // a new player joining mid-session, several clients reconnecting
            // at once, and the 3-C forceImmediatePoll() resync after a
            // version gap. All three scenarios produce a burst of GETs at
            // the same version. Caching the serialized response body keyed
            // by (version, user) lets every GET after the first in a burst
            // skip reading scenes.json/tokens.json/board-state.json from
            // disk and re-running player-view filtering.
            //
            // The cache key includes the user because
            // filterPlacementsForPlayerView() hides GM-only entities for
            // non-GMs, so a single version produces two distinct response
            // bodies depending on role.
            //
            // No explicit POST invalidation is needed. Every successful
            // POST bumps `_version` monotonically inside the board-state
            // lock, so old keys become unreachable the instant the next
            // GET reads the new version. Orphaned entries at stale
            // versions expire naturally via the short TTL below, which is
            // the backstop for the narrow window between disk commit and
            // cache-key rotation.
            $auth = getVttUserContext();
            $apcuEnabled = function_exists('apcu_enabled') && apcu_enabled();
            $cacheKey = null;
            if ($apcuEnabled) {
                $cacheUser = strtolower(trim((string) ($auth['user'] ?? '')));
                $cacheKey = sprintf('vtt:state:v%d:%s', $currentVersion, $cacheUser);
                $cachedBody = apcu_fetch($cacheKey, $cacheHit);
                if ($cacheHit && is_string($cachedBody) && $cachedBody !== '') {
                    header('ETag: ' . $currentEtag);
                    header('Cache-Control: no-store');
                    echo $cachedBody;
                    exit;
                }
            }

            $config = getVttBootstrapConfig();
            if (!($auth['isGM'] ?? false)) {
                $config['boardState'] = filterPlacementsForPlayerView($config['boardState'] ?? []);
            }

            // Include version for sync conflict detection
            $boardState = $config['boardState'] ?? [];
            $boardState['_version'] = $currentVersion;
            // Mark as full sync so clients know to replace (not merge) scene data
            // This enables proper deletion sync - items not in this response should be removed
            $boardState['_fullSync'] = true;

            // Include Pusher config for client-side initialization
            $pusherConfig = getVttPusherConfig();

            $responseBody = json_encode([
                'success' => true,
                'data' => [
                    'scenes' => $config['scenes'],
                    'tokens' => $config['tokens'],
                    'boardState' => $boardState,
                    'pusher' => $pusherConfig,
                ],
            ]);

            // Phase 3-D: store the serialized body so cache hits can echo
            // it directly without a second json_encode pass. TTL is short
            // (2 seconds) because the version-keyed key rotation already
            // handles invalidation; the TTL just garbage-collects orphaned
            // entries at stale versions.
            if ($apcuEnabled && $cacheKey !== null && is_string($responseBody)) {
                apcu_store($cacheKey, $responseBody, 2);
            }

            header('ETag: ' . $currentEtag);
            header('Cache-Control: no-store');
            http_response_code(200);
            echo is_string($responseBody)
                ? $responseBody
                : json_encode([
                    'success' => false,
                    'error' => 'Failed to encode board state response.',
                ]);
            exit;
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
            // Empty string after trim is meaningless for exclusion; normalize to null
            // so PusherClient::trigger() does not attempt to include an empty socket_id.
            if ($clientSocketId === '') {
                $clientSocketId = null;
            }
            // Check if this is a delta-only update (only changed entities)
            $isDeltaOnly = !empty($rawState['_deltaOnly']);
            // Scenes whose drawings should be fully replaced (after erasing/clearing)
            $replaceDrawingScenes = [];
            if (isset($rawState['_replaceDrawings']) && is_array($rawState['_replaceDrawings'])) {
                foreach ($rawState['_replaceDrawings'] as $sceneId) {
                    if (is_string($sceneId) && trim($sceneId) !== '') {
                        $replaceDrawingScenes[] = trim($sceneId);
                    }
                }
            }
            // Remove internal fields before processing
            unset($rawState['_version'], $rawState['_socketId'], $rawState['_deltaOnly'], $rawState['_replaceDrawings']);

            // Phase 3-B (commit 1): optional delta ops live at
            // `payload.ops` (top-level, alongside boardState). They are
            // sanitized for shape here and applied inside the state
            // lock below. The client does not send ops yet — this
            // commit only teaches the server to accept them. Existing
            // snapshot-only payloads are unaffected because `$ops`
            // stays empty when `payload.ops` is absent.
            $ops = [];
            if (isset($payload['ops']) && is_array($payload['ops'])) {
                $ops = sanitizeBoardStateOps($payload['ops']);
            }

            $updates = sanitizeBoardStateUpdates($rawState);
            if (empty($updates) && empty($ops)) {
                respondJson(422, [
                    'success' => false,
                    'error' => 'No board state changes were provided.',
                ]);
            }

            // Determine what changed for targeted Pusher broadcasts
            $changedFields = array_keys($updates);

            $lockResult = withVttBoardStateLock(function () use ($updates, $ops, $auth, $clientVersion, $isDeltaOnly, $replaceDrawingScenes) {
                $existing = loadVttJson('board-state.json');

                // Determine the starting version. Prefer the `_version` field
                // already carried on the state. Lazy-migrate from the legacy
                // `board-state-version.json` file if the state has not been
                // written since the consolidation in phase 2-2.
                $previousVersion = 0;
                if (is_array($existing) && isset($existing['_version'])) {
                    $previousVersion = max(0, (int) $existing['_version']);
                } elseif (is_file(vttBoardStateVersionPath())) {
                    $legacyContent = @file_get_contents(vttBoardStateVersionPath());
                    if (is_string($legacyContent) && $legacyContent !== '') {
                        $legacyDecoded = json_decode($legacyContent, true);
                        if (is_array($legacyDecoded) && isset($legacyDecoded['version'])) {
                            $previousVersion = max(0, (int) $legacyDecoded['version']);
                        }
                    }
                }

                $nextState = normalizeBoardState($existing);
                $nextState['_version'] = $previousVersion;

                // Phase 3-B (commit 1): apply delta ops to the
                // normalized state before any snapshot-merge logic
                // runs. Ops mutate the canonical state in place; the
                // existing snapshot path, when a boardState payload is
                // also present, will layer on top exactly as before.
                // Phase 3-B (commit 3): `$isGm` is computed up-front
                // now so it can be forwarded to `applyBoardStateOp`,
                // which uses it to gate destructive op types like
                // `placement.remove` behind the same GM-only rule the
                // snapshot path already enforces. This prevents a
                // player from bypassing the snapshot path's
                // timestamp-merge (which cannot delete) by sending a
                // `placement.remove` op directly.
                $isGm = (bool) ($auth['isGM'] ?? false);
                if (!empty($ops)) {
                    $opContext = ['isGm' => $isGm];
                    foreach ($ops as $op) {
                        $nextState = applyBoardStateOp($nextState, $op, $opContext);
                    }
                }

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

                    // Phase 3-B (commit 1): an ops-only payload from a
                    // player is also acceptable. Only `placement.move`
                    // is supported today, which is strictly an update
                    // to an existing placement (no create, no delete),
                    // so it fits the same "players may only modify"
                    // policy this branch enforces for snapshot saves.
                    if (!$hasCombatUpdates && !$hasPlacementUpdates && !$hasTemplateUpdates && !$hasDrawingUpdates && !$hasPingUpdates && empty($ops)) {
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

                            // If this scene is marked for full replacement (erasing/clearing),
                            // replace the entire drawings array instead of merging
                            if (in_array($sceneKey, $replaceDrawingScenes, true)) {
                                $nextState['drawings'][$sceneKey] = $drawings;
                                continue;
                            }

                            $existingDrawings = isset($nextState['drawings'][$sceneKey]) && is_array($nextState['drawings'][$sceneKey])
                                ? $nextState['drawings'][$sceneKey]
                                : [];
                            // Use timestamp-based merge for players (delta mode)
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
                            // Timestamp-based merge: only apply player combat updates
                            // if they are newer than the existing combat state.
                            // This prevents stale player data (e.g. from tab-switch
                            // keepalive saves) from overwriting the GM's latest changes.
                            $existingCombat = $nextState['sceneState'][$sceneId]['combat'] ?? [];
                            $existingUpdatedAt = is_array($existingCombat) ? (int) ($existingCombat['updatedAt'] ?? 0) : 0;
                            $existingSequence = is_array($existingCombat) ? (int) ($existingCombat['sequence'] ?? 0) : 0;
                            $incomingUpdatedAt = is_array($combatState) ? (int) ($combatState['updatedAt'] ?? 0) : 0;
                            $incomingSequence = is_array($combatState) ? (int) ($combatState['sequence'] ?? 0) : 0;

                            // Use sequence for comparison when available (immune to clock drift),
                            // fall back to updatedAt timestamp comparison otherwise.
                            $isNewer = true;
                            if ($existingSequence > 0 && $incomingSequence > 0) {
                                $isNewer = $incomingSequence >= $existingSequence;
                            } elseif ($existingUpdatedAt > 0 && $incomingUpdatedAt > 0) {
                                $isNewer = $incomingUpdatedAt >= $existingUpdatedAt;
                            }

                            if ($isNewer) {
                                $nextState['sceneState'][$sceneId]['combat'] = $combatState;
                            }
                        }
                    }

                    if ($hasPingUpdates) {
                        $nextState['pings'] = $pingUpdates;
                    }

                    // Bump the version on the in-memory state so the saved
                    // file already carries `_version`. The outer board-state
                    // lock serializes POSTs, so no two writes can ever share
                    // a version number.
                    $newVersion = bumpVttBoardStateVersion($nextState);

                    if (!saveVttJson('board-state.json', $nextState)) {
                        respondJson(500, [
                            'success' => false,
                            'error' => 'Failed to persist board state.',
                        ]);
                    }

                    // Migration complete: drop the legacy version file. Best
                    // effort — a failure here just leaves a stale file that
                    // getVttBoardStateVersion() ignores.
                    if (is_file(vttBoardStateVersionPath())) {
                        @unlink(vttBoardStateVersionPath());
                    }

                    $playerView = filterPlacementsForPlayerView($nextState);
                    $playerView['_version'] = $newVersion;
                    return [
                        'state' => $playerView,
                        'version' => $newVersion,
                    ];
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

                            // If this scene is marked for full replacement (erasing/clearing),
                            // replace the entire drawings array instead of merging
                            if (in_array($sceneKey, $replaceDrawingScenes, true)) {
                                $nextState['drawings'][$sceneKey] = $drawings;
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

                // Bump the version on the in-memory state so the saved file
                // already carries `_version`. The outer board-state lock
                // serializes POSTs, so no two writes can ever share a
                // version number.
                $newVersion = bumpVttBoardStateVersion($nextState);

                if (!saveVttJson('board-state.json', $nextState)) {
                    respondJson(500, [
                        'success' => false,
                        'error' => 'Failed to persist board state.',
                    ]);
                }

                // Migration complete: drop the legacy version file. Best
                // effort — a failure here just leaves a stale file that
                // getVttBoardStateVersion() ignores.
                if (is_file(vttBoardStateVersionPath())) {
                    @unlink(vttBoardStateVersionPath());
                }

                return [
                    'state' => $nextState,
                    'version' => $newVersion,
                ];
            });

            $responseState = $lockResult['state'];
            $newVersion = $lockResult['version'];

            // Broadcast update via Pusher (non-blocking, fails silently).
            //
            // Phase 3-C: When the POST was an ops-only payload (no snapshot
            // updates), broadcast a compact `{type: 'ops', ...}` message
            // carrying the same ops the server already applied. Subscribers
            // mirror the server's `applyBoardStateOp` and patch their own
            // state in place. This drops the broadcast payload from
            // hundreds of KB to a few hundred bytes for typical token
            // moves and template/drawing edits.
            //
            // Mixed payloads (ops alongside snapshot updates) take the
            // existing full-state path so the broadcast still carries
            // every changed entity — the ops will be reapplied via the
            // snapshot path on receivers, which is safe but redundant;
            // we accept the redundancy because mixed payloads are rare
            // and we don't want to maintain two parallel broadcast
            // shapes for the same save.
            //
            // The full-state path is also the snapshot fallback for any
            // op the client could not express as a delta (erase/clear,
            // bulk fog, etc.) and is preserved unchanged.
            $authorId = strtolower(trim($auth['user'] ?? ''));
            $authorRole = ($auth['isGM'] ?? false) ? 'gm' : 'player';
            $broadcastTimestampMs = time() * 1000;

            $opsOnlyPayload = !empty($ops) && empty($updates);
            $useOpsBroadcast = $opsOnlyPayload && VTT_USE_DELTA_BROADCASTS;

            if ($useOpsBroadcast) {
                $broadcastData = [
                    'type' => 'ops',
                    'version' => $newVersion,
                    'timestamp' => $broadcastTimestampMs,
                    'authorId' => $authorId,
                    'authorRole' => $authorRole,
                    'ops' => $ops,
                ];

                // Pusher's 10 KB per-message limit is a hard cap. If for
                // any reason the ops list grew large enough to bust it
                // (the client-side ops escape hatch should normally
                // prevent this), fall back to a compact marker that
                // forces every receiver to issue a fresh GET. We log
                // because exceeding the cap is a signal that something
                // upstream is sending too much in one save.
                $encoded = json_encode($broadcastData);
                if ($encoded === false || strlen($encoded) > VTT_BROADCAST_MAX_BYTES) {
                    error_log(sprintf(
                        '[VTT] Phase 3-C ops broadcast exceeded %d bytes (was %d, %d ops); falling back to ops-overflow marker',
                        VTT_BROADCAST_MAX_BYTES,
                        $encoded === false ? -1 : strlen($encoded),
                        count($ops)
                    ));
                    $broadcastData = [
                        'type' => 'ops-overflow',
                        'version' => $newVersion,
                        'timestamp' => $broadcastTimestampMs,
                        'authorId' => $authorId,
                        'authorRole' => $authorRole,
                    ];
                }
            } else {
                $broadcastData = [
                    // Tag full-state broadcasts so the client subscriber
                    // can dispatch on `type` even when the field is
                    // missing on older messages. Older clients ignore
                    // unknown fields, so this is non-breaking.
                    'type' => 'full',
                    'version' => $newVersion,
                    'timestamp' => $broadcastTimestampMs, // milliseconds for JS
                    'authorId' => $authorId,
                    'authorRole' => $authorRole,
                    'changedFields' => $changedFields,
                    // When false, the broadcast carries the *complete*
                    // placement/template/drawing arrays for every
                    // included scene. The client can safely replace its
                    // local scene data (removing entries absent from the
                    // broadcast). When true the arrays are sparse deltas
                    // and should be merged additively.
                    'deltaOnly' => $isDeltaOnly,
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
            }

            // Send the response to the client first so the sender is not
            // blocked waiting for the Pusher broadcast to complete. Pusher's
            // cURL call can take up to the full timeout (several seconds) in
            // degraded conditions; the client does not need that on its
            // critical path.
            respondJson(200, [
                'success' => true,
                'data' => $responseState,
            ], false);

            // Release the session lock so other requests from the same user
            // are not serialized behind this one's remaining work.
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_write_close();
            }

            // Flush PHP-FPM's response so the client is already unblocked
            // before we start the Pusher broadcast.
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            }

            // Now perform the Pusher broadcast. The client has already
            // received its response; errors are still logged inside
            // broadcastVttStateUpdate() but no longer delay the save.
            broadcastVttStateUpdate($broadcastData, $clientSocketId);
            return;
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
 * Phase 3-B: Sanitize a list of delta ops coming in on `payload.ops`.
 *
 * Each op is an associative array describing a single, typed mutation
 * of the board state (for example `{type: 'placement.move', sceneId,
 * placementId, x, y}`). Unknown op types are preserved in the returned
 * list so `applyBoardStateOp` can decide how to handle them; malformed
 * entries (non-arrays, missing or non-string `type`) are dropped.
 *
 * This helper performs shape validation only. It does not touch the
 * board state — application happens later, inside the state lock.
 *
 * @param array<int,mixed> $rawOps
 * @return array<int,array<string,mixed>>
 */
function sanitizeBoardStateOps(array $rawOps): array
{
    $sanitized = [];
    foreach ($rawOps as $rawOp) {
        if (!is_array($rawOp)) {
            continue;
        }
        $type = $rawOp['type'] ?? null;
        if (!is_string($type) || trim($type) === '') {
            continue;
        }
        $rawOp['type'] = trim($type);
        $sanitized[] = $rawOp;
    }
    return $sanitized;
}

/**
 * Phase 3-B: Apply a single delta op to an in-memory board state array.
 *
 * Commit 1 introduced `placement.move`. Commit 3 adds `placement.add`,
 * `placement.remove`, and `placement.update` so every placement-level
 * mutation on the client can travel as a typed op instead of a full
 * snapshot. Commit 4 adds `template.upsert` and `template.remove` so
 * every template commit (the `commitShapes` path in the client) can
 * also travel as ops. Commit 5 adds `drawing.add` and `drawing.remove`
 * for the non-erase/non-clear drawing flows; the erase/clear path
 * still rides the snapshot `_replaceDrawings` mechanism because it
 * has no op equivalent. Unknown or unsupported op types are ignored
 * so older servers can tolerate payloads from newer clients without
 * erroring out. The state returned is always a valid board state —
 * if the op cannot be applied (missing scene, missing entry, bad
 * fields, permission denied for a non-GM destructive op), the input
 * is returned unchanged.
 *
 * The caller is responsible for running this inside the state lock so
 * two concurrent writers cannot interleave mutations on the same
 * entry. The caller is also responsible for setting `$context['isGm']`
 * so destructive ops can be gated: without this flag, a non-GM caller
 * could bypass the snapshot path's timestamp-merge-only policy by
 * sending `placement.remove`, `template.remove`, or `drawing.remove`
 * directly.
 *
 * @param array<string,mixed> $state
 * @param array<string,mixed> $op
 * @param array<string,mixed> $context Optional context with keys:
 *   - `isGm` (bool): caller is GM. Defaults to false. Required for
 *     destructive ops (`placement.remove`) to be applied.
 * @return array<string,mixed>
 */
function applyBoardStateOp(array $state, array $op, array $context = []): array
{
    $type = isset($op['type']) && is_string($op['type']) ? $op['type'] : '';
    $isGm = (bool) ($context['isGm'] ?? false);

    if ($type === 'placement.move') {
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        $placementId = extractBoardStateOpPlacementId($op);
        if ($placementId === '') {
            return $state;
        }
        if (!isset($op['x']) || !is_numeric($op['x']) || !isset($op['y']) || !is_numeric($op['y'])) {
            return $state;
        }
        $x = (float) $op['x'];
        $y = (float) $op['y'];

        if (!isset($state['placements']) || !is_array($state['placements'])) {
            return $state;
        }
        if (!isset($state['placements'][$sceneId]) || !is_array($state['placements'][$sceneId])) {
            return $state;
        }

        $nowMs = (int) round(microtime(true) * 1000);
        foreach ($state['placements'][$sceneId] as $idx => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $entryId = extractBoardEntryIdentifier($entry);
            if ($entryId === null || $entryId !== $placementId) {
                continue;
            }
            // The op wire format uses `x`/`y` for coordinates (matching
            // the doc), but placement entries in this codebase store
            // positions as `column`/`row` (see the client store
            // normalizer and the snapshot save path). Writing `x`/`y`
            // directly would leave the canonical `column`/`row` stale
            // and the move would silently fail to apply on readback.
            $entry['column'] = $x;
            $entry['row'] = $y;
            // Stamp `_lastModified` so downstream timestamp-based merges
            // (player saves, delta reconciliation) treat this move as
            // newer than any stale payload already in flight.
            $entry['_lastModified'] = $nowMs;
            $state['placements'][$sceneId][$idx] = $entry;
            break;
        }
        return $state;
    }

    if ($type === 'placement.add') {
        // `placement.add` carries the full new placement entry in the
        // `placement` field. If a placement with the same id already
        // exists in the scene, it is replaced in-place (same semantics
        // as a later-wins dedup on the client). Non-GM callers are
        // allowed — the snapshot path already accepts new placements
        // from players via `mergeSceneEntriesByTimestamp`.
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        if (!isset($op['placement']) || !is_array($op['placement'])) {
            return $state;
        }
        $placement = $op['placement'];
        $placementId = extractBoardEntryIdentifier($placement);
        if ($placementId === null || $placementId === '') {
            return $state;
        }

        if (!isset($state['placements']) || !is_array($state['placements'])) {
            $state['placements'] = [];
        }
        if (!isset($state['placements'][$sceneId]) || !is_array($state['placements'][$sceneId])) {
            $state['placements'][$sceneId] = [];
        }

        // Stamp `_lastModified` so subsequent timestamp-based merges
        // treat this add as newer than any stale payload already in
        // flight. This also mirrors the client-side stamping done at
        // drop time.
        $nowMs = (int) round(microtime(true) * 1000);
        $placement['_lastModified'] = $nowMs;

        $replaced = false;
        foreach ($state['placements'][$sceneId] as $idx => $existing) {
            if (!is_array($existing)) {
                continue;
            }
            $existingId = extractBoardEntryIdentifier($existing);
            if ($existingId === $placementId) {
                $state['placements'][$sceneId][$idx] = $placement;
                $replaced = true;
                break;
            }
        }
        if (!$replaced) {
            $state['placements'][$sceneId][] = $placement;
        }
        return $state;
    }

    if ($type === 'placement.remove') {
        // Gate removals behind the GM-only rule the snapshot path
        // already enforces (snapshot path uses `mergeSceneEntriesByTimestamp`
        // which never deletes, so player removals are silently dropped
        // today). We do the same here by ignoring the op when the
        // caller is not a GM.
        if (!$isGm) {
            return $state;
        }
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        $placementId = extractBoardStateOpPlacementId($op);
        if ($placementId === '') {
            return $state;
        }
        if (!isset($state['placements'][$sceneId]) || !is_array($state['placements'][$sceneId])) {
            return $state;
        }
        $filtered = [];
        foreach ($state['placements'][$sceneId] as $entry) {
            if (!is_array($entry)) {
                $filtered[] = $entry;
                continue;
            }
            $entryId = extractBoardEntryIdentifier($entry);
            if ($entryId === $placementId) {
                continue;
            }
            $filtered[] = $entry;
        }
        // Re-index so json_encode serializes as a JSON array, not an
        // object with numeric string keys.
        $state['placements'][$sceneId] = array_values($filtered);
        return $state;
    }

    if ($type === 'placement.update') {
        // `placement.update` carries a shallow `patch` object that is
        // shallow-merged onto an existing placement. Fields not
        // present in the patch are left untouched. The `id` field is
        // never overwritten. `_lastModified` is always re-stamped by
        // the server so timestamp-based merges downstream treat this
        // as the newest version.
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        $placementId = extractBoardStateOpPlacementId($op);
        if ($placementId === '') {
            return $state;
        }
        if (!isset($op['patch']) || !is_array($op['patch'])) {
            return $state;
        }
        $patch = $op['patch'];
        if (!isset($state['placements'][$sceneId]) || !is_array($state['placements'][$sceneId])) {
            return $state;
        }
        $nowMs = (int) round(microtime(true) * 1000);
        foreach ($state['placements'][$sceneId] as $idx => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $entryId = extractBoardEntryIdentifier($entry);
            if ($entryId === null || $entryId !== $placementId) {
                continue;
            }
            foreach ($patch as $key => $value) {
                if ($key === 'id') {
                    continue;
                }
                // A null value signals that the property was deleted on
                // the source client (e.g. the last condition removed from
                // a token). Remove the key from the entry so downstream
                // code sees the property as absent rather than null.
                if ($value === null) {
                    unset($entry[$key]);
                } else {
                    $entry[$key] = $value;
                }
            }
            $entry['_lastModified'] = $nowMs;
            $state['placements'][$sceneId][$idx] = $entry;
            break;
        }
        return $state;
    }

    if ($type === 'template.upsert') {
        // `template.upsert` carries the full serialized template entry
        // in the `template` field. If a template with the same id
        // already exists in the scene, it is replaced in-place (later
        // wins); otherwise it is appended. Non-GM callers are allowed
        // — the snapshot player path accepts new/modified templates
        // via `mergeSceneEntriesByTimestamp`, so there is no
        // regression here.
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        if (!isset($op['template']) || !is_array($op['template'])) {
            return $state;
        }
        $template = $op['template'];
        $templateId = extractBoardEntryIdentifier($template);
        if ($templateId === null || $templateId === '') {
            return $state;
        }

        if (!isset($state['templates']) || !is_array($state['templates'])) {
            $state['templates'] = [];
        }
        if (!isset($state['templates'][$sceneId]) || !is_array($state['templates'][$sceneId])) {
            $state['templates'][$sceneId] = [];
        }

        // Stamp `_lastModified` so any downstream timestamp-based
        // merge treats this upsert as newer than any stale payload
        // already in flight.
        $nowMs = (int) round(microtime(true) * 1000);
        $template['_lastModified'] = $nowMs;

        $replaced = false;
        foreach ($state['templates'][$sceneId] as $idx => $existing) {
            if (!is_array($existing)) {
                continue;
            }
            $existingId = extractBoardEntryIdentifier($existing);
            if ($existingId === $templateId) {
                $state['templates'][$sceneId][$idx] = $template;
                $replaced = true;
                break;
            }
        }
        if (!$replaced) {
            $state['templates'][$sceneId][] = $template;
        }
        return $state;
    }

    if ($type === 'template.remove') {
        // Mirror the `placement.remove` rule: gate destructive template
        // removal behind the GM flag. The snapshot player path uses
        // `mergeSceneEntriesByTimestamp`, which never deletes, so
        // players cannot remove templates via the snapshot path today.
        // Allowing a player to ship `template.remove` here would
        // bypass that policy.
        if (!$isGm) {
            return $state;
        }
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        $templateId = '';
        if (isset($op['templateId'])) {
            $raw = $op['templateId'];
            if (is_string($raw)) {
                $templateId = trim($raw);
            } elseif (is_int($raw) || is_float($raw)) {
                $templateId = (string) $raw;
            }
        }
        if ($templateId === '') {
            return $state;
        }
        if (!isset($state['templates'][$sceneId]) || !is_array($state['templates'][$sceneId])) {
            return $state;
        }
        $filtered = [];
        foreach ($state['templates'][$sceneId] as $entry) {
            if (!is_array($entry)) {
                $filtered[] = $entry;
                continue;
            }
            $existingId = extractBoardEntryIdentifier($entry);
            if ($existingId === $templateId) {
                continue;
            }
            $filtered[] = $entry;
        }
        // Re-index so json_encode serializes as a JSON array, not an
        // object with numeric string keys.
        $state['templates'][$sceneId] = array_values($filtered);
        return $state;
    }

    if ($type === 'drawing.add') {
        // `drawing.add` carries the full new drawing entry in the
        // `drawing` field. If a drawing with the same id already
        // exists in the scene (should not happen in practice — each
        // drawing is minted with a fresh id), it is replaced
        // in-place. Non-GM callers are allowed: the draw flow is a
        // user feature, not a GM-only tool, and the snapshot player
        // path already accepts new drawings via
        // `mergeSceneEntriesByTimestamp`.
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        if (!isset($op['drawing']) || !is_array($op['drawing'])) {
            return $state;
        }
        $drawing = $op['drawing'];
        $drawingId = extractBoardEntryIdentifier($drawing);
        if ($drawingId === null || $drawingId === '') {
            return $state;
        }

        if (!isset($state['drawings']) || !is_array($state['drawings'])) {
            $state['drawings'] = [];
        }
        if (!isset($state['drawings'][$sceneId]) || !is_array($state['drawings'][$sceneId])) {
            $state['drawings'][$sceneId] = [];
        }

        $nowMs = (int) round(microtime(true) * 1000);
        $drawing['_lastModified'] = $nowMs;

        $replaced = false;
        foreach ($state['drawings'][$sceneId] as $idx => $existing) {
            if (!is_array($existing)) {
                continue;
            }
            $existingId = extractBoardEntryIdentifier($existing);
            if ($existingId === $drawingId) {
                $state['drawings'][$sceneId][$idx] = $drawing;
                $replaced = true;
                break;
            }
        }
        if (!$replaced) {
            $state['drawings'][$sceneId][] = $drawing;
        }
        return $state;
    }

    if ($type === 'drawing.remove') {
        // Gate destructive drawing removal behind the GM flag. The
        // snapshot player path uses `mergeSceneEntriesByTimestamp`,
        // which cannot delete, so players cannot remove individual
        // drawings via the snapshot path today. Players still have
        // access to erase/clear, which ride the `_replaceDrawings`
        // full-sync mechanism; that path is untouched by commit 5
        // and continues to work regardless of role.
        if (!$isGm) {
            return $state;
        }
        $sceneId = isset($op['sceneId']) && is_string($op['sceneId']) ? trim($op['sceneId']) : '';
        if ($sceneId === '') {
            return $state;
        }
        $drawingId = '';
        if (isset($op['drawingId'])) {
            $raw = $op['drawingId'];
            if (is_string($raw)) {
                $drawingId = trim($raw);
            } elseif (is_int($raw) || is_float($raw)) {
                $drawingId = (string) $raw;
            }
        }
        if ($drawingId === '') {
            return $state;
        }
        if (!isset($state['drawings'][$sceneId]) || !is_array($state['drawings'][$sceneId])) {
            return $state;
        }
        $filtered = [];
        foreach ($state['drawings'][$sceneId] as $entry) {
            if (!is_array($entry)) {
                $filtered[] = $entry;
                continue;
            }
            $existingId = extractBoardEntryIdentifier($entry);
            if ($existingId === $drawingId) {
                continue;
            }
            $filtered[] = $entry;
        }
        // Re-index so json_encode serializes as a JSON array, not an
        // object with numeric string keys.
        $state['drawings'][$sceneId] = array_values($filtered);
        return $state;
    }

    // Unknown op types are silently ignored so older servers can
    // tolerate payloads from newer clients.
    return $state;
}

/**
 * Phase 3-B: Normalize a placementId field on an incoming op. Accepts
 * strings, ints, or floats and returns a trimmed string. Returns an
 * empty string if the field is missing or empty.
 *
 * @param array<string,mixed> $op
 */
function extractBoardStateOpPlacementId(array $op): string
{
    if (!isset($op['placementId'])) {
        return '';
    }
    $raw = $op['placementId'];
    if (is_string($raw)) {
        return trim($raw);
    }
    if (is_int($raw) || is_float($raw)) {
        return (string) $raw;
    }
    return '';
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

function respondJson(int $status, array $payload, bool $exit = true): void
{
    http_response_code($status);
    echo json_encode($payload);
    if ($exit) {
        exit;
    }
}
