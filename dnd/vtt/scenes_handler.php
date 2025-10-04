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

require_once __DIR__ . '/scenes_repository.php';

$user = $_SESSION['user'] ?? '';
$isGm = strtolower((string) $user) === 'gm';

$sceneData = loadScenesData();
$scenes = flattenScenes($sceneData);
$sceneLookup = [];
foreach ($scenes as $scene) {
    if (!is_array($scene) || !isset($scene['id'])) {
        continue;
    }
    $sceneLookup[$scene['id']] = $scene;
}

$defaultSceneId = getFirstSceneId($sceneData);

$sceneStateFile = __DIR__ . '/../data/vtt_active_scene.json';
ensureSceneStateFile($sceneStateFile, $defaultSceneId);

$action = $_REQUEST['action'] ?? 'get_active';
$action = is_string($action) ? strtolower(trim($action)) : 'get_active';

switch ($action) {
    case 'state':
        $stateResponse = buildSceneStateResponse(
            $sceneData,
            $scenes,
            $sceneLookup,
            $sceneStateFile,
            $defaultSceneId
        );
        echo json_encode($stateResponse);
        exit;

    case 'changes':
        $sinceParam = $_GET['since'] ?? $_POST['since'] ?? 0;
        $since = filter_var($sinceParam, FILTER_VALIDATE_INT);
        if ($since === false || $since < 0) {
            $since = 0;
        }

        $changes = getSceneChangesSince($since);
        echo json_encode([
            'success' => true,
            'changes' => $changes,
            'latest_change_id' => getLatestChangeId(),
        ]);
        exit;

    case 'list':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        $stateResponse = buildSceneStateResponse(
            $sceneData,
            $scenes,
            $sceneLookup,
            $sceneStateFile,
            $defaultSceneId
        );
        echo json_encode($stateResponse);
        exit;

    case 'create_folder':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        $name = isset($_POST['name']) && is_string($_POST['name']) ? trim($_POST['name']) : '';
        [$sceneData, $folder] = createFolder($sceneData, $name);
        if (!saveScenesData($sceneData)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Unable to save folder.']);
            exit;
        }

        $changeEntry = recordFolderChange($folder, 'created');

        $scenes = flattenScenes($sceneData);
        $sceneLookup = [];
        foreach ($scenes as $scene) {
            if (!is_array($scene) || !isset($scene['id'])) {
                continue;
            }
            $sceneLookup[$scene['id']] = $scene;
        }
        $activeSceneId = loadActiveSceneId($sceneStateFile, $defaultSceneId, $sceneLookup);

        echo json_encode([
            'success' => true,
            'folder' => $folder,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'latest_change_id' => $changeEntry['id'] ?? getLatestChangeId(),
        ]);
        exit;

    case 'create_scene':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        $folderId = isset($_POST['folder_id']) && is_string($_POST['folder_id']) ? trim($_POST['folder_id']) : null;
        if ($folderId === '') {
            $folderId = null;
        }

        $name = isset($_POST['name']) && is_string($_POST['name']) ? trim($_POST['name']) : null;

        [$sceneData, $scene] = createScene($sceneData, $folderId, $name);
        if (!saveScenesData($sceneData)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Unable to save scene.']);
            exit;
        }

        $changeEntry = recordSceneChange($scene, 'created');

        $defaultSceneId = getFirstSceneId($sceneData);
        $scenes = flattenScenes($sceneData);
        $sceneLookup = [];
        foreach ($scenes as $item) {
            if (!is_array($item) || !isset($item['id'])) {
                continue;
            }
            $sceneLookup[$item['id']] = $item;
        }

        $activeSceneId = loadActiveSceneId($sceneStateFile, $defaultSceneId, $sceneLookup);
        if ($activeSceneId === null) {
            $firstSceneId = getFirstSceneId($sceneData);
            if ($firstSceneId !== null) {
                saveActiveSceneId($sceneStateFile, $firstSceneId);
                $activeSceneId = $firstSceneId;
            }
        }

        echo json_encode([
            'success' => true,
            'scene' => $scene,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'latest_change_id' => $changeEntry['id'] ?? getLatestChangeId(),
        ]);
        exit;

    case 'rename_scene':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        $sceneId = isset($_POST['scene_id']) && is_string($_POST['scene_id']) ? trim($_POST['scene_id']) : '';
        $name = isset($_POST['name']) && is_string($_POST['name']) ? trim($_POST['name']) : '';
        if ($sceneId === '' || $name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'A scene identifier and name are required.']);
            exit;
        }

        [$sceneData, $renamedScene] = renameScene($sceneData, $sceneId, $name);
        if ($renamedScene === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Scene not found.']);
            exit;
        }

        if (!saveScenesData($sceneData)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Unable to rename scene.']);
            exit;
        }

        $changeEntry = recordSceneChange($renamedScene, 'updated');

        $defaultSceneId = getFirstSceneId($sceneData);
        $scenes = flattenScenes($sceneData);
        $sceneLookup = [];
        foreach ($scenes as $item) {
            if (!is_array($item) || !isset($item['id'])) {
                continue;
            }
            $sceneLookup[$item['id']] = $item;
        }

        $activeSceneId = loadActiveSceneId($sceneStateFile, $defaultSceneId, $sceneLookup);

        echo json_encode([
            'success' => true,
            'scene' => $renamedScene,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'latest_change_id' => $changeEntry['id'] ?? getLatestChangeId(),
        ]);
        exit;

    case 'delete_scene':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        $sceneId = isset($_POST['scene_id']) && is_string($_POST['scene_id']) ? trim($_POST['scene_id']) : '';
        if ($sceneId === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid scene identifier.']);
            exit;
        }

        [$sceneData, $removed] = deleteScene($sceneData, $sceneId);
        if ($removed === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Scene not found.']);
            exit;
        }

        if (!saveScenesData($sceneData)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Unable to remove scene.']);
            exit;
        }

        $changeEntry = recordSceneDeletion($removed);

        $defaultSceneId = getFirstSceneId($sceneData);
        $scenes = flattenScenes($sceneData);
        $sceneLookup = [];
        foreach ($scenes as $item) {
            if (!is_array($item) || !isset($item['id'])) {
                continue;
            }
            $sceneLookup[$item['id']] = $item;
        }

        $activeSceneId = loadActiveSceneId($sceneStateFile, $defaultSceneId, $sceneLookup);
        if ($activeSceneId === $sceneId) {
            $newSceneId = getFirstSceneId($sceneData);
            if ($newSceneId !== null) {
                saveActiveSceneId($sceneStateFile, $newSceneId);
                $activeSceneId = $newSceneId;
            } else {
                saveActiveSceneId($sceneStateFile, '');
                $activeSceneId = null;
            }
        }

        echo json_encode([
            'success' => true,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'latest_change_id' => $changeEntry['id'] ?? getLatestChangeId(),
        ]);
        exit;

    case 'update_scene_map':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage scenes.']);
            exit;
        }

        $sceneId = isset($_POST['scene_id']) && is_string($_POST['scene_id']) ? trim($_POST['scene_id']) : '';
        if ($sceneId === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid scene identifier.']);
            exit;
        }

        $gridScale = null;
        if (isset($_POST['grid_scale'])) {
            $gridScale = filter_var($_POST['grid_scale'], FILTER_VALIDATE_INT);
            if ($gridScale === false) {
                $gridScale = null;
            }
        }

        $imagePath = null;
        if (!empty($_FILES['map_image']) && is_array($_FILES['map_image'])) {
            $file = $_FILES['map_image'];
            if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Unable to process uploaded image.']);
                exit;
            }

            $originalName = $file['name'] ?? '';
            $extension = sanitizeFileExtension($originalName);
            if ($extension === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Unsupported image format.']);
                exit;
            }

            ensureMapUploadDirectory();
            try {
                $random = bin2hex(random_bytes(4));
            } catch (Throwable $exception) {
                $random = uniqid();
            }
            $filename = sprintf('scene-%s-%s.%s', $sceneId, $random, $extension);
            $destination = VTT_MAP_UPLOAD_DIR . '/' . $filename;
            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Failed to store uploaded image.']);
                exit;
            }

            $imagePath = buildMapImagePath($filename);
        }

        [$sceneData, $updatedScene] = updateSceneMap($sceneData, $sceneId, $imagePath, $gridScale);
        if ($updatedScene === null) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Scene not found.']);
            exit;
        }

        if (!saveScenesData($sceneData)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Unable to update scene map.']);
            exit;
        }

        $changeEntry = recordSceneChange($updatedScene, 'updated');

        $defaultSceneId = getFirstSceneId($sceneData);
        $scenes = flattenScenes($sceneData);
        $sceneLookup = [];
        foreach ($scenes as $item) {
            if (!is_array($item) || !isset($item['id'])) {
                continue;
            }
            $sceneLookup[$item['id']] = $item;
        }

        $activeSceneId = loadActiveSceneId($sceneStateFile, $defaultSceneId, $sceneLookup);

        echo json_encode([
            'success' => true,
            'scene' => $updatedScene,
            'sceneData' => $sceneData,
            'scenes' => array_values($scenes),
            'active_scene_id' => $activeSceneId,
            'latest_change_id' => $changeEntry['id'] ?? getLatestChangeId(),
        ]);
        exit;

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

        $activeScene = $sceneLookup[$sceneId];
        $changeEntry = recordActiveSceneChange($activeScene);

        echo json_encode([
            'success' => true,
            'active_scene_id' => $sceneId,
            'scene' => $activeScene,
            'latest_change_id' => $changeEntry['id'] ?? getLatestChangeId(),
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
            'latest_change_id' => getLatestChangeId(),
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

function buildSceneStateResponse($sceneData, $scenes, $sceneLookup, $stateFile, $defaultSceneId)
{
    $activeSceneId = loadActiveSceneId($stateFile, $defaultSceneId, $sceneLookup);

    return [
        'success' => true,
        'sceneData' => $sceneData,
        'scenes' => array_values($scenes),
        'active_scene_id' => $activeSceneId,
        'latest_change_id' => getLatestChangeId(),
    ];
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
        if ($sceneId === '') {
            return null;
        }
        if (isset($sceneLookup[$sceneId])) {
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
