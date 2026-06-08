<?php
/**
 * Shared player destination and path overlay for the Strixhaven map.
 *
 * This intentionally uses a separate data file from hex-data-handler.php so
 * clearing player planning marks cannot erase normal map content.
 */

session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit;
}

$user = $_SESSION['user'] ?? 'unknown';
$isGM = ($user === 'GM');
$sessionId = session_id();
$dataFile = __DIR__ . '/../data/player-path-overlay.json';
$lockFile = __DIR__ . '/../data/player-path-overlay.lock';

if (!is_dir(dirname($dataFile))) {
    mkdir(dirname($dataFile), 0755, true);
}

define('MAX_HISTORY', 10);
define('DRAW_LOCK_TIMEOUT_MS', 120000);

function defaultOverlayData() {
    return [
        'version' => 1,
        'markers' => [],
        'path' => [
            'sections' => [],
            'updatedBy' => '',
            'updatedAt' => 0
        ],
        'drawLock' => null,
        'terrain' => [],
        'history' => []
    ];
}

function nowMs() {
    return round(microtime(true) * 1000);
}

function sendSuccess($data = null) {
    $response = ['success' => true];
    if ($data !== null) {
        $response['data'] = $data;
    }
    echo json_encode($response);
    exit;
}

function sendError($code, $message) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function loadOverlayData($dataFile) {
    if (!file_exists($dataFile)) {
        return defaultOverlayData();
    }

    $content = file_get_contents($dataFile);
    if (!$content) {
        return defaultOverlayData();
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded)) {
        return defaultOverlayData();
    }

    $data = array_replace_recursive(defaultOverlayData(), $decoded);
    if (!is_array($data['markers'])) {
        $data['markers'] = [];
    }
    if (!is_array($data['path']['sections'])) {
        $data['path']['sections'] = [];
    }
    if (!is_array($data['history'])) {
        $data['history'] = [];
    }
    if (!is_array($data['terrain'])) {
        $data['terrain'] = [];
    }
    return $data;
}

function cleanExpiredLock(&$data) {
    if (!$data['drawLock']) {
        return;
    }

    $expiresAt = intval($data['drawLock']['expiresAt'] ?? 0);
    if ($expiresAt <= nowMs()) {
        $data['drawLock'] = null;
    }
}

function publicState($data) {
    cleanExpiredLock($data);
    return [
        'markers' => $data['markers'],
        'path' => $data['path'],
        'drawLock' => $data['drawLock'],
        'terrain' => $data['terrain'],
        'canUndo' => count($data['history']) > 0,
        'serverTime' => nowMs()
    ];
}

function withOverlayLock($callback) {
    global $dataFile, $lockFile;

    $lockFp = fopen($lockFile, 'c');
    if (!$lockFp) {
        sendError(500, 'Could not open overlay lock');
    }

    if (!flock($lockFp, LOCK_EX)) {
        fclose($lockFp);
        sendError(500, 'Could not acquire overlay lock');
    }

    try {
        $data = loadOverlayData($dataFile);
        cleanExpiredLock($data);
        $result = $callback($data);

        file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);

        flock($lockFp, LOCK_UN);
        fclose($lockFp);
        return $result;
    } catch (Exception $e) {
        flock($lockFp, LOCK_UN);
        fclose($lockFp);
        sendError(500, $e->getMessage());
    }
}

function pushHistory(&$data) {
    $data['history'][] = [
        'markers' => $data['markers'],
        'path' => $data['path'],
        'drawLock' => $data['drawLock'],
        'terrain' => $data['terrain'],
        'createdAt' => nowMs()
    ];

    if (count($data['history']) > MAX_HISTORY) {
        $data['history'] = array_slice($data['history'], -MAX_HISTORY);
    }
}

function normalizeHex($hex) {
    if (!is_array($hex) || !isset($hex['q']) || !isset($hex['r'])) {
        return null;
    }

    return [
        'q' => intval($hex['q']),
        'r' => intval($hex['r'])
    ];
}

