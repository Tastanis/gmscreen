<?php
declare(strict_types=1);

/**
 * Pusher configuration for VTT real-time synchronization.
 *
 * This file contains the Pusher credentials for the VTT application.
 * The secret key should be kept confidential and not exposed to clients.
 */
return [
    // Pusher application ID
    'app_id' => '2106273',

    // Pusher application key (public - safe to expose to clients)
    'key' => 'c32516844b741a8b1772',

    // Pusher application secret (private - server-side only!)
    'secret' => 'eefd4c24ecf056b882c3',

    // Pusher cluster
    'cluster' => 'us3',

    // Enable/disable Pusher integration (set to false to disable without removing config)
    'enabled' => true,

    // Channel name for VTT board state updates
    'channel' => 'vtt-board',

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
