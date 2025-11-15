<?php
session_start();
require_once 'config.php';

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    header('Location: index.php');
    exit;
}

$teacherName = htmlspecialchars(($_SESSION['user_first_name'] ?? '') . ' ' . ($_SESSION['user_last_name'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL Hub - Bingo Control Room</title>
    <link rel="stylesheet" href="css/asl-style.css">
    <style>
        .bingo-dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .bingo-panel {
            background: #fff;
            border: 2px solid #e2e8f0;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 5px 15px rgba(15, 23, 42, 0.08);
        }
        .bingo-panel h2 {
            margin-top: 0;
            font-size: 1.25rem;
        }
        .wordlist-collection {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 280px;
            overflow-y: auto;
            padding-right: 6px;
        }
        .wordlist-chip {
            border: 1px solid #cbd5f5;
            border-radius: 10px;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            transition: border-color 0.2s ease;
        }
        .wordlist-chip input {
            margin-right: 10px;
        }
        .wordlist-chip:hover {
            border-color: #7c3aed;
        }
        .bingo-controls {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .bingo-controls button {
            width: 100%;
        }
        .session-meta {
            font-size: 0.95rem;
            color: #4a5568;
        }
        .session-meta div {
            margin-bottom: 4px;
        }
        .history-list, .claims-list {
            max-height: 340px;
            overflow-y: auto;
            padding-right: 6px;
        }
        .claims-list button {
            width: 100%;
            text-align: left;
            margin-bottom: 10px;
        }
        .claim-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            color: #475569;
        }
        .custom-list-form textarea {
            width: 100%;
            min-height: 120px;
            resize: vertical;
        }
        .bingo-review-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999;
        }
        .bingo-review-overlay.hidden {
            display: none;
        }
        .bingo-review-card {
            background: #fff;
            border-radius: 18px;
            padding: 24px;
            width: min(90vw, 960px);
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.3);
        }
        .bingo-review-card h3 {
            margin-top: 0;
        }
        .claim-card-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 6px;
            margin-bottom: 16px;
        }
        .claim-card-cell {
            border-radius: 6px;
            padding: 8px;
            min-height: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-size: 0.85rem;
            background: #f8fafc;
            border: 1px solid #cbd5f5;
        }
        .claim-card-cell.marked-called {
            background: #c6f6d5;
            border-color: #38a169;
        }
        .claim-card-cell.marked-only {
            background: #fed7d7;
            border-color: #e53e3e;
        }
        .claim-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 10px;
        }
        .claim-detail-columns {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
        }
        .claim-detail-columns ul {
            margin: 0;
            padding-left: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Bingo Control Room</h1>
            <div class="user-info">
                <span><?php echo $teacherName; ?></span>
                <a href="teacher_dashboard.php" class="back-btn">Back to Dashboard</a>
                <a href="logout.php" class="logout-btn">Logout</a>
            </div>
        </header>

        <p>Launch Bingo sessions, curate custom lists, and manage student claims from one place. Scroller management is still available from the main dashboard.</p>

        <div class="bingo-dashboard-grid">
            <section class="bingo-panel">
                <h2>Word Lists</h2>
                <p>Select any mix of Scroller or custom Bingo lists.</p>
                <div id="wordlist-options" class="wordlist-collection"></div>
            </section>

            <section class="bingo-panel">
                <h2>Create Custom Bingo List</h2>
                <form id="custom-list-form" class="custom-list-form">
                    <label>List Name</label>
                    <input type="text" name="name" required>
                    <label style="margin-top: 10px;">Words (one per line)</label>
                    <textarea name="words" required placeholder="Sign, Story, Culture..."></textarea>
                    <button type="submit" class="form-button" style="margin-top: 12px;">Save List</button>
                    <p id="custom-list-feedback" class="form-message" style="display:none;"></p>
                </form>
            </section>

            <section class="bingo-panel">
                <h2>Session Controls</h2>
                <div class="session-meta" id="session-meta"></div>
                <div class="bingo-controls">
                    <button type="button" id="start-game-btn" class="form-button">Start / Restart Game</button>
                    <button type="button" id="draw-word-btn" class="form-button" style="background:#0f172a;">Draw Next Word</button>
                    <button type="button" id="stop-game-btn" class="form-button" style="background:#e11d48;">Stop Session</button>
                </div>
            </section>

            <section class="bingo-panel">
                <h2>Draw History</h2>
                <ol id="draw-history" class="history-list"></ol>
            </section>

            <section class="bingo-panel" style="grid-column: 1 / -1;">
                <h2>Bingo Claims</h2>
                <div id="claims-list" class="claims-list"></div>
            </section>
        </div>
    </div>

    <div id="claim-review-modal" class="bingo-review-overlay hidden" role="dialog" aria-modal="true">
        <div class="bingo-review-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 id="claim-modal-title">Bingo Claim</h3>
                <button type="button" id="close-claim-modal" class="overlay-close" style="font-size:1.5rem;">&times;</button>
            </div>
            <p id="claim-modal-meta"></p>
            <div id="claim-card-grid" class="claim-card-grid"></div>
            <div class="claim-detail-columns">
                <div>
                    <h4>Called & Marked</h4>
                    <ul id="claim-matched-list"></ul>
                </div>
                <div>
                    <h4>Marked Only</h4>
                    <ul id="claim-unmatched-list"></ul>
                </div>
            </div>
            <div class="claim-actions">
                <button type="button" id="reject-claim-btn" class="form-button" style="background:#fb7185;">Continue</button>
                <button type="button" id="accept-claim-btn" class="form-button">Accept</button>
            </div>
        </div>
    </div>

    <script>
        window.bingoTeacherConfig = {
            wordlistsEndpoint: 'bingo/api/wordlists.php',
            saveListEndpoint: 'bingo/api/save-list.php',
            startGameEndpoint: 'bingo/api/start-game.php',
            teacherStateEndpoint: 'bingo/api/teacher-state.php',
            drawWordEndpoint: 'bingo/api/draw-word.php',
            resolveClaimEndpoint: 'bingo/api/resolve-claim.php',
            pollInterval: 4000
        };
    </script>
    <script src="js/bingo-teacher.js" defer></script>
</body>
</html>
