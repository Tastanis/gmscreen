<?php
session_start();
require_once 'config.php';

// Ensure only logged-in teachers can access
if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$action = $_POST['action'] ?? '';

try {
    switch ($action) {
        case 'get_wordlists':
            $stmt = $pdo->query("SELECT w.id, w.wordlist_name, w.default_speed, w.default_word_count, w.is_active, COUNT(ww.id) AS word_total FROM wordlists w LEFT JOIN wordlist_words ww ON w.id = ww.wordlist_id GROUP BY w.id ORDER BY w.id DESC");
            $wordlists = $stmt->fetchAll();
            echo json_encode(['success' => true, 'wordlists' => $wordlists]);
            break;

        case 'get_wordlist':
            $wordlist_id = intval($_POST['wordlist_id'] ?? 0);
            if ($wordlist_id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid word list ID']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT id, wordlist_name, default_speed, default_word_count, is_active FROM wordlists WHERE id = ?");
            $stmt->execute([$wordlist_id]);
            $wordlist = $stmt->fetch();
            if (!$wordlist) {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Word list not found']);
                exit;
            }
            $stmt = $pdo->prepare("SELECT word FROM wordlist_words WHERE wordlist_id = ? ORDER BY order_index");
            $stmt->execute([$wordlist_id]);
            $words = array_column($stmt->fetchAll(), 'word');
            echo json_encode(['success' => true, 'wordlist' => $wordlist, 'words' => $words]);
            break;

        case 'create_wordlist':
            $name = trim($_POST['wordlist_name'] ?? '');
            $words_raw = trim($_POST['words'] ?? '');
            $speed = floatval($_POST['speed'] ?? 1.0);
            $word_count = intval($_POST['word_count'] ?? 24);

            if ($name === '' || $words_raw === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Name and words are required']);
                exit;
            }

            $stmt = $pdo->prepare("INSERT INTO wordlists (wordlist_name, default_speed, default_word_count) VALUES (?, ?, ?)");
            $stmt->execute([$name, $speed, $word_count]);
            $wordlist_id = $pdo->lastInsertId();

            $words = preg_split('/[\r\n,]+/', $words_raw);
            $stmt_word = $pdo->prepare("INSERT INTO wordlist_words (wordlist_id, word, order_index) VALUES (?, ?, ?)");
            $order = 1;
            foreach ($words as $word) {
                $w = trim($word);
                if ($w === '') continue;
                $stmt_word->execute([$wordlist_id, $w, $order++]);
            }

            echo json_encode(['success' => true, 'message' => 'Word list created', 'wordlist_id' => $wordlist_id]);
            break;

        case 'update_wordlist':
            $wordlist_id = intval($_POST['wordlist_id'] ?? 0);
            $name = trim($_POST['wordlist_name'] ?? '');
            $words_raw = trim($_POST['words'] ?? '');
            $speed = floatval($_POST['speed'] ?? 1.0);
            $word_count = intval($_POST['word_count'] ?? 24);

            if ($wordlist_id <= 0 || $name === '' || $words_raw === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid data']);
                exit;
            }

            $stmt = $pdo->prepare("UPDATE wordlists SET wordlist_name = ?, default_speed = ?, default_word_count = ? WHERE id = ?");
            $stmt->execute([$name, $speed, $word_count, $wordlist_id]);

            $pdo->prepare("DELETE FROM wordlist_words WHERE wordlist_id = ?")->execute([$wordlist_id]);
            $words = preg_split('/[\r\n,]+/', $words_raw);
            $stmt_word = $pdo->prepare("INSERT INTO wordlist_words (wordlist_id, word, order_index) VALUES (?, ?, ?)");
            $order = 1;
            foreach ($words as $word) {
                $w = trim($word);
                if ($w === '') continue;
                $stmt_word->execute([$wordlist_id, $w, $order++]);
            }

            echo json_encode(['success' => true, 'message' => 'Word list updated']);
            break;

        case 'delete_wordlist':
            $wordlist_id = intval($_POST['wordlist_id'] ?? 0);
            if ($wordlist_id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid word list ID']);
                exit;
            }
            $stmt = $pdo->prepare("DELETE FROM wordlists WHERE id = ?");
            $stmt->execute([$wordlist_id]);
            echo json_encode(['success' => true, 'message' => 'Word list deleted']);
            break;

        case 'set_active':
            $wordlist_id = intval($_POST['wordlist_id'] ?? 0);
            $is_active = intval($_POST['is_active'] ?? 0) ? 1 : 0;
            if ($wordlist_id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Invalid word list ID']);
                exit;
            }
            if ($is_active) {
                // Only one active at a time
                $pdo->exec("UPDATE wordlists SET is_active = 0");
            }
            $stmt = $pdo->prepare("UPDATE wordlists SET is_active = ? WHERE id = ?");
            $stmt->execute([$is_active, $wordlist_id]);
            echo json_encode(['success' => true, 'message' => 'Word list status updated']);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
            break;
    }
} catch (PDOException $e) {
    error_log('Database error in wordlists.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error']);
}
?>
