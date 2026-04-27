<?php
declare(strict_types=1);

/**
 * Chat Pusher helpers.
 *
 * The chat panel runs in three host pages (dashboard, VTT, character sheet)
 * and shares the Pusher credentials defined in vtt/config/pusher.php. The
 * chat broadcast is a notification-only event — clients refetch through the
 * regular chat HTTP endpoint when notified, which keeps whisper visibility
 * filtering intact and avoids the 10 KB Pusher payload limit.
 */

require_once __DIR__ . '/../vtt/lib/PusherClient.php';

/**
 * Public-facing config for the browser. Returns null when Pusher is
 * disabled / unconfigured, so the client falls back to the legacy poll.
 *
 * @return array{key:string,cluster:string,channel:string}|null
 */
function getChatPusherClientConfig(): ?array
{
    $config = loadChatPusherConfig();
    if ($config === null) {
        return null;
    }

    $key = (string) ($config['key'] ?? '');
    $cluster = (string) ($config['cluster'] ?? 'us3');
    $channel = (string) ($config['chat_channel'] ?? 'dnd-chat');

    if ($key === '' || $channel === '') {
        return null;
    }

    return [
        'key' => $key,
        'cluster' => $cluster,
        'channel' => $channel,
    ];
}

/**
 * Server-side broadcast of a `chat-updated` notification. Called after a
 * successful chat send / clear / roll-status update. The event payload is
 * deliberately small — clients refetch via HTTP to get authoritative,
 * per-user filtered content.
 *
 * Fails silently when Pusher is unavailable so the chat write itself is
 * never blocked by an outbound API problem.
 */
function broadcastChatUpdate(string $kind = 'message'): void
{
    $config = loadChatPusherConfig();
    if ($config === null) {
        return;
    }

    $appId = (string) ($config['app_id'] ?? '');
    $key = (string) ($config['key'] ?? '');
    $secret = (string) ($config['secret'] ?? '');
    $cluster = (string) ($config['cluster'] ?? 'us3');
    $channel = (string) ($config['chat_channel'] ?? 'dnd-chat');
    // Use a tighter timeout than the board broadcaster — chat sends are
    // user-interactive and we don't want a Pusher outage to stall the UI.
    $timeout = 2;

    if ($appId === '' || $key === '' || $secret === '' || $channel === '') {
        return;
    }

    try {
        $client = new PusherClient($appId, $key, $secret, $cluster, $timeout);
        $client->trigger($channel, 'chat-updated', [
            'kind' => $kind,
            'ts' => date('c'),
        ]);
    } catch (Throwable $e) {
        error_log('[Chat] Pusher broadcast failed: ' . $e->getMessage());
    }
}

/**
 * @return array<string,mixed>|null
 */
function loadChatPusherConfig(): ?array
{
    static $cached = null;
    static $loaded = false;

    if ($loaded) {
        return $cached;
    }

    $loaded = true;
    $configPath = __DIR__ . '/../vtt/config/pusher.php';
    if (!is_file($configPath)) {
        return null;
    }

    $config = require $configPath;
    if (!is_array($config) || empty($config['enabled'])) {
        return null;
    }

    $cached = $config;
    return $cached;
}