function normalizeRoute($route) {
    if (!is_array($route)) {
        return [];
    }

    $normalized = [];
    $seenLast = null;
    foreach ($route as $hex) {
        $clean = normalizeHex($hex);
        if (!$clean) {
            continue;
        }
        $key = $clean['q'] . ',' . $clean['r'];
        if ($key === $seenLast) {
            continue;
        }
        $normalized[] = $clean;
        $seenLast = $key;
    }
    return $normalized;
}

function currentUserHasDrawLock($data) {
    global $user, $sessionId;

    if (!$data['drawLock']) {
        return false;
    }

    return ($data['drawLock']['user'] ?? '') === $user
        && ($data['drawLock']['sessionId'] ?? '') === $sessionId;
}

function touchPath(&$data) {
    global $user;

    $data['path']['updatedBy'] = $user;
    $data['path']['updatedAt'] = nowMs();
}

function normalizeDifficulty($difficulty) {
    $difficulty = strtolower(trim((string)$difficulty));
    $allowed = ['normal', 'fast', 'yellow', 'red'];
    if (!in_array($difficulty, $allowed, true)) {
        return null;
    }
    return $difficulty;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'get_state';
    if ($action !== 'get_state') {
        sendError(400, 'Invalid action');
    }

    $data = withOverlayLock(function (&$data) {
        return publicState($data);
    });
    sendSuccess($data);
}

