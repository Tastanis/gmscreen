<?php
declare(strict_types=1);
// The page offers whatever rubble pictures are in the folder, found by file name.
require_once __DIR__ . '/../../../lib/RubbleImages.php';
function rubbleCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$folder = sys_get_temp_dir() . '/vtt-rubble-' . bin2hex(random_bytes(6));
mkdir($folder);
$names = ['rubble-stone-1.png', 'rubble-stone-2.png', 'rubble-stone-10.webp', 'rubble-door-1.png', 'rubble-heap-1.png',
    'README.md', 'rubble-lava-1.png', 'rubble-stone-1.psd', 'Rubble-Stone-3.PNG', 'rubble-stone-.png', 'stone-1.png', 'rubble-wood-1.png.bak'];
try {
    foreach ($names as $name) file_put_contents($folder . '/' . $name, 'x');
    mkdir($folder . '/rubble-wood-2.png'); // a folder with a picture's name is not a picture
    $urls = RubbleImages::urls($folder, 'assets/images/rubble/');
    $found = array_map(static fn ($url) => preg_replace('/\?v=\d+$/', '', $url), $urls);
    rubbleCheck($found === ['assets/images/rubble/rubble-door-1.png', 'assets/images/rubble/rubble-heap-1.png', 'assets/images/rubble/rubble-stone-1.png',
        'assets/images/rubble/rubble-stone-2.png', 'assets/images/rubble/rubble-stone-10.webp'], 'Only correctly named pictures are offered, in name order: ' . json_encode($found));
    foreach ($urls as $url) rubbleCheck((bool) preg_match('/\?v=\d{6,}$/', $url), 'Each address carries the file time so a replaced picture is fetched again');
    rubbleCheck(RubbleImages::urls($folder . '/missing', 'x') === [], 'No folder, no pictures, no error');
    // The folder shipped with the app is read without error (it may hold no pictures yet).
    rubbleCheck(is_array(RubbleImages::urls(__DIR__ . '/../../../assets/images/rubble', 'assets/images/rubble')), 'The real folder is readable');
} finally {
    @rmdir($folder . '/rubble-wood-2.png');
    foreach ($names as $name) @unlink($folder . '/' . $name);
    @rmdir($folder);
}
echo "PASS rubble pictures are found by name\n";
