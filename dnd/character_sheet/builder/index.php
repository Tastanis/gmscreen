<?php
declare(strict_types=1);
if (session_status() === PHP_SESSION_NONE) session_start();
require_once __DIR__ . '/../../includes/players.php';
players_gate();
$user = (string)($_SESSION['user'] ?? '');
if (empty($_SESSION['logged_in']) || $user === '') {
    header('Location: /dnd/index.php'); exit;
}
session_write_close();
header('Cache-Control: no-store');
$build = max(array_map('filemtime', glob(__DIR__ . '/*.{css,mjs,json,php}', GLOB_BRACE)));
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Character builder · Draw Steel</title>
<link rel="stylesheet" href="builder.css?v=<?= $build ?>">
</head><body data-account="<?= htmlspecialchars($user, ENT_QUOTES, 'UTF-8') ?>" data-build="<?= $build ?>">
<header class="mast"><span>Draw Steel</span><h1>Character builder</h1></header>
<div class="workbench"><nav id="steps" aria-label="Builder steps"></nav>
<main id="main"><p role="status">Opening the rulebook…</p></main>
<aside id="summary" aria-label="Hero summary"></aside></div>
<dialog id="house"><form method="dialog"><h2>Use a house rule?</h2><p id="house-text"></p>
<div class="controls"><button value="cancel" autofocus>Keep choosing</button><button value="accept">Use this choice</button></div></form></dialog>
<script type="module" src="builder.mjs?v=<?= $build ?>"></script></body></html>
