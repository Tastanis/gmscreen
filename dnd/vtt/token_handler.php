<?php

declare(strict_types=1);

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
require_once __DIR__ . '/scenes_repository.php';

$user = $_SESSION['user'] ?? '';
$isGm = strtolower((string) $user) === 'gm';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestData = [];

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (is_string($rawInput) && $rawInput !== '') {
        $decoded = json_decode($rawInput, true);
        if (is_array($decoded)) {
            $requestData = $decoded;
        }
    }
}

$action = $_GET['action'] ?? $_POST['action'] ?? $requestData['action'] ?? 'library';
$action = is_string($action) ? strtolower(trim($action)) : 'library';

switch ($action) {
    case 'library':
        handleLibraryRequest($isGm);
        break;

    case 'save_library':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can manage the token library.']);
            exit;
        }
        handleSaveLibraryRequest($requestData);
        break;

    case 'scene_tokens':
        handleSceneTokensRequest($requestData);
        break;

    case 'save_scene_tokens':
        if (!$isGm) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the GM can update scene tokens.']);
            exit;
        }
        handleSaveSceneTokensRequest($requestData);
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Unknown token action.']);
        exit;
}

function handleLibraryRequest(bool $isGm): void
{
    $tokens = loadTokenLibrary();
    if (!$isGm) {
        $tokens = filterTokensForPlayers($tokens);
    }

    echo json_encode([
        'success' => true,
        'tokens' => $tokens,
        'latest_change_id' => getLatestSceneChangeId(),
    ]);
    exit;
}

function handleSaveLibraryRequest(array $requestData): void
{
    $entries = [];
    if (isset($requestData['tokens']) && is_array($requestData['tokens'])) {
        $entries = $requestData['tokens'];
    }

    $tokens = normalizeTokenLibraryEntries($entries);
    if (!saveTokenLibrary($tokens)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Unable to save the token library.']);
        exit;
    }

    $changeId = recordSceneChange('token_library', null, [
        'action' => 'save_library',
        'token_count' => count($tokens),
    ]);

    echo json_encode([
        'success' => true,
        'tokens' => $tokens,
        'latest_change_id' => $changeId ?? getLatestSceneChangeId(),
    ]);
    exit;
}

function handleSceneTokensRequest(array $requestData): void
{
    $sceneId = '';
    if (isset($_GET['scene_id'])) {
        $sceneId = (string) $_GET['scene_id'];
    } elseif (isset($requestData['sceneId'])) {
        $sceneId = (string) $requestData['sceneId'];
    }

    $sceneId = trim($sceneId);
    if ($sceneId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing scene identifier.']);
        exit;
    }

    $tokens = loadSceneTokens($sceneId);

    echo json_encode([
        'success' => true,
        'tokens' => $tokens,
        'latest_change_id' => getLatestSceneChangeId(),
    ]);
    exit;
}

function handleSaveSceneTokensRequest(array $requestData): void
{
    $sceneId = isset($requestData['sceneId']) ? trim((string) $requestData['sceneId']) : '';
    if ($sceneId === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing scene identifier.']);
        exit;
    }

    $entries = [];
    if (isset($requestData['tokens']) && is_array($requestData['tokens'])) {
        $entries = $requestData['tokens'];
    }

    $tokens = normalizeSceneTokenEntries($entries);
    if (!saveSceneTokens($sceneId, $tokens)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Unable to save scene tokens.']);
        exit;
    }

    $changeId = recordSceneChange('scene_tokens', $sceneId, [
        'action' => 'save_scene_tokens',
        'sceneId' => $sceneId,
        'token_count' => count($tokens),
    ]);

    echo json_encode([
        'success' => true,
        'tokens' => $tokens,
        'latest_change_id' => $changeId ?? getLatestSceneChangeId(),
    ]);
    exit;
}
