<?php
declare(strict_types=1);

/**
 * Retired V1 board-state endpoint.
 *
 * Sync V2 commands, ordered recovery, and snapshots are the only supported
 * shared-board APIs. Returning 410 prevents cached clients from silently
 * reintroducing whole-board writes or public-channel synchronization.
 */
http_response_code(410);
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo json_encode([
    'success' => false,
    'error' => 'The V1 board-state endpoint has been retired. Refresh the VTT.',
    'replacement' => [
        'commands' => '/dnd/vtt/api/v2/commands.php',
        'sync' => '/dnd/vtt/api/v2/sync.php',
        'snapshot' => '/dnd/vtt/api/v2/snapshot.php',
    ],
], JSON_UNESCAPED_SLASHES);
