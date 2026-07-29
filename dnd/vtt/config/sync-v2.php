<?php
declare(strict_types=1);

/**
 * Sync V2 remains isolated from all live VTT domains during Phase 1.
 *
 * Flip domain ownership only in the phase dedicated to that domain and only
 * after its migration gate passes. Never enable a V2 domain while its V1
 * writer remains active.
 */
return [
    'mode' => 'shadow',
    'world_id' => getenv('VTT_SYNC_V2_WORLD_ID') ?: 'default',
    'event_retention' => 1000,
    'snapshot_interval' => 100,
    'pusher_enabled' => getenv('VTT_SYNC_V2_PUSHER_ENABLED') === '1',
    'domains' => [
        'token_movement' => false,
        'placements' => false,
        'combat' => false,
        'templates' => false,
        'drawings' => false,
        'fog' => false,
        'levels' => false,
        'scenes' => false,
    ],
];
