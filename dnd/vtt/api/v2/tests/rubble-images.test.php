<?php
declare(strict_types=1);
// The page offers whatever rubble pictures are in the folder, found by file name.
require_once __DIR__ . '/../../../lib/RubbleImages.php';
function rubbleCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$folder = sys_get_temp_dir() . '/vtt-rubble-' . bin2hex(random_bytes(6));
mkdir($folder);
$names = ['rubble-stone-1.png', 'rubble-stone-2.png', 'rubble-stone-10.webp', 'rubble-door-1.png', 'rubble-heap-stone-1.png', 'rubble-heap-wood-2.webp',
    'README.md', 'rubble-lava-1.png', 'rubble-heap-1.png', 'rubble-heap-lava-1.png', 'rubble-stone-1.psd', 'Rubble-Stone-3.PNG', 'rubble-stone-.png', 'stone-1.png', 'rubble-wood-1.png.bak'];
try {
    foreach ($names as $name) file_put_contents($folder . '/' . $name, 'x');
    mkdir($folder . '/rubble-wood-2.png'); // a folder with a picture's name is not a picture
    // One real picture, so its size can be read: a 6 by 2 see-through PNG.
    file_put_contents($folder . '/rubble-stone-1.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAYAAAACCAYAAAB7Xa1eAAAAC0lEQVR4nGNgwAYAAB4AAVCnDNYAAAAASUVORK5CYII='));
    $pictures = RubbleImages::urls($folder, 'assets/images/rubble/');
    $found = array_map(static fn ($picture) => preg_replace('/\?v=\d+$/', '', $picture['url']), $pictures);
    rubbleCheck($found === ['assets/images/rubble/rubble-door-1.png', 'assets/images/rubble/rubble-heap-stone-1.png', 'assets/images/rubble/rubble-heap-wood-2.webp',
        'assets/images/rubble/rubble-stone-1.png', 'assets/images/rubble/rubble-stone-2.png', 'assets/images/rubble/rubble-stone-10.webp'], 'Only correctly named pictures are offered, in name order: ' . json_encode($found));
    foreach ($pictures as $picture) rubbleCheck((bool) preg_match('/\?v=\d{6,}$/', $picture['url']), 'Each address carries the file time so a replaced picture is fetched again');
    $stone = $pictures[3];
    rubbleCheck($stone['width'] === 6 && $stone['height'] === 2, 'A picture\'s size is listed so the page can keep its shape: ' . json_encode($stone));
    rubbleCheck($pictures[0]['width'] === 0 && $pictures[0]['height'] === 0, 'A file that is not really a picture is listed with no size, not an error');
    rubbleCheck(RubbleImages::urls($folder . '/missing', 'x') === [], 'No folder, no pictures, no error');
    // The folder shipped with the app is read without error (it may hold no pictures yet).
    $shipped = RubbleImages::urls(__DIR__ . '/../../../assets/images/rubble', 'assets/images/rubble');
    rubbleCheck(is_array($shipped), 'The real folder is readable');
    // Every picture shipped with the app has a readable size and is small.
    foreach ($shipped as $picture) {
        $file = __DIR__ . '/../../../assets/images/rubble/' . basename(preg_replace('/\?v=\d+$/', '', $picture['url']));
        rubbleCheck($picture['width'] > 0 && $picture['height'] > 0 && $picture['width'] <= 800, 'Shipped picture has a sensible size: ' . json_encode($picture));
        rubbleCheck(filesize($file) < 200 * 1024, 'Shipped picture is under 200 KB: ' . basename($file));
    }
} finally {
    @rmdir($folder . '/rubble-wood-2.png');
    foreach ($names as $name) @unlink($folder . '/' . $name);
    @rmdir($folder);
}
echo "PASS rubble pictures are found by name\n";
