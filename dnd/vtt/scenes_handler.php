<?php
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

/** @var array{
 *     sceneData?: array,
 *     defaultActiveSceneId?: string|null,
 *     latestChangeId?: int
 * } $staticContent
 */
$staticContent = require __DIR__ . '/static_content.php';

$sceneData = [];
if (isset($staticContent['sceneData']) && is_array($staticContent['sceneData'])) {
    $sceneData = $staticContent['sceneData'];
}

if (!isset($sceneData['folders']) || !is_array($sceneData['folders'])) {
    $sceneData['folders'] = [];
}
if (!isset($sceneData['rootScenes']) || !is_array($sceneData['rootScenes'])) {
    $sceneData['rootScenes'] = [];
}

$scenes = flattenScenes($sceneData);
$sceneLookup = [];
foreach ($scenes as $scene) {
    if (!is_array($scene) || !isset($scene['id'])) {
        continue;
    }
    $sceneLookup[$scene['id']] = $scene;
}

$defaultSceneId = null;
if (isset($staticContent['defaultActiveSceneId'])) {
    $defaultSceneId = $staticContent['defaultActiveSceneId'];
}
if ($defaultSceneId === null || $defaultSceneId === '') {
    if (!empty($scenes)) {
        $firstScene = reset($scenes);
        if (is_array($firstScene) && isset($firstScene['id'])) {
            $defaultSceneId = $firstScene['id'];
        }
    }
}

$activeSceneId = $defaultSceneId;
$activeScene = ($activeSceneId !== null && isset($sceneLookup[$activeSceneId]))
    ? $sceneLookup[$activeSceneId]
    : null;

$latestChangeId = isset($staticContent['latestChangeId']) ? (int) $staticContent['latestChangeId'] : 0;

$user = $_SESSION['user'] ?? '';
$isGm = strtolower((string) $user) === 'gm';

$action = $_REQUEST['action'] ?? 'get_active';
$action = is_string($action) ? strtolower(trim($action)) : 'get_active';

switch ($action) {
    case 'get_active':
    case 'state':
        echo json_encode([
            'success' => true,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'active_scene' => $activeScene,
            'latest_change_id' => $latestChangeId,
        ]);
        exit;

    case 'list':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'latest_change_id' => $latestChangeId,
        ]);
        exit;

    case 'changes':
        echo json_encode([
            'success' => true,
            'changes' => [],
            'latest_change_id' => $latestChangeId,
        ]);
        exit;

    default:
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'Scene management is disabled while static demo content is active.',
        ]);
        exit;
}
