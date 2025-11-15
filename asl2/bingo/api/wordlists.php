<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../lib/custom_lists.php';

header('Content-Type: application/json');

try {
    if (!isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Teacher access required.']);
        exit;
    }

    $teacherId = (int) $_SESSION['user_id'];

    $stmt = $pdo->prepare('SELECT id, name, words, asl_level, created_at FROM scroller_wordlists WHERE teacher_id = ? ORDER BY created_at DESC');
    $stmt->execute([$teacherId]);
    $scrollerLists = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $wordCandidates = json_decode($row['words'], true);
        if (!is_array($wordCandidates)) {
            $wordCandidates = preg_split('/[,\r\n]+/', (string) $row['words']);
        }
        $words = bingo_filter_words($wordCandidates);
        $scrollerLists[] = [
            'id' => 'scroller:' . $row['id'],
            'sourceId' => (int) $row['id'],
            'name' => $row['name'],
            'words' => $words,
            'aslLevel' => (int) ($row['asl_level'] ?? 2),
            'created_at' => $row['created_at'] ?? null,
        ];
    }

    $customLists = [];
    foreach (bingo_load_custom_lists() as $entry) {
        if ((int) ($entry['teacher_id'] ?? 0) !== $teacherId) {
            continue;
        }
        $customLists[] = [
            'id' => $entry['id'],
            'name' => $entry['name'] ?? 'Custom List',
            'words' => $entry['words'] ?? [],
            'created_at' => $entry['created_at'] ?? null,
        ];
    }

    echo json_encode([
        'success' => true,
        'scroller' => $scrollerLists,
        'custom' => $customLists,
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Unable to load word lists.',
        'details' => $exception->getMessage(),
    ]);
}
