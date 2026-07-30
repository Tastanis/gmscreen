<?php
declare(strict_types=1);

require_once __DIR__ . '/../../bootstrap.php';
require_once __DIR__ . '/../../lib/SyncV2Store.php';

function vttSyncV2Respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function vttSyncV2ReadJson(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        vttSyncV2Respond(400, [
            'success' => false,
            'error' => 'Request body must be valid JSON.',
        ]);
    }
    return $decoded;
}

function vttSyncV2RequireShadowGm(): array
{
    $auth = getVttUserContext();
    if (!($auth['isLoggedIn'] ?? false)) {
        vttSyncV2Respond(401, [
            'success' => false,
            'error' => 'Authentication required.',
        ]);
    }
    if (!($auth['isGM'] ?? false)) {
        vttSyncV2Respond(403, [
            'success' => false,
            'error' => 'Sync V2 shadow endpoints are GM-only during Phase 1.',
        ]);
    }
    return $auth;
}

function vttSyncV2RequireAuthenticated(): array
{
    $auth = getVttUserContext();
    if (!($auth['isLoggedIn'] ?? false)) {
        vttSyncV2Respond(401, [
            'success' => false,
            'error' => 'Authentication required.',
        ]);
    }
    return $auth;
}

function vttSyncV2Config(): array
{
    $configPath = __DIR__ . '/../../config/sync-v2.php';
    $config = is_file($configPath) ? require $configPath : [];
    return is_array($config) ? $config : [];
}

function vttSyncV2DomainEnabled(string $domain): bool
{
    $config = vttSyncV2Config();
    return ($config['domains'][$domain] ?? false) === true;
}

function vttSyncV2FindLegacyPlacement(string $sceneId, string $placementId): ?array
{
    if (vttSyncV2DomainEnabled('placements')) {
        $snapshot = vttSyncV2Store()->getSnapshot();
        $placement = $snapshot['state']['placements'][$sceneId][$placementId] ?? null;
        return is_array($placement) ? $placement : null;
    }
    $boardState = loadVttJson('board-state.json');
    $placements = $boardState['placements'][$sceneId] ?? [];
    if (!is_array($placements)) {
        return null;
    }
    foreach ($placements as $placement) {
        if (!is_array($placement)) {
            continue;
        }
        $id = isset($placement['id']) ? trim((string) $placement['id']) : '';
        if ($id === $placementId) {
            return $placement;
        }
    }
    return null;
}

function vttSyncV2PlacementHidden(array $placement): bool
{
    return !empty($placement['hidden'])
        || !empty($placement['isHidden'])
        || !empty($placement['flags']['hidden']);
}

function vttSyncV2CanMovePlacement(
    array $auth,
    string $sceneId,
    string $placementId,
    array $placement
): bool {
    if (($auth['isGM'] ?? false) === true) {
        return true;
    }
    if (vttSyncV2PlacementHidden($placement)) {
        return false;
    }
    $userId = strtolower(trim((string) ($auth['user'] ?? '')));
    if ($userId === '') {
        return false;
    }
    if (vttSyncV2DomainEnabled('placements')) {
        $snapshot = vttSyncV2Store()->getSnapshot();
        $claimedBy = strtolower(trim((string) (
            $snapshot['state']['claims'][$sceneId][$placementId] ?? ''
        )));
    } else {
        $boardState = loadVttJson('board-state.json');
        $claimedBy = strtolower(trim((string) (
            $boardState['sceneState'][$sceneId]['claimedTokens'][$placementId] ?? ''
        )));
    }
    return $claimedBy !== '' && $claimedBy === $userId;
}

function vttSyncV2ProjectSnapshotForUser(array $snapshot, array $auth): array
{
    if (!isset($snapshot['state']) || !is_array($snapshot['state'])) {
        $snapshot['state'] = [];
    }
    $canonical = $snapshot['state']['placements'] ?? [];
    $projected = [];
    foreach ($canonical as $sceneId => $placements) {
        if (!is_string($sceneId) || !is_array($placements)) {
            continue;
        }
        foreach ($placements as $placementId => $placement) {
            if (
                !is_string($placementId)
                || !is_array($placement)
                || (!($auth['isGM'] ?? false) && vttSyncV2PlacementHidden($placement))
            ) {
                continue;
            }
            $projected[$sceneId][$placementId] = ($auth['isGM'] ?? false)
                ? $placement
                : sanitizePlacementForPlayerView($placement);
        }
    }
    $snapshot['state']['placements'] = $projected;
    $visibleClaims = [];
    foreach (($snapshot['state']['claims'] ?? []) as $sceneId => $claims) {
        if (!is_array($claims)) {
            continue;
        }
        foreach ($claims as $placementId => $owner) {
            if (isset($projected[$sceneId][$placementId])) {
                $visibleClaims[$sceneId][$placementId] = $owner;
            }
        }
    }
    $snapshot['state']['claims'] = $visibleClaims;
    if (!($auth['isGM'] ?? false)) {
        foreach (($snapshot['state']['combat'] ?? []) as $sceneId => $combat) {
            if (!is_array($combat)) {
                continue;
            }
            $placements = array_values($canonical[$sceneId] ?? []);
            $snapshot['state']['combat'][$sceneId] = sanitizeCombatStateForPlayerView(
                $combat,
                $placements
            );
        }
        $routing = is_array($snapshot['state']['routing'] ?? null)
            ? $snapshot['state']['routing']
            : [];
        if (!empty($routing['playerMapDisabled'])) {
            $routing['activeSceneId'] = null;
            $routing['mapUrl'] = null;
            $routing['thumbnailUrl'] = null;
        } else {
            if (is_string($routing['playerActiveSceneId'] ?? null)) {
                $routing['activeSceneId'] = $routing['playerActiveSceneId'];
            }
            if (is_string($routing['playerMapUrl'] ?? null)) {
                $routing['mapUrl'] = $routing['playerMapUrl'];
            }
            if (is_string($routing['playerThumbnailUrl'] ?? null)) {
                $routing['thumbnailUrl'] = $routing['playerThumbnailUrl'];
            }
        }
        unset(
            $routing['playerMapDisabled'],
            $routing['playerActiveSceneId'],
            $routing['playerMapUrl'],
            $routing['playerThumbnailUrl']
        );
        $snapshot['state']['routing'] = $routing;
    }
    return $snapshot;
}

