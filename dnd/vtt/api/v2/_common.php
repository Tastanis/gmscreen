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
    $boardState = loadVttJson('board-state.json');
    $claimedBy = strtolower(trim((string) (
        $boardState['sceneState'][$sceneId]['claimedTokens'][$placementId] ?? ''
    )));
    return $claimedBy !== '' && $claimedBy === $userId;
}

function vttSyncV2ProjectSnapshotForUser(array $snapshot, array $auth): array
{
    $boardState = loadVttJson('board-state.json');
    if (!isset($snapshot['state']) || !is_array($snapshot['state'])) {
        $snapshot['state'] = [];
    }
    $canonical = $snapshot['state']['placements'] ?? [];
    $projected = [];
    foreach (($boardState['placements'] ?? []) as $sceneId => $placements) {
        if (!is_string($sceneId) || !is_array($placements)) {
            continue;
        }
        foreach ($placements as $placement) {
            if (!is_array($placement) || (!($auth['isGM'] ?? false) && vttSyncV2PlacementHidden($placement))) {
                continue;
            }
            $placementId = trim((string) ($placement['id'] ?? ''));
            if ($placementId === '') {
                continue;
            }
            $current = $canonical[$sceneId][$placementId] ?? [];
            $projected[$sceneId][$placementId] = [
                'id' => $placementId,
                'column' => (float) ($current['column'] ?? $placement['column'] ?? 0),
                'row' => (float) ($current['row'] ?? $placement['row'] ?? 0),
                'width' => max(1, (float) ($placement['width'] ?? 1)),
                'height' => max(1, (float) ($placement['height'] ?? 1)),
                '_entityRevision' => max(0, (int) ($current['_entityRevision'] ?? 0)),
            ];
        }
    }
    $snapshot['state']['placements'] = $projected;
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
    $boardState = loadVttJson('board-state.json');
    foreach ($recovery['events'] as $index => $event) {
        if (!is_array($event) || ($event['type'] ?? '') !== 'token.moved') {
            continue;
        }
        $sceneId = (string) ($event['sceneId'] ?? '');
        $entityId = (string) ($event['entityId'] ?? '');
        $placement = null;
        foreach (($boardState['placements'][$sceneId] ?? []) as $candidate) {
            if (is_array($candidate) && (string) ($candidate['id'] ?? '') === $entityId) {
                $placement = $candidate;
                break;
            }
        }
        if (
            $placement === null
            || (!($auth['isGM'] ?? false) && vttSyncV2PlacementHidden($placement))
        ) {
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

function vttSyncV2Store(): SyncV2Store
{
    $config = vttSyncV2Config();
    $configuredPath = getenv('VTT_SYNC_V2_DATABASE');
    $databasePath = is_string($configuredPath) && trim($configuredPath) !== ''
        ? trim($configuredPath)
        : (__DIR__ . '/../../storage/sync-v2.sqlite');

    return new SyncV2Store(
        $databasePath,
        (string) ($config['world_id'] ?? 'default'),
        (int) ($config['event_retention'] ?? 1000),
        (int) ($config['snapshot_interval'] ?? 100)
    );
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
