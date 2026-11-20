<?php
declare(strict_types=1);
session_start();
require_once __DIR__ . '/../../includes/players.php';
require_once __DIR__ . '/CharacterLibrary.php';
players_gate();
$user = (string) ($_SESSION['user'] ?? '');
if (empty($_SESSION['logged_in']) || $user === '') { header('Location: /dnd/index.php'); exit; }
$token = character_library_token();
session_write_close();
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: img-src 'none'; object-src 'none'; form-action 'self'; base-uri 'none'", false);
$gmList = ($_GET['scope'] ?? '') === 'pcs';
if ($gmList && $user !== 'GM') { http_response_code(403); exit('This list is for the GM.'); }
$home = $gmList ? 'library.php?scope=pcs' : 'library.php';
$title = $gmList ? 'Submitted PCs' : 'My Characters';
$h = static fn($v) => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$id = (string) ($_GET['id'] ?? '');
$sheetRow = null;
$list = [];
$error = '';
try {
    $library = character_library();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!is_string($_POST['token'] ?? null) || !hash_equals($token, $_POST['token'])) {
            throw new DomainException('Reopen My Characters and try again.');
        }
        if (($_POST['action'] ?? '') !== 'submit') throw new InvalidArgumentException('Unknown action.');
        $library->submit($user, $id);
        header('Location: library.php?id=' . rawurlencode($id), true, 303);
        exit;
    }
    if ($id !== '') {
        $sheetRow = $library->view($user, $id);
        if (!$sheetRow) throw new OutOfBoundsException('Character not found.');
        if (isset($_GET['download'])) {
            $filename = preg_replace('/[^\p{L}\p{N}_-]+/u', '-', $sheetRow['name']) . '.json';
            header('Content-Type: application/json');
            header("Content-Disposition: attachment; filename=\"character.json\"; filename*=UTF-8''" . rawurlencode($filename));
            echo $sheetRow['sheet'];
            exit;
        }
    } else {
        $list = $library->listing($user, $gmList);
    }
} catch (OutOfBoundsException $e) {
    http_response_code(404); $error = $e->getMessage();
} catch (DomainException | InvalidArgumentException $e) {
    http_response_code(403); $error = $e->getMessage();
} catch (Throwable $e) {
    http_response_code(503); $error = 'My Characters is unavailable. Please try again.';
}
$version = max(array_map('filemtime', glob(__DIR__ . '/*.{mjs,php,css}', GLOB_BRACE)));
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $h($sheetRow['name'] ?? $title) ?> · Draw Steel</title>
<link rel="stylesheet" href="builder.css?v=<?= $version ?>">
<link rel="stylesheet" href="../parts/sheet-parts.css?v=<?= filemtime(__DIR__ . '/../parts/sheet-parts.css') ?>">
<link rel="stylesheet" href="library.css?v=<?= $version ?>">
</head><body>
<header class="mast">
<?php if ($id !== ''): ?><a href="<?= $h($home) ?>">← <?= $h($title) ?></a><?php else: ?><span>Draw Steel</span><?php endif; ?>
<h1><?= $h($sheetRow['name'] ?? $title) ?></h1>
</header>
<main class="library">
<?php if ($error): ?><p role="alert"><?= $h($error) ?></p>
<?php elseif ($sheetRow): ?>
<div class="sheet-tools"><span>Read-only sheet</span><a href="library.php?id=<?= $h($id) ?>&amp;download=1">Download hero JSON</a>
<?php if ($sheetRow['submitted'] !== null): ?><span>Shared with the GM</span>
<?php elseif ($sheetRow['owner'] === $user): ?>
<form method="post"><input type="hidden" name="action" value="submit"><input type="hidden" name="token" value="<?= $h($token) ?>">
<button>Send to GM’s PCs</button></form><?php endif; ?>
</div>
<section id="saved-sheet" class="sp" data-sheet-theme="diablo" aria-label="Character sheet"></section>
<script type="application/json" id="snapshot"><?= json_encode(json_decode($sheetRow['sheet'], false, 64, JSON_THROW_ON_ERROR), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script type="module" src="saved-sheet.mjs?v=<?= $version ?>"></script>
<?php else: ?>
<?php if (!$gmList): ?><a class="builder-link" href="./">Open character builder</a><?php endif; ?>
<?php if (!$list): ?><p><?= $gmList ? 'Characters players send to the GM will appear here.' : 'To keep a finished hero here, open Review in the character builder and choose Save to My Characters.' ?></p>
<?php else: ?><ul class="hero-list">
<?php foreach ($list as $row): ?>
<li><a href="library.php?id=<?= $h($row['id']) ?><?= $gmList ? '&amp;scope=pcs' : '' ?>"><strong><?= $h($row['name']) ?></strong><span><?= $h($row['ancestry'] . ' ' . $row['class'] . ' · Level ' . $row['level']) ?></span>
<?php if ($gmList): ?><small>From <?= $h(players_names()[$row['owner']] ?? $row['owner']) ?></small>
<?php elseif ($row['submitted'] !== null): ?><small>Shared with the GM</small><?php endif; ?></a></li>
<?php endforeach; ?></ul><?php endif; endif; ?>
</main></body></html>
