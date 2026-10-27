<?php
declare(strict_types=1);
/**
 * What the Table needs to know about you, without the map (Brandon, October 27, 2026: no button opens more than the
 * thing asked for; the chat and the scene list used to open the map to learn these).
 *   Included by index.php and chat.php; asked directly (GET) it answers in JSON (the scene list, fresh, for the
 *   Scenes flyout).
 */
require_once __DIR__ . '/../vtt/bootstrap.php';
require_once __DIR__ . '/../includes/chat_pusher.php';

/** Null when nobody is signed in. Scenes are the Director's only. */
function tableSiteConfig(): ?array
{
    $routes = require __DIR__ . '/../vtt/config/routes.php';
    $context = getVttUserContext();
    if (!$context['isLoggedIn'] || $context['user'] === '') {
        return null;
    }
    $isGm = (bool) $context['isGM'];
    return [
        'currentUser' => $context['user'],
        'isGM' => $isGm,
        'chatHandlerUrl' => $routes['chat'] ?? '/dnd/chat_handler.php',
        'chatParticipants' => loadChatParticipants(),
        'chatPusher' => getChatPusherClientConfig(),
        'scenes' => $isGm ? loadVttScenes() : ['folders' => [], 'items' => []],
        'scenesEndpoint' => $isGm ? ($routes['scenes'] ?? null) : null,
    ];
}

/** One number that changes whenever any Table file changes: added to the files it loads so no old copy is used. */
function tableBuild(): int
{
    $latest = 0;
    foreach (glob(__DIR__ . '/*.{js,css,php,html}', GLOB_BRACE) ?: [] as $file) {
        $latest = max($latest, (int) @filemtime($file));
    }
    return $latest;
}

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    $config = tableSiteConfig();
    session_write_close();
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if ($config === null) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Not signed in.']);
        exit;
    }
    echo json_encode(['success' => true, 'config' => $config], JSON_UNESCAPED_SLASHES);
}
