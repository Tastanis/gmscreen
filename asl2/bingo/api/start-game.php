<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('BINGO_LEVEL', 2);

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../lib/custom_lists.php';
require_once __DIR__ . '/../../../common/bingo/api/helpers.php';

header('Content-Type: application/json');

try {
    if (!isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Teacher access required.']);
        exit;
    }

    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    $action = $payload['action'] ?? 'start';

    if ($action === 'stop') {
        $state = bingo_api_default_global_state();
        bingo_api_save_global_state(BINGO_LEVEL, $state);
        echo json_encode(['success' => true, 'session' => $state]);
        return;
    }

    $lists = $payload['lists'] ?? [];
    if (!is_array($lists) || count($lists) === 0) {
        throw new InvalidArgumentException('Select at least one word list.');
    }

    $scrollerIds = [];
    $customIds = [];
    foreach ($lists as $listRef) {
        if (!is_string($listRef)) {
            continue;
        }
        if (strpos($listRef, 'scroller:') === 0) {
            $scrollerIds[] = (int) substr($listRef, 9);
        } elseif (strpos($listRef, 'custom-') === 0) {
            $customIds[] = $listRef;
        }
    }

    $wordPool = [];
    $activeLists = [];
    if ($scrollerIds) {
        $placeholders = implode(',', array_fill(0, count($scrollerIds), '?'));
        $sql = "SELECT id, name, words FROM scroller_wordlists WHERE teacher_id = ? AND id IN ($placeholders)";
        $params = array_merge([(int) $_SESSION['user_id']], $scrollerIds);
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $words = json_decode($row['words'], true);
            if (!is_array($words)) {
                $words = preg_split('/[,\r\n]+/', (string) $row['words']);
            }
            $filtered = bingo_filter_words($words);
            $wordPool = array_merge($wordPool, $filtered);
            $activeLists[] = [
                'id' => 'scroller:' . $row['id'],
                'name' => $row['name'],
                'count' => count($filtered),
            ];
        }
    }

    if ($customIds) {
        foreach ($customIds as $customId) {
            $entry = bingo_find_custom_list($customId, (int) $_SESSION['user_id']);
            if (!$entry) {
                continue;
            }
            $filtered = bingo_filter_words($entry['words'] ?? []);
            $wordPool = array_merge($wordPool, $filtered);
            $activeLists[] = [
                'id' => $entry['id'],
                'name' => $entry['name'] ?? 'Custom List',
                'count' => count($filtered),
            ];
        }
    }

    $wordPool = array_values(array_unique(array_filter(array_map('trim', $wordPool))));
    if (count($wordPool) < 5) {
        throw new InvalidArgumentException('Each session requires at least five unique words.');
    }

    shuffle($wordPool);

    $state = bingo_api_load_global_state(BINGO_LEVEL);
    $state['status'] = 'ready';
    $state['sessionId'] = 'session_' . time() . '_' . bin2hex(random_bytes(3));
    $state['activeLists'] = $activeLists;
    $state['wordPool'] = $wordPool;
    $state['remainingWords'] = $wordPool;
    $state['calledWords'] = [];
    $state['claims'] = [];
    $state['players'] = [];
    $state['lastDrawnWord'] = null;
    $state['gameStartedAt'] = time();

    bingo_api_save_global_state(BINGO_LEVEL, $state);

    echo json_encode([
        'success' => true,
        'session' => $state,
    ]);
} catch (InvalidArgumentException $exception) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => $exception->getMessage(),
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to start bingo session.',
        'details' => $exception->getMessage(),
    ]);
}
