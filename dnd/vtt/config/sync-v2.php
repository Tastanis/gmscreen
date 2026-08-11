<?php
declare(strict_types=1);

/**
 * Sync V2 owns each domain whose flag is enabled below.
 *
 * Flip domain ownership only in the phase dedicated to that domain and only
 * after its migration gate passes. Never enable a V2 domain while its V1
 * writer remains active.
 */
return [
    'mode' => 'live',
    'world_id' => getenv('VTT_SYNC_V2_WORLD_ID') ?: 'default',
    'event_retention' => 1000,
    'snapshot_interval' => 100,
    'snapshot_retention' => 20,
    'pusher_enabled' => getenv('VTT_SYNC_V2_PUSHER_ENABLED') === '1',
    'domains' => [
        'token_movement' => true,
        'placements' => true,
        'combat' => true,
        'templates' => true,
        'drawings' => true,
        'pings' => true,
        'fog' => true,
        'levels' => true,
        'scenes' => true,
        'grid' => true,
        'routing' => true,
        'requested_tests' => true,
    ],
];
