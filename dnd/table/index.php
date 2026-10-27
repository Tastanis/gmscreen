<?php
// The Table. A PHP page (October 27, 2026) for two reasons: every file it loads carries a version, so the browser and the
// site's front proxy never hand out an old copy after a deploy (they kept the old Table for hours); and who you are and
// the scene list come with the page, so nothing has to open the map to learn them.
require __DIR__ . '/config.php';
$config = tableSiteConfig();
session_write_close();
if ($config === null) {
    header('Location: /dnd/index.php');
    exit;
}
$build = tableBuild();
$json = static fn ($value) => json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
header('Cache-Control: no-store');
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Table</title>
  <link rel="stylesheet" href="table.css?v=<?php echo $build; ?>">
</head>
<body>
  <nav id="rail" aria-label="Table tools"></nav>
  <main id="table">
    <div id="surface" class="leather"></div>
    <div id="emblem">STRIXHAVEN<small>DRAW STEEL</small></div>
    <div id="snap"></div>
    <div id="tray"></div>
    <div id="drop-hint">Drop to make this the table background</div>
  </main>
  <div id="tip" role="tooltip"></div>
  <script>window.TABLE_CONFIG = <?php echo $json($config); ?>; window.TABLE_BUILD = <?php echo $json($build); ?>;</script>
  <script src="table.js?v=<?php echo $build; ?>"></script>
  <script src="table-apps.js?v=<?php echo $build; ?>"></script>
</body>
</html>
