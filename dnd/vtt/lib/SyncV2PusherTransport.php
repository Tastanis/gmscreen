<?php
declare(strict_types=1);

require_once __DIR__ . '/PusherClient.php';

/**
 * Optional delivery adapter for accepted Sync V2 events.
 *
 * It is intentionally disabled unless VTT_SYNC_V2_PUSHER_ENABLED=1. Pusher is
 * delivery only; a failure here never rolls back or changes canonical state.
 */
final class SyncV2PusherTransport
{
    public static function publish(array $event, ?string $excludeSocketId = null): bool
    {
        if (getenv('VTT_SYNC_V2_PUSHER_ENABLED') !== '1') {
            return false;
        }

        $configPath = __DIR__ . '/../config/pusher.php';
        if (!is_file($configPath)) {
            return false;
        }
        $config = require $configPath;
        if (!is_array($config) || empty($config['enabled'])) {
            return false;
        }

        $appId = (string) ($config['app_id'] ?? '');
        $key = (string) ($config['key'] ?? '');
        $secret = (string) ($config['secret'] ?? '');
        if ($appId === '' || $key === '' || $secret === '') {
            return false;
        }

        $client = new PusherClient(
            $appId,
            $key,
            $secret,
            (string) ($config['cluster'] ?? 'us3'),
            (int) ($config['timeout'] ?? 5)
        );
        $channel = (string) ($config['sync_v2_channel'] ?? 'private-vtt-sync-v2-shadow');

        try {
            return $client->trigger(
                $channel,
                'sync-v2-event',
                ['event' => $event],
                $excludeSocketId
            );
        } catch (Throwable $error) {
            error_log('[VTT Sync V2] Pusher delivery failed: ' . $error->getMessage());
            return false;
        }
    }

    /**
     * Publish a caller-confirmed player-safe event on the existing public
     * board channel. Hidden movement must never call this method.
     */
    public static function publishPublic(array $event, ?string $excludeSocketId = null): bool
    {
        $configPath = __DIR__ . '/../config/pusher.php';
        if (!is_file($configPath)) {
            return false;
        }
        $config = require $configPath;
        if (!is_array($config) || empty($config['enabled'])) {
            return false;
        }
        $appId = (string) ($config['app_id'] ?? '');
        $key = (string) ($config['key'] ?? '');
        $secret = (string) ($config['secret'] ?? '');
        $channel = (string) ($config['channel'] ?? '');
        if ($appId === '' || $key === '' || $secret === '' || $channel === '') {
            return false;
        }
        $client = new PusherClient(
            $appId,
            $key,
            $secret,
            (string) ($config['cluster'] ?? 'us3'),
            (int) ($config['timeout'] ?? 5)
        );
        try {
            return $client->trigger(
                $channel,
                'sync-v2-event',
                ['event' => $event],
                $excludeSocketId
            );
        } catch (Throwable $error) {
            error_log('[VTT Sync V2] Public Pusher delivery failed: ' . $error->getMessage());
            return false;
        }
    }
}