if ($method !== 'POST') {
    sendError(405, 'Method not allowed');
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$action = $input['action'] ?? '';

$result = withOverlayLock(function (&$data) use ($action, $input, $user, $isGM, $sessionId) {
    switch ($action) {
        case 'save_marker': {
            $q = intval($input['q'] ?? 0);
            $r = intval($input['r'] ?? 0);
            $note = trim((string)($input['note'] ?? ''));
            $key = "$q,$r";
            pushHistory($data);

            if ($note === '') {
                unset($data['markers'][$key]);
            } else {
                $data['markers'][$key] = [
                    'q' => $q,
                    'r' => $r,
                    'note' => $note,
                    'updatedBy' => $user,
                    'updatedAt' => nowMs()
                ];
            }
            return publicState($data);
        }

        case 'delete_marker': {
            $q = intval($input['q'] ?? 0);
            $r = intval($input['r'] ?? 0);
            $key = "$q,$r";
            pushHistory($data);
            unset($data['markers'][$key]);
            return publicState($data);
        }

        case 'clear_all':
            pushHistory($data);
            $data['markers'] = [];
            $data['path'] = [
                'sections' => [],
                'updatedBy' => $user,
                'updatedAt' => nowMs()
            ];
            $data['drawLock'] = null;
            return publicState($data);

        case 'undo':
            if (count($data['history']) === 0) {
                return publicState($data);
            }
            $previous = array_pop($data['history']);
            $data['markers'] = $previous['markers'] ?? [];
            $data['path'] = $previous['path'] ?? ['sections' => [], 'updatedBy' => $user, 'updatedAt' => nowMs()];
            $data['terrain'] = $previous['terrain'] ?? $data['terrain'];
            $data['drawLock'] = null;
            return publicState($data);

        case 'acquire_lock': {
            if ($data['drawLock'] && !currentUserHasDrawLock($data)) {
                throw new Exception('Path drawing is locked by ' . ($data['drawLock']['user'] ?? 'another player'));
            }

            $now = nowMs();
            $data['drawLock'] = [
                'user' => $user,
                'sessionId' => $sessionId,
                'updatedAt' => $now,
                'expiresAt' => $now + DRAW_LOCK_TIMEOUT_MS
            ];
            return publicState($data);
        }

        case 'heartbeat_lock': {
            if (currentUserHasDrawLock($data)) {
                $now = nowMs();
                $data['drawLock']['updatedAt'] = $now;
                $data['drawLock']['expiresAt'] = $now + DRAW_LOCK_TIMEOUT_MS;
            }
            return publicState($data);
        }

        case 'release_lock':
            if (currentUserHasDrawLock($data)) {
                $data['drawLock'] = null;
            }
            return publicState($data);

        case 'save_path': {
            if (!currentUserHasDrawLock($data)) {
                throw new Exception('You do not have the path drawing lock');
            }

            $sectionsInput = $input['sections'] ?? [];
            if (!is_array($sectionsInput)) {
                $sectionsInput = [];
            }

            $sections = [];
            foreach ($sectionsInput as $section) {
                if (!is_array($section)) {
                    continue;
                }
                $route = normalizeRoute($section['route'] ?? []);
                if (count($route) < 1) {
                    continue;
                }
                $sections[] = [
                    'id' => preg_replace('/[^a-zA-Z0-9:_-]/', '', (string)($section['id'] ?? uniqid('section:', true))),
                    'route' => $route,
                    'createdBy' => (string)($section['createdBy'] ?? $user),
                    'createdAt' => intval($section['createdAt'] ?? nowMs())
                ];
            }

            pushHistory($data);
            $data['path']['sections'] = $sections;
            touchPath($data);
            return publicState($data);
        }

        case 'delete_path_segment': {
            if ($data['drawLock'] && !currentUserHasDrawLock($data)) {
                throw new Exception('Path drawing is locked by ' . ($data['drawLock']['user'] ?? 'another player'));
            }

            $sectionId = (string)($input['sectionId'] ?? '');
            $segmentIndex = intval($input['segmentIndex'] ?? -1);
            if ($sectionId === '' || $segmentIndex < 0) {
                throw new Exception('Path segment not specified');
            }

            pushHistory($data);
            $newSections = [];
            foreach ($data['path']['sections'] as $section) {
                if (($section['id'] ?? '') !== $sectionId) {
                    $newSections[] = $section;
                    continue;
                }

                $route = normalizeRoute($section['route'] ?? []);
                if ($segmentIndex >= count($route) - 1) {
                    $newSections[] = $section;
                    continue;
                }

                $before = array_slice($route, 0, $segmentIndex + 1);
                $after = array_slice($route, $segmentIndex + 1);

                if (count($before) > 0) {
                    $newSections[] = [
                        'id' => $section['id'] . ':a:' . nowMs(),
                        'route' => $before,
                        'createdBy' => $section['createdBy'] ?? $user,
                        'createdAt' => $section['createdAt'] ?? nowMs()
                    ];
                }
                if (count($after) > 0) {
                    $newSections[] = [
                        'id' => $section['id'] . ':b:' . nowMs(),
                        'route' => $after,
                        'createdBy' => $section['createdBy'] ?? $user,
                        'createdAt' => $section['createdAt'] ?? nowMs()
                    ];
                }
            }

            $data['path']['sections'] = array_values(array_filter($newSections, function ($section) {
                return count($section['route'] ?? []) > 1;
            }));
            touchPath($data);
            return publicState($data);
        }

        case 'save_terrain_patch': {
            if (!$isGM) {
                throw new Exception('GM access required');
            }

            $cells = $input['cells'] ?? [];
            if (!is_array($cells)) {
                $cells = [];
            }

            foreach ($cells as $cell) {
                if (!is_array($cell)) {
                    continue;
                }
                $hex = normalizeHex($cell);
                $difficulty = normalizeDifficulty($cell['difficulty'] ?? '');
                if (!$hex || !$difficulty) {
                    continue;
                }

                $key = $hex['q'] . ',' . $hex['r'];
                if ($difficulty === 'normal') {
                    unset($data['terrain'][$key]);
                } else {
                    $data['terrain'][$key] = [
                        'q' => $hex['q'],
                        'r' => $hex['r'],
                        'difficulty' => $difficulty,
                        'updatedBy' => $user,
                        'updatedAt' => nowMs()
                    ];
                }
            }

            return publicState($data);
        }

        case 'clear_terrain': {
            if (!$isGM) {
                throw new Exception('GM access required');
            }

            $data['terrain'] = [];
            return publicState($data);
        }

        default:
            throw new Exception('Invalid action');
    }
});

sendSuccess($result);
?>
