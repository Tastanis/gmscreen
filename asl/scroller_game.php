<?php
session_start();
require_once 'config.php';

// When called with action=data, return JSON with active session details
if (isset($_GET['action']) && $_GET['action'] === 'data') {
    header('Content-Type: application/json');

    try {
        // Fetch the active session
        $stmt = $pdo->query("SELECT id, seed, speed, word_count FROM scroller_sessions WHERE is_active = 1 LIMIT 1");
        $session = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;

        if ($session) {
            // Get all words associated with this session's word lists
            $wordStmt = $pdo->prepare("SELECT w.word FROM scroller_session_words sw JOIN scroller_words w ON sw.word_id = w.id WHERE sw.session_id = ?");
            $wordStmt->execute([$session['id']]);
            $words = $wordStmt->fetchAll(PDO::FETCH_COLUMN);
        } else {
            $words = [];
            $session = ['seed' => time(), 'speed' => 1.0, 'word_count' => 10];
        }

        echo json_encode([
            'seed' => (int)$session['seed'],
            'speed' => (float)$session['speed'],
            'wordCount' => (int)$session['word_count'],
            'words' => $words
        ]);
    } catch (Exception $e) {
        echo json_encode([
            'seed' => 1,
            'speed' => 1.0,
            'wordCount' => 0,
            'words' => [],
            'error' => $e->getMessage()
        ]);
    }
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Scroller Game</title>
    <style>
        body { margin:0; overflow:hidden; background:#000; color:#fff; font-family:Arial, sans-serif; }
        #scroller-container { position:relative; width:100%; height:100vh; overflow:hidden; }
        .scroller-word { position:absolute; left:50%; transform:translateX(-50%); bottom:-10%; font-size:2.5rem; white-space:nowrap; }
        .scroller-word.rise { animation-name:rise; animation-timing-function:linear; animation-fill-mode:forwards; }
        @keyframes rise { from { bottom:-10%; } to { bottom:100%; } }
        .scroller-word.blink { animation:blinkFade 1s forwards; }
        @keyframes blinkFade {
            0% { opacity:1; }
            25% { opacity:0; }
            50% { opacity:1; }
            75% { opacity:0; }
            100% { opacity:0; }
        }
    </style>
</head>
<body>
    <div id="scroller-container"></div>
    <script src="js/scroller.js"></script>
</body>
</html>
