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

/** @var array{
 *     tokenLibrary?: array,
 *     sceneTokens?: array,
 *     latestChangeId?: int
 * } $staticContent
 */
$staticContent = require __DIR__ . '/static_content.php';

$tokenLibrary = [];
if (isset($staticContent['tokenLibrary']) && is_array($staticContent['tokenLibrary'])) {
    $tokenLibrary = array_values(array_filter($staticContent['tokenLibrary'], 'is_array'));
}

$sceneTokens = [];
if (isset($staticContent['sceneTokens']) && is_array($staticContent['sceneTokens'])) {
    $sceneTokens = $staticContent['sceneTokens'];
}

$latestChangeId = isset($staticContent['latestChangeId']) ? (int) $staticContent['latestChangeId'] : 0;

$user = $_SESSION['user'] ?? '';
$isGm = strtolower((string) $user) === 'gm';

$action = $_GET['action'] ?? $_POST['action'] ?? 'library';
$action = is_string($action) ? strtolower(trim($action)) : 'library';

switch ($action) {
    case 'library':
        $tokens = $tokenLibrary;
        if (!$isGm) {
            $tokens = filterTokensForPlayers($tokens);
        }

        echo json_encode([
            'success' => true,
            'tokens' => $tokens,
            'latest_change_id' => $latestChangeId,
        ]);
        exit;

    case 'scene_tokens':
        $sceneId = '';
        if (isset($_GET['scene_id'])) {
            $sceneId = (string) $_GET['scene_id'];
        } elseif (isset($_POST['scene_id'])) {
            $sceneId = (string) $_POST['scene_id'];
        }
        $sceneId = trim($sceneId);

        if ($sceneId === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing scene identifier.']);
            exit;
        }

        $tokens = [];
        if (isset($sceneTokens[$sceneId]) && is_array($sceneTokens[$sceneId])) {
            $tokens = array_values(array_filter($sceneTokens[$sceneId], 'is_array'));
        }

        echo json_encode([
            'success' => true,
            'tokens' => $tokens,
            'latest_change_id' => $latestChangeId,
        ]);
        exit;

    case 'save_library':
    case 'save_scene_tokens':
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'Token editing is disabled while static demo content is active.',
        ]);
        exit;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Unknown token action.']);
        exit;
}
