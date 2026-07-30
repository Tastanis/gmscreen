<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        vttSyncV2Respond(405, [
            'success' => false,
            'error' => 'Method not allowed.',
        ]);
    }
    $auth = vttSyncV2RequireAuthenticated();
    $socketId = trim((string) ($_POST['socket_id'] ?? ''));
    $channelName = trim((string) ($_POST['channel_name'] ?? ''));
    $configPath = __DIR__ . '/../../config/pusher.php';
    $config = is_file($configPath) ? require $configPath : [];
    $key = trim((string) ($config['key'] ?? ''));
    $secret = trim((string) ($config['secret'] ?? ''));
    $permittedChannel = ($auth['isGM'] ?? false)
        ? (string) ($config['sync_v2_gm_channel'] ?? 'private-vtt-sync-v2-gm')
        : (string) ($config['sync_v2_player_channel'] ?? 'private-vtt-sync-v2-players');
    if ($key === '' || $secret === '' || $channelName !== $permittedChannel) {
        vttSyncV2Respond(403, [
            'success' => false,
            'error' => 'This Sync V2 audience channel is not permitted.',
        ]);
    }

    vttSyncV2Respond(
        200,
        vttSyncV2BuildPusherAuthorization($socketId, $channelName, $key, $secret)
    );
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
