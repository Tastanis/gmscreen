<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Authentication required.']);
    exit;
}

$user = $_SESSION['user'] ?? '';
$isGm = strtolower($user) === 'gm';

$scenes = require __DIR__ . '/scenes.php';
if (!is_array($scenes)) {
    $scenes = [];
}

$sceneLookup = [];
$defaultSceneId = null;
foreach ($scenes as $scene) {
    if (!is_array($scene) || !isset($scene['id'])) {
        continue;
    }
    $sceneId = (string) $scene['id'];
    if ($sceneId === '') {
        continue;
    }
    if ($defaultSceneId === null) {
        $defaultSceneId = $sceneId;
    }
    $sceneLookup[$sceneId] = $scene;
}

$sceneStateFile = __DIR__ . '/../data/vtt_active_scene.json';
ensureSceneStateFile($sceneStateFile, $defaultSceneId);

$action = $_REQUEST['action'] ?? 'get_active';
$action = is_string($action) ? strtolower(trim($action)) : 'get_active';

switch ($action) {
    case 'activate':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can activate scenes.']);
            exit;
        }

        $sceneId = $_POST['scene_id'] ?? '';
        $sceneId = is_string($sceneId) ? trim($sceneId) : '';
        if ($sceneId === '' || !isset($sceneLookup[$sceneId])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid scene identifier.']);
            exit;
        }

        if (!saveActiveSceneId($sceneStateFile, $sceneId)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Unable to update the active scene.']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'active_scene_id' => $sceneId,
            'scene' => $sceneLookup[$sceneId],
        ]);
        exit;

    case 'get_active':
    default:
        $activeSceneId = loadActiveSceneId($sceneStateFile, $defaultSceneId, $sceneLookup);
        $scene = $activeSceneId !== null && isset($sceneLookup[$activeSceneId])
            ? $sceneLookup[$activeSceneId]
            : null;

        echo json_encode([
            'success' => true,
            'active_scene_id' => $activeSceneId,
            'scene' => $scene,
        ]);
        exit;
}

function ensureSceneStateFile($filePath, $defaultSceneId)
{
    $directory = dirname($filePath);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (!file_exists($filePath) && $defaultSceneId !== null) {
        file_put_contents(
            $filePath,
            json_encode(['active_scene_id' => $defaultSceneId], JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }
}

function loadActiveSceneId($filePath, $defaultSceneId, array $sceneLookup)
{
    if (!file_exists($filePath)) {
        return $defaultSceneId;
    }

    $fp = fopen($filePath, 'r');
    if ($fp === false) {
        return $defaultSceneId;
    }

    $content = '';
    if (flock($fp, LOCK_SH)) {
        $content = stream_get_contents($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    $data = json_decode($content, true);
    if (is_array($data) && isset($data['active_scene_id'])) {
        $sceneId = (string) $data['active_scene_id'];
        if ($sceneId !== '' && isset($sceneLookup[$sceneId])) {
            return $sceneId;
        }
    }

    if ($defaultSceneId !== null) {
        saveActiveSceneId($filePath, $defaultSceneId);
    }

    return $defaultSceneId;
}

function saveActiveSceneId($filePath, $sceneId)
{
    $directory = dirname($filePath);
    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    $fp = fopen($filePath, 'c+');
    if ($fp === false) {
        return false;
    }

    $result = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        $bytesWritten = fwrite($fp, json_encode(['active_scene_id' => $sceneId], JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        $result = $bytesWritten !== false;
    }

    fclose($fp);
    return $result;
}
