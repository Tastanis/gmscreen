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

require_once __DIR__ . '/token_repository.php';

$user = $_SESSION['user'] ?? '';
$isGm = strtolower((string) $user) === 'gm';

$action = $_REQUEST['action'] ?? '';
$action = is_string($action) ? strtolower(trim($action)) : '';
if ($action === '') {
    $action = $_SERVER['REQUEST_METHOD'] === 'POST' ? 'save_library' : 'library';
}

switch ($action) {
    case 'library':
    case 'get_library':
        handleGetLibrary();
        break;

    case 'save_library':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can modify the token library.']);
            exit;
        }
        handleSaveLibrary();
        break;

    case 'scene_tokens':
    case 'get_scene_tokens':
        handleGetSceneTokens();
        break;

    case 'save_scene_tokens':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can update scene tokens.']);
            exit;
        }
        handleSaveSceneTokens();
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Unsupported action.']);
        break;
}

function handleGetLibrary(): void
{
    $tokens = loadTokenLibrary();
    echo json_encode([
        'success' => true,
        'tokens' => $tokens,
        'latest_change_id' => getLatestChangeId(),
    ]);
}

function handleSaveLibrary(): void
{
    $payload = readJsonPayload();
    $tokens = $payload['tokens'] ?? null;
    if (!is_array($tokens)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A token list is required.']);
        return;
    }

    $saved = saveTokenLibrary($tokens);
    if ($saved === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Unable to save the token library.']);
        return;
    }

    echo json_encode([
        'success' => true,
        'tokens' => $saved,
        'latest_change_id' => getLatestChangeId(),
    ]);
}

function handleGetSceneTokens(): void
{
    $sceneId = isset($_REQUEST['scene_id']) && is_string($_REQUEST['scene_id'])
        ? trim($_REQUEST['scene_id'])
        : '';
    if ($sceneId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A scene identifier is required.']);
        return;
    }

    $tokens = loadSceneTokensByScene($sceneId);
    echo json_encode([
        'success' => true,
        'scene_id' => $sceneId,
        'tokens' => $tokens,
        'latest_change_id' => getLatestChangeId(),
    ]);
}

function handleSaveSceneTokens(): void
{
    $payload = readJsonPayload();
    $sceneId = isset($payload['sceneId']) && is_string($payload['sceneId'])
        ? trim($payload['sceneId'])
        : '';
    if ($sceneId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A scene identifier is required.']);
        return;
    }

    $tokens = $payload['tokens'] ?? null;
    if (!is_array($tokens)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A list of tokens is required.']);
        return;
    }

    $saved = saveSceneTokensByScene($sceneId, $tokens);
    if ($saved === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Unable to save scene tokens.']);
        return;
    }

    echo json_encode([
        'success' => true,
        'scene_id' => $sceneId,
        'tokens' => $saved,
        'latest_change_id' => getLatestChangeId(),
    ]);
}

function readJsonPayload(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return $decoded;
}
