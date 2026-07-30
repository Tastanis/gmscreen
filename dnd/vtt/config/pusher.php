<?php
declare(strict_types=1);

/**
 * Pusher configuration for VTT real-time synchronization.
 *
 * This file contains the Pusher credentials for the VTT application.
 * The secret key should be kept confidential and not exposed to clients.
 */
$configuredSecret = getenv('VTT_PUSHER_SECRET');
$pusherSecret = is_string($configuredSecret) && trim($configuredSecret) !== ''
    ? trim($configuredSecret)
    : 'eefd4c24ecf056b882c3';

return [
    // Pusher application ID
    'app_id' => '2106273',

    // Pusher application key (public - safe to expose to clients)
    'key' => 'c32516844b741a8b1772',

    // Pusher application secret (private - server-side only!)
    // Production can rotate the legacy checked-in secret without a code
    // deployment by setting VTT_PUSHER_SECRET in the PHP environment.
    'secret' => $pusherSecret,

    // Pusher cluster
    'cluster' => 'us3',

    // Enable/disable Pusher integration (set to false to disable without removing config)
    'enabled' => true,

    // Channel name for VTT board state updates
    'channel' => 'vtt-board',

    // Authenticated Sync V2 audience channels. The browser receives only the
    // one channel permitted for its current authenticated role.
    'sync_v2_gm_channel' => 'private-vtt-sync-v2-gm',
    'sync_v2_player_channel' => 'private-vtt-sync-v2-players',

    // Channel name for dashboard/VTT/character-sheet chat updates.
    // Carries `chat-updated` notification events (no payload) emitted on
    // chat send / clear / roll-status changes. Subscribers refetch via the
    // chat HTTP endpoint, which preserves whisper visibility filtering.
    'chat_channel' => 'dnd-chat',

    // HTTP request timeout in seconds
    'timeout' => 5,

    // Event types that should trigger broadcasts
    'broadcast_events' => [
        'placements' => true,      // Token position changes
        'templates' => true,       // Area effect templates
        'drawings' => true,        // Freehand drawings
        'pings' => true,           // Map pings
        'combat' => true,          // Combat state changes
        'scene' => true,           // Scene changes (GM only)
        'overlay' => true,         // Fog of war (GM only)
    ],
];
