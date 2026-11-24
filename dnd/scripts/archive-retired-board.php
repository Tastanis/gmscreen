<?php
declare(strict_types=1);

// cPanel copies over the web root. Archive retired application files left by an earlier release.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$root = realpath($argv[1] ?? '');
if (!$root || basename($root) !== 'public_html' || !is_file($root . '/dnd/table/index.php')
    || !is_file($root . '/dnd/vtt/board3d/integration.mjs') || !is_file($root . '/dnd/character_sheet/builder/index.php')) {
    fwrite(STDERR, "Expected the deployed Table and 3D board in public_html.\n");
    exit(1);
}
$files = [
    'dnd/strixhaven/gm/includes/character-integration.php',
    'dnd/strixhaven/gm/includes/file-lock-manager.php',
    'dnd/strixhaven/gm/js/character-lookup.js',
    'dnd/strixhaven/gm/js/rich-text-editor.js',
    'dnd/strixhaven/gm/css/character-refs.css',
    'dnd/strixhaven/gm/index.php',
    'dnd/strixhaven/gm/note-editor.php',
    'dnd/strixhaven/gm/character-details.php',
    'dnd/strixhaven/gm/image-upload.php',
    'dnd/strixhaven/gm/data-recovery.php',
    'dnd/strixhaven/gm/css/note-editor.css',
    'dnd/strixhaven/gm/css/notes-list.css',
    'dnd/strixhaven/gm/images/background.jpg',
    'dnd/strixhaven/gm/includes/backup-system.php',
    'dnd/strixhaven/gm/includes/backup-system.php.bak',
    'dnd/strixhaven/gm/includes/gm-backup-helper.php',
    'dnd/includes/strix-nav.php',
    'dnd/js/character-sheet.js',
    'dnd/js/relationship-autocomplete.js',
    'dnd/js/theme-manager.js',
    'dnd/strixhaven/gm/css/gm-screen.css',
    'dnd/strixhaven/gm/js/gm-screen.js',
    'dnd/vtt/assets/js/ui/adaptive-fog.mjs',
    'dnd/vtt/assets/js/ui/floating-shadows.js',
    'dnd/vtt/assets/js/ui/fog-of-war.js',
    'dnd/vtt/assets/js/ui/height-tethers.js',
    'dnd/vtt/assets/js/ui/map-level-renderer.js',
    'dnd/vtt/assets/js/ui/movement-cell-projection.js',
    'dnd/vtt/assets/js/ui/obstacle-reveal.mjs',
    'dnd/vtt/assets/js/ui/player-preview-templates.js',
    'dnd/vtt/assets/js/ui/player-visibility-ready.js',
    'dnd/vtt/assets/js/ui/roof-renderer.js',
    'dnd/vtt/assets/js/ui/sight-job.mjs',
    'dnd/vtt/assets/js/ui/sight-outline.mjs',
    'dnd/vtt/assets/js/ui/template-wall-renderer.js',
    'dnd/vtt/assets/js/ui/token-aura-renderer.js',
    'dnd/vtt/assets/js/ui/vision-prototype.js',
];
$archive = dirname($root) . '/gmscreen-retired-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4));
foreach ($files as $name) {
    $source = $root . '/' . $name;
    if (!file_exists($source) && !is_link($source)) continue;
    if (!is_file($source) || is_link($source) || realpath($source) !== str_replace('/', DIRECTORY_SEPARATOR, $source)) {
        throw new RuntimeException('Unexpected deployed path for ' . $name);
    }
    $destination = $archive . '/' . $name;
    $directory = dirname($destination);
    if (!is_dir($directory) && !mkdir($directory, 0700, true)) {
        throw new RuntimeException('Could not create the archive directory.');
    }
    if (!rename($source, $destination)) throw new RuntimeException('Could not archive ' . $name);
    echo 'Archived ' . $name . PHP_EOL;
}
