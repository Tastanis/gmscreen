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

require_once __DIR__ . '/token_repository.php';

$user = isset($_SESSION['user']) ? (string) $_SESSION['user'] : '';
$isGm = strtolower($user) === 'gm';

$action = $_GET['action'] ?? $_POST['action'] ?? 'library';
$action = is_string($action) ? strtolower(trim($action)) : 'library';

switch ($action) {
    case 'library':
        $tokens = loadTokenLibrary();
        if (!$isGm) {
            $tokens = filterTokensForPlayers($tokens);
        }

        echo json_encode([
            'success' => true,
            'tokens' => $tokens,
            'latest_change_id' => 0,
        ]);
        exit;

    case 'scene_tokens':
        $sceneId = '';
        if (isset($_GET['scene_id'])) {
            $sceneId = (string) $_GET['scene_id'];
        }
        if ($sceneId === '' && isset($_POST['scene_id'])) {
            $sceneId = (string) $_POST['scene_id'];
        }
        if ($sceneId === '') {
            $rawInput = file_get_contents('php://input');
            if (is_string($rawInput) && $rawInput !== '') {
                $decoded = json_decode($rawInput, true);
                if (is_array($decoded) && isset($decoded['sceneId'])) {
                    $sceneId = (string) $decoded['sceneId'];
                }
            }
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
            'latest_change_id' => 0,
        ]);
        exit;

    default:
        http_response_code(410);
        echo json_encode([
            'success' => false,
            'error' => 'Token persistence APIs are no longer available.',
        ]);
        exit;
}

