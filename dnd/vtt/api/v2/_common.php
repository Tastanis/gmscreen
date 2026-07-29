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

function vttSyncV2Store(): SyncV2Store
{
    $configPath = __DIR__ . '/../../config/sync-v2.php';
    $config = is_file($configPath) ? require $configPath : [];
    $config = is_array($config) ? $config : [];
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
