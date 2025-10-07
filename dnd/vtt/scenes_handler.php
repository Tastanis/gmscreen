<?php

declare(strict_types=1);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../includes/http_error_handler.php';
VttHttpErrorHandler::registerJson();

header('Content-Type: application/json');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Authentication required.']);
    exit;
}

require_once __DIR__ . '/scenes_repository.php';
require_once __DIR__ . '/scene_state_repository.php';

$sceneData = require __DIR__ . '/scenes.php';
if (!is_array($sceneData)) {
    $sceneData = [
        'folders' => [],
        'rootScenes' => [],
    ];
}

$scenes = flattenScenes($sceneData);
$sceneLookup = [];
foreach ($scenes as $scene) {
    if (!is_array($scene) || !isset($scene['id'])) {
        continue;
    }
    $sceneLookup[$scene['id']] = $scene;
}

$defaultSceneId = getFirstSceneId($sceneData);
$sceneStateFile = getSceneStateFilePath();
ensureSceneStateFile($sceneStateFile, $defaultSceneId);
$activeSceneId = loadActiveSceneId($sceneLookup, $defaultSceneId, $sceneStateFile);
$activeScene = ($activeSceneId !== null && isset($sceneLookup[$activeSceneId]))
    ? $sceneLookup[$activeSceneId]
    : null;

$action = $_REQUEST['action'] ?? 'get_active';
$action = is_string($action) ? strtolower(trim($action)) : 'get_active';

switch ($action) {
    case 'state':
        echo json_encode([
            'success' => true,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'active_scene' => $activeScene,
            'latest_change_id' => 0,
        ]);
        exit;

    case 'changes':
        echo json_encode([
            'success' => true,
            'changes' => [],
            'latest_change_id' => 0,
        ]);
        exit;

    case 'get_active':
        echo json_encode([
            'success' => true,
            'active_scene_id' => $activeSceneId,
            'scene' => $activeScene,
            'latest_change_id' => 0,
        ]);
        exit;

    default:
        http_response_code(410);
        echo json_encode([
            'success' => false,
            'error' => 'Scene management APIs are no longer available.',
        ]);
        exit;
}

