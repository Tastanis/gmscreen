<?php
require __DIR__ . '/../dnd/includes/portrait-upload.php';
function check($ok, $message) { if (!$ok) { throw new RuntimeException($message); } }
$root = sys_get_temp_dir() . '/portrait-test-' . bin2hex(random_bytes(8));
mkdir($root); mkdir($root . '/data'); mkdir($root . '/portraits');
try {
    $image = imagecreatetruecolor(2, 2);
    imagepng($image, $root . '/input.php');
    file_put_contents($root . '/input.php', '<?php echo "UNTRUSTED_TRAILER"; ?>', FILE_APPEND);
    $png = encodePortrait($root . '/input.php');
    check(strpos($png, 'UNTRUSTED_TRAILER') === false, 'Untrusted trailer survived');
    check(getimagesizefromstring($png)[2] === IMAGETYPE_PNG, 'Not PNG');
    $original = ['cal'=>['character'=>['portrait'=>'portraits/old.png','level'=>4]], 'sharon'=>['notes'=>'retain']];
    file_put_contents($root . '/data/characters.json', json_encode($original));
    file_put_contents($root . '/portraits/old.png', 'original');
    $path = savePortrait($root, 'cal', $png);
    check((bool)preg_match('~^portraits/cal_portrait_[a-f0-9]{32}\.png$~', $path), 'Unsafe filename');
    $saved = json_decode(file_get_contents($root . '/data/characters.json'), true);
    check($saved['sharon'] === $original['sharon'] && $saved['cal']['character']['level'] === 4, 'Other data changed');
    check(file_get_contents($root . '/portraits/old.png') === 'original', 'Old portrait changed');
    file_put_contents($root . '/bad.png', '<?php echo "bad"; ?>');
    try { encodePortrait($root . '/bad.png'); throw new Exception('Accepted non-image'); } catch (RuntimeException $expected) {}
    $large = imagecreatetruecolor(4097, 1); imagepng($large, $root . '/large.png');
    try { encodePortrait($root . '/large.png'); throw new Exception('Accepted oversized dimensions'); } catch (RuntimeException $expected) {}
    file_put_contents($root . '/data/characters.json', '{broken');
    $before = glob($root . '/portraits/*');
    try { savePortrait($root, 'cal', $png); throw new Exception('Accepted corrupt data'); } catch (JsonException $expected) {}
    check(file_get_contents($root . '/data/characters.json') === '{broken', 'Corrupt data overwritten');
    check(glob($root . '/portraits/*') === $before, 'Failed save leaked portrait');
    echo "PASS: re-encoding, spoofed input rejection, dimensions, unique filenames, data preservation, failure preservation\n";
} finally {
    foreach (glob($root . '/portraits/*') as $file) { unlink($file); }
    foreach (glob($root . '/data/*') as $file) { unlink($file); }
    foreach (glob($root . '/*') as $file) { if (is_file($file)) { unlink($file); } }
    rmdir($root . '/portraits'); rmdir($root . '/data'); rmdir($root);
}
