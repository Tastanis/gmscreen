<?php
session_start();
require_once 'config.php';

if (!isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
}

if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    header('Location: teacher_dashboard.php');
    exit;
}

$student_name = trim(($_SESSION['user_first_name'] ?? '') . ' ' . ($_SESSION['user_last_name'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Bingo</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="container bingo-container">
        <header>
            <div>
                <h1>ASL Bingo</h1>
                <p class="bingo-subtitle">Stay synced with your teacher and mark the words as they are called.</p>
            </div>
            <div class="user-info">
                <span><?php echo htmlspecialchars($student_name); ?></span>
                <a href="dashboard.php" class="back-btn">Back to Dashboard</a>
                <a href="logout.php" class="logout-btn">Logout</a>
            </div>
        </header>

        <div id="bingo-status" class="bingo-status" data-state="loading" aria-live="polite">
            Connecting to your teacher's session...
        </div>

        <div class="bingo-layout">
            <section class="bingo-card-panel">
                <div class="panel-header">
                    <h2>Your Card</h2>
                    <span class="panel-subtext">Tap each word as you see it signed.</span>
                </div>
                <div id="bingo-board" class="bingo-board" role="grid" aria-label="Bingo card"></div>
                <button id="call-bingo-button" class="bingo-call-btn" type="button" disabled>Call Bingo</button>
                <p class="bingo-hint">The button unlocks automatically once you have a full row, column, or diagonal marked.</p>
            </section>

            <section class="bingo-called-panel">
                <div class="panel-header">
                    <h2>Called Words</h2>
                    <span class="panel-subtext">Updates automatically every few seconds.</span>
                </div>
                <div id="called-words-list" class="called-words-list" aria-live="polite"></div>
            </section>
        </div>

        <div id="bingo-feedback" class="bingo-feedback" aria-live="polite"></div>
    </div>

    <div id="bingo-review-overlay" class="bingo-review-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="bingo-review-title">
        <div class="bingo-review-content">
            <div class="overlay-header">
                <h3 id="bingo-review-title">Bingo Claim Review</h3>
                <button type="button" class="overlay-close" id="close-review-overlay" aria-label="Close review">&times;</button>
            </div>
            <p id="bingo-review-message" class="overlay-message"></p>
            <div class="overlay-columns">
                <div>
                    <h4>Called & Marked</h4>
                    <ul id="bingo-review-matched" class="overlay-list"></ul>
                </div>
                <div>
                    <h4>Marked but Not Called</h4>
                    <ul id="bingo-review-unmatched" class="overlay-list"></ul>
                </div>
            </div>
        </div>
    </div>

    <script>
        window.bingoStudentConfig = {
            pollInterval: 5000,
            level: 2,
            studentStateEndpoint: 'bingo/api/student-state.php',
            updateCardEndpoint: 'bingo/api/update-card.php',
            requestBingoEndpoint: 'bingo/api/request-bingo.php'
        };
    </script>
    <script src="js/bingo-student.js" defer></script>
</body>
</html>