function vttSyncV2ProjectRecoveryForUser(array $recovery, array $auth): array
{
    if (($recovery['mode'] ?? '') === 'snapshot' && is_array($recovery['snapshot'] ?? null)) {
        $recovery['snapshot'] = vttSyncV2ProjectSnapshotForUser($recovery['snapshot'], $auth);
        return $recovery;
    }
    if (!is_array($recovery['events'] ?? null)) {
        return $recovery;
    }
    foreach ($recovery['events'] as $index => $event) {
        if (!is_array($event)) {
            continue;
        }
        if (($event['type'] ?? '') === 'placement.batchApplied') {
            $recovery['events'][$index] = vttSyncV2ProjectPlacementEventForUser($event, $auth);
            continue;
        }
        if (($event['type'] ?? '') === 'combat.transitioned') {
            $recovery['events'][$index] = vttSyncV2ProjectCombatEventForUser($event, $auth);
            continue;
        }
        if (in_array(($event['type'] ?? ''), ['scene.activated', 'routing.changed'], true)) {
            $recovery['events'][$index] = vttSyncV2ProjectBoardEventForUser($event, $auth);
            continue;
        }
        if (($event['type'] ?? '') !== 'token.moved') {
            continue;
        }
        $snapshot = vttSyncV2Store()->getSnapshot();
        $placement = $snapshot['state']['placements'][$event['sceneId']][$event['entityId']] ?? null;
        if (!is_array($placement) || (!($auth['isGM'] ?? false) && vttSyncV2PlacementHidden($placement))) {
            $recovery['events'][$index] = [
                'revision' => $event['revision'],
                'operationId' => $event['operationId'],
                'type' => 'sync.redacted',
                'actorId' => null,
                'sceneId' => null,
                'entityId' => null,
                'entityRevision' => null,
                'payload' => [],
                'serverTime' => $event['serverTime'] ?? null,
            ];
        }
    }
    return $recovery;
}

function vttSyncV2ProjectBoardEventForUser(array $event, array $auth): array
{
    if (($auth['isGM'] ?? false) === true) {
        return $event;
    }
    if (!in_array(($event['type'] ?? ''), ['scene.activated', 'routing.changed'], true)) {
        $event['actorId'] = null;
        return $event;
    }
    $snapshot = vttSyncV2ProjectSnapshotForUser(vttSyncV2Store()->getSnapshot(), $auth);
    $routing = $snapshot['state']['routing'] ?? [];
    $event['sceneId'] = is_string($routing['activeSceneId'] ?? null)
        ? $routing['activeSceneId']
        : null;
    if (($event['type'] ?? '') === 'scene.activated' && $event['sceneId'] === null) {
        $event['type'] = 'routing.changed';
    }
    $event['payload'] = ['routing' => $routing];
    $event['actorId'] = null;
    return $event;
}

function vttSyncV2ProjectCombatEventForUser(array $event, array $auth): array
{
    if (($auth['isGM'] ?? false) === true) {
        return $event;
    }
    $sceneId = (string) ($event['sceneId'] ?? '');
    $combat = $event['payload']['combat'] ?? null;
    if (!is_array($combat)) {
        $event['actorId'] = null;
        return $event;
    }
    $snapshot = vttSyncV2Store()->getSnapshot();
    $placements = array_values($snapshot['state']['placements'][$sceneId] ?? []);
    $event['payload']['combat'] = sanitizeCombatStateForPlayerView($combat, $placements);
    $visibleIds = [];
    foreach ($placements as $placement) {
        if (
            is_array($placement)
            && !vttSyncV2PlacementHidden($placement)
            && is_string($placement['id'] ?? null)
            && trim($placement['id']) !== ''
        ) {
            $visibleIds[trim($placement['id'])] = true;
        }
    }
    if (is_array($event['payload']['transition'] ?? null)) {
        foreach (['combatantId', 'previousCombatantId'] as $field) {
            $id = $event['payload']['transition'][$field] ?? null;
            if (is_string($id) && trim($id) !== '' && !isset($visibleIds[trim($id)])) {
                $event['payload']['transition'][$field] = '__hidden_enemy__';
            }
        }
    }
    $event['actorId'] = null;
    return $event;
}

