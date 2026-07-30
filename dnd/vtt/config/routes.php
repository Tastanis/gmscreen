<?php
declare(strict_types=1);

return [
    'chat'   => '/dnd/chat_handler.php',
    'state'  => '/dnd/vtt/api/state.php',
    'scenes' => '/dnd/vtt/api/scenes.php',
    'tokens' => '/dnd/vtt/api/tokens.php',
    'monsters' => '/dnd/vtt/api/monsters.php',
    'uploads'=> '/dnd/vtt/api/uploads.php',
    'sheet' => '/dnd/character_sheet/handler.php',
    'items' => '/dnd/vtt/api/items.php',
    'syncV2Commands' => '/dnd/vtt/api/v2/commands.php',
    'syncV2Events' => '/dnd/vtt/api/v2/sync.php',
    'syncV2Snapshot' => '/dnd/vtt/api/v2/snapshot.php',
    'syncV2Auth' => '/dnd/vtt/api/v2/pusher-auth.php',
    'syncV2Status' => '/dnd/vtt/api/v2/status.php',
];
