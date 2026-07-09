<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/scroller.php';
$me = aslhub_require_login($pdo);
aslhub_scroller_ensure_schema($pdo);
$base = aslhub_base_url();
$level = (int)($me['level'] ?? 0);
$isTeacher = !empty($me['is_teacher']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ASL Word Scroller</title>
    <link rel="stylesheet" href="styles.css?v=<?php echo @filemtime(__DIR__ . '/styles.css') ?: 1; ?>">
</head>
<body data-api="<?php echo aslhub_h($base . '/api/scroller_wordlists.php'); ?>" data-level="<?php echo $level; ?>" data-teacher="<?php echo $isTeacher ? '1' : '0'; ?>">
<main>
    <section id="menu-screen" class="screen active setup-screen">
        <div class="setup-card">
            <div class="setup-heading"><div><span class="eyebrow">ASL Hub</span><h1>Word Scroller</h1><p>Choose word banks, set the pace, and start.</p></div><a class="close-link" href="<?php echo $isTeacher ? aslhub_h($base . '/teacher/scroller.php') : aslhub_h($base . '/dashboard.php'); ?>">Done</a></div>
            <?php if ($isTeacher): ?>
            <label class="field compact" for="level-filter"><span>Show banks for</span><select id="level-filter"><option value="0">All levels</option><option value="1">ASL 1</option><option value="2">ASL 2</option><option value="3">ASL 3</option></select></label>
            <?php endif; ?>
            <div class="section-label">Word banks</div>
            <div id="wordlist-container" class="wordlist-container" aria-live="polite"><div class="loading">Loading word banks…</div></div>
            <label class="custom-toggle"><input type="checkbox" id="use-custom-words"> Add custom words</label>
            <textarea id="custom-words" placeholder="One word per line, or comma-separated" disabled></textarea>
            <div class="settings-grid">
                <label class="field"><span>Speed</span><select id="speed-select"><option value="0.5">0.5×</option><option value="0.6">0.6×</option><option value="0.7">0.7×</option><option value="0.8">0.8×</option><option value="0.9">0.9×</option><option value="1" selected>1.0×</option><option value="1.1">1.1×</option><option value="1.2">1.2×</option><option value="1.3">1.3×</option><option value="1.4">1.4×</option><option value="1.5">1.5×</option><option value="1.6">1.6×</option><option value="1.7">1.7×</option><option value="1.8">1.8×</option><option value="1.9">1.9×</option><option value="2">2.0×</option></select></label>
                <label class="field"><span>Number of words <b id="word-count-display">10</b></span><input type="range" id="word-count" min="5" max="50" value="10"></label>
            </div>
            <div id="menu-error" class="menu-error" role="alert"></div>
            <button id="start-btn" class="primary-button" type="button">Start game</button>
        </div>
    </section>
    <section id="game-screen" class="screen game-screen" aria-label="Scrolling game">
        <canvas id="stars-canvas"></canvas><div id="countdown" class="countdown" aria-live="assertive"></div><div id="game-area" class="game-area"></div><canvas id="particles-canvas"></canvas>
        <button id="exit-game" class="exit-game" type="button" aria-label="Exit game">Exit</button>
    </section>
    <section id="results-screen" class="screen setup-screen">
        <div class="setup-card results-card"><span class="eyebrow">Game complete</span><h1>Words shown</h1><div id="words-list" class="words-list"></div><div class="result-actions"><button id="play-again-btn" class="primary-button" type="button">Play again</button><button id="adjust-settings-btn" class="secondary-button" type="button">Adjust settings</button><button id="main-menu-btn" class="secondary-button" type="button">Clear selections</button></div></div>
    </section>
</main>
<audio id="countdown-sound" preload="auto"><source src="Mario Kart Race Start - Sound Effect (HD).mp3" type="audio/mpeg"></audio>
<script src="particles.js?v=<?php echo @filemtime(__DIR__ . '/particles.js') ?: 1; ?>"></script>
<script src="game.js?v=<?php echo @filemtime(__DIR__ . '/game.js') ?: 1; ?>"></script>
</body>
</html>