function vttSyncV2CombatEventIsPublicSafe(array $event): bool
{
    $projected = vttSyncV2ProjectCombatEventForUser($event, ['isGM' => false]);
    return ($projected['payload']['combat'] ?? null) === ($event['payload']['combat'] ?? null)
        && ($projected['payload']['transition'] ?? null) === ($event['payload']['transition'] ?? null);
}

function vttSyncV2ProjectPlacementEventForUser(array $event, array $auth): array
{
    if (($auth['isGM'] ?? false) === true) {
        return $event;
    }
    $projected = [];
    foreach (($event['payload']['mutations'] ?? []) as $mutation) {
        if (!is_array($mutation)) {
            continue;
        }
        if (($mutation['kind'] ?? '') === 'upsert') {
            $placement = $mutation['placement'] ?? null;
            if (!is_array($placement) || vttSyncV2PlacementHidden($placement)) {
                if (($mutation['wasPlayerVisible'] ?? false) === true) {
                    $projected[] = [
                        'kind' => 'remove',
                        'sceneId' => $mutation['sceneId'] ?? null,
                        'placementId' => $mutation['placementId'] ?? null,
                        'entityRevision' => $mutation['entityRevision'] ?? null,
                    ];
                }
                continue;
            }
            $mutation['placement'] = sanitizePlacementForPlayerView($placement);
        } elseif (
            in_array(($mutation['kind'] ?? ''), ['remove', 'claim.set', 'claim.clear'], true)
            && ($mutation['playerVisible'] ?? false) !== true
        ) {
            continue;
        }
        unset($mutation['playerVisible'], $mutation['wasPlayerVisible']);
        $projected[] = $mutation;
    }
    $event['payload']['mutations'] = $projected;
    $event['actorId'] = null;
    return $event;
}

function vttSyncV2PlacementEventIsPublicSafe(array $event): bool
{
    foreach (($event['payload']['mutations'] ?? []) as $mutation) {
        if (!is_array($mutation) || ($mutation['kind'] ?? '') !== 'upsert') {
            return false;
        }
        $placement = $mutation['placement'] ?? null;
        if (
            !is_array($placement)
            || vttSyncV2PlacementHidden($placement)
            || sanitizePlacementForPlayerView($placement) !== $placement
        ) {
            return false;
        }
    }
    return true;
}

function vttSyncV2Store(): SyncV2Store
{
    static $store = null;
    static $migrated = false;
    if ($store instanceof SyncV2Store) {
        return $store;
    }
    $config = vttSyncV2Config();
    $configuredPath = getenv('VTT_SYNC_V2_DATABASE');
    $databasePath = is_string($configuredPath) && trim($configuredPath) !== ''
        ? trim($configuredPath)
        : (__DIR__ . '/../../storage/sync-v2.sqlite');

    $store = new SyncV2Store(
        $databasePath,
        (string) ($config['world_id'] ?? 'default'),
        (int) ($config['event_retention'] ?? 1000),
        (int) ($config['snapshot_interval'] ?? 100)
    );
    if (!$migrated && vttSyncV2DomainEnabled('placements')) {
        $store->migrateLegacyPlacements(loadVttJson('board-state.json'));
        $migrated = true;
    }
    if (vttSyncV2DomainEnabled('combat')) {
        $store->migrateLegacyCombat(loadVttJson('board-state.json'));
    }
    if (
        vttSyncV2DomainEnabled('templates')
        || vttSyncV2DomainEnabled('drawings')
        || vttSyncV2DomainEnabled('pings')
        || vttSyncV2DomainEnabled('fog')
        || vttSyncV2DomainEnabled('levels')
        || vttSyncV2DomainEnabled('scenes')
        || vttSyncV2DomainEnabled('grid')
        || vttSyncV2DomainEnabled('routing')
    ) {
        $store->migrateLegacyBoardDomains(loadVttJson('board-state.json'));
    }
    return $store;
}

function vttSyncV2HandleFailure(Throwable $error): void
{
    if ($error instanceof InvalidArgumentException) {
        vttSyncV2Respond(422, [
            'success' => false,
            'error' => $error->getMessage(),
        ]);
    }

    error_log('[VTT Sync V2] ' . $error->getMessage());
    $sqliteUnavailable = str_contains($error->getMessage(), 'PDO SQLite');
    vttSyncV2Respond($sqliteUnavailable ? 503 : 500, [
        'success' => false,
        'error' => $sqliteUnavailable
            ? 'Sync V2 storage is unavailable on this server.'
            : 'Unexpected Sync V2 server error.',
    ]);
}
