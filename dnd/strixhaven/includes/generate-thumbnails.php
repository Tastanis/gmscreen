<?php
/**
 * One-time migration script to generate thumbnails for existing portrait images.
 * Run from CLI: php generate-thumbnails.php
 */
require_once __DIR__ . '/thumbnail-utils.php';

$sections = [
    [
        'portraitDir' => __DIR__ . '/../students/portraits/',
        'thumbDir'    => __DIR__ . '/../students/thumbnails/',
        'label'       => 'Students',
    ],
    [
        'portraitDir' => __DIR__ . '/../staff/portraits/',
        'thumbDir'    => __DIR__ . '/../staff/thumbnails/',
        'label'       => 'Staff',
    ],
];

$totalGenerated = 0;
$totalSkipped = 0;
$totalFailed = 0;

foreach ($sections as $section) {
    $portraitDir = $section['portraitDir'];
    $thumbDir = $section['thumbDir'];
    $label = $section['label'];

    echo "\n--- $label ---\n";

    if (!is_dir($portraitDir)) {
        echo "  Portrait directory not found: $portraitDir\n";
        continue;
    }

    $files = glob($portraitDir . '*');
    $generated = 0;
    $skipped = 0;
    $failed = 0;

    foreach ($files as $file) {
        if (!is_file($file)) continue;

        $baseName = pathinfo(basename($file), PATHINFO_FILENAME);
        $expectedThumb = $thumbDir . '/' . $baseName . '_thumb.webp';

        if (file_exists($expectedThumb)) {
            $skipped++;
            continue;
        }

        $result = generateThumbnail($file, $thumbDir, 320);
        if ($result) {
            $size = filesize($result);
            $origSize = filesize($file);
            echo "  Generated: " . basename($file) . " ({$origSize} -> {$size} bytes)\n";
            $generated++;
        } else {
            echo "  FAILED: " . basename($file) . "\n";
            $failed++;
        }
    }

    echo "  $label: Generated=$generated, Skipped=$skipped, Failed=$failed\n";
    $totalGenerated += $generated;
    $totalSkipped += $skipped;
    $totalFailed += $failed;
}

echo "\n=== Total: Generated=$totalGenerated, Skipped=$totalSkipped, Failed=$totalFailed ===\n";
