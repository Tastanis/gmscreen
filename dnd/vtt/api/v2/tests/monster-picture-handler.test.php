<?php
declare(strict_types=1);
// The Monster Creator's picture handler (dnd/strixhaven/monster-creator/upload-image.php), found by the tester's
// sweep of October 14, 2026: it asked only that somebody was logged in, though the Monster Creator is the
// Director's page; it stored a file under the ending of the name the uploader gave it, having checked only
// that the content began like a picture; and its folder had no rule against running what was in it. Together:
// any logged-in player could put a file called x.php there and have the web server run it.
//
// These run the real handler behind PHP's own command-line server, in an empty folder, with real uploads.
function pictureCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$source = realpath(__DIR__ . '/../../../../strixhaven/monster-creator');
define('MONSTER_IMAGE_INCLUDE_ONLY', true);                  // its functions only; no request is handled
require_once $source . '/upload-image.php';

// ---- the name a picture is stored under --------------------------------------------------------
pictureCheck(monsterImageName('monster_1791', 'image/gif', 1700000000) === 'monster_monster_1791_1700000000.gif', 'A picture is named by the monster, the time and the kind of picture it was found to be');
pictureCheck(monsterImageName('ogre-station-keeper', 'image/png', 5) === 'monster_ogre-station-keeper_5.png' && monsterImageName('m', 'image/jpeg', 5) === 'monster_m_5.jpg' && monsterImageName('m', 'image/webp', 5) === 'monster_m_5.webp', 'for each of the four kinds taken');
foreach (['../../index', 'a/b', 'a\\b', 'a.php', '', 'a b', str_repeat('a', 101), null, ['x']] as $bad) {
    pictureCheck(monsterImageName($bad, 'image/png', 5) === null, 'A monster id that is not letters, digits, "_" or "-" gives no name: ' . json_encode($bad));
}
foreach (['text/x-php', 'application/x-httpd-php', 'image/svg+xml', 'text/html', ''] as $kind) pictureCheck(monsterImageName('m', $kind, 5) === null, "Nothing but the four kinds of picture is named: $kind");
pictureCheck(monsterImageNameIsOurs('monster_ogre-station-keeper_5.png') && monsterImageNameIsOurs('monster_m_5.jpeg'), 'A name the handler could have stored is its own');
foreach (['../upload-image.php', 'monster_m_5.php', 'monster_m_5.png.php', 'monster_m_5.png/../../index.php', 'gm-monsters.json', "monster_m_5.png\n", '.htaccess', 'monster_.png', null] as $bad) {
    pictureCheck(!monsterImageNameIsOurs($bad), 'Nothing else is ever deleted: ' . json_encode($bad));
}

// ---- through the real handler --------------------------------------------------------------------
$site = sys_get_temp_dir() . '/vtt-monster-pictures-' . bin2hex(random_bytes(6));
mkdir($site . '/images', 0777, true);
copy($source . '/upload-image.php', $site . '/upload-image.php');
// Signs a request in as whoever its header names. Written here, for this test, and nowhere in the site.
file_put_contents($site . '/router.php', '<?php session_save_path(' . var_export($site, true) . '); $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } return false;');
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
$probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
$extensions = is_file(dirname(PHP_BINARY) . '/ext/php_gd.dll') ? ['-d', 'extension_dir=' . dirname(PHP_BINARY) . '/ext', '-d', 'extension=gd', '-d', 'extension=fileinfo'] : [];
$server = proc_open([PHP_BINARY, ...$extensions, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $site, $site . '/router.php'], [['pipe', 'r'], ['file', $site . '/server.log', 'a'], ['file', $site . '/server.log', 'a']], $pipes);
$ask = static function (?string $user, array $options) use ($port): array {
    $context = stream_context_create(['http' => ['method' => 'POST', 'ignore_errors' => true, 'timeout' => 20,
        'header' => trim(($user !== null ? "X-Test-User: $user\r\n" : '') . 'Content-Type: ' . $options['type']), 'content' => $options['body']]]);
    $answer = file_get_contents("http://127.0.0.1:$port/upload-image.php", false, $context);
    preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $status);
    return [(int) ($status[1] ?? 0), json_decode((string) $answer, true)];
};
$upload = static function (string $fileName, string $bytes, string $monsterId): array {
    $edge = 'edge' . bin2hex(random_bytes(6));
    $part = static fn (string $name, string $value) => "--$edge\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
    return ['type' => "multipart/form-data; boundary=$edge", 'body' => $part('action', 'upload') . $part('monsterId', $monsterId)
        . "--$edge\r\nContent-Disposition: form-data; name=\"image\"; filename=\"$fileName\"\r\nContent-Type: image/gif\r\n\r\n$bytes\r\n--$edge--\r\n"];
};
$delete = static fn (string $name): array => ['type' => 'application/json', 'body' => json_encode(['action' => 'delete', 'filename' => $name])];
$stored = static fn (): array => array_values(array_diff(scandir($site . '/images') ?: [], ['.', '..']));
// A one-pixel GIF: a true picture. With a script written after it, it is still found to be a GIF.
$gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');

try {
    for ($i = 0; $i < 80 && @file_get_contents("http://127.0.0.1:$port/router.php") === false && empty($http_response_header); $i++) usleep(100000);

    // Nobody, and a player: not theirs.
    [$status, $answer] = $ask(null, $upload('portrait.gif', $gif, 'monster_1'));
    pictureCheck($status === 401 && $stored() === [], 'Without a login nothing is taken: ' . $status);
    [$status, $answer] = $ask('cal', $upload('portrait.gif', $gif, 'monster_1'));
    pictureCheck($status === 403 && ($answer['error'] ?? '') === 'GM access required' && $stored() === [], 'A player\'s login cannot upload a monster\'s picture: ' . json_encode([$status, $answer]));

    // The Director: a picture is stored, under a name made here.
    [$status, $answer] = $ask('GM', $upload('My Ogre (final).GIF', $gif, 'monster_1'));
    pictureCheck($status === 200 && ($answer['success'] ?? false) === true && preg_match('/^monster_monster_1_\d+\.gif$/', (string) $answer['filename']) === 1 && $stored() === [$answer['filename']],
        'The Director\'s picture is stored under the handler\'s own name: ' . json_encode([$status, $answer, $stored()]));
    $kept = $answer['filename'];

    // THE HOLE. A file called x.php that begins as a picture and goes on as a script.
    [$status, $answer] = $ask('GM', $upload('x.php', $gif . '<?php echo "run"; ?>', 'monster_2'));
    $names = $stored();
    pictureCheck(array_filter($names, static fn ($name) => preg_match('/\.(gif|jpg|png|webp)$/', $name) !== 1) === [], 'Nothing is ever stored under a script\'s ending, whatever the uploader called it: ' . json_encode($names));
    pictureCheck(($answer['success'] ?? false) !== true || preg_match('/\.gif$/', (string) $answer['filename']) === 1, 'A picture that came as x.php is a .gif here: ' . json_encode($answer));
    foreach (['x.phtml', 'x.php.gif', 'x.gif.php', '../../x.php'] as $name) { $ask('GM', $upload($name, $gif, 'monster_3')); }
    pictureCheck(array_filter($stored(), static fn ($name) => preg_match('/^monster_[A-Za-z0-9_-]+\.gif$/', $name) !== 1) === [], 'whatever its name: ' . json_encode($stored()));
    // The id goes into the file's path: it may not carry a folder.
    $before = $stored();
    [$status, $answer] = $ask('GM', $upload('portrait.gif', $gif, '../../monster_4'));
    pictureCheck(($answer['success'] ?? null) === false && $stored() === $before && !glob(dirname($site) . '/monster_4*'), 'A monster id with a folder in it stores nothing anywhere: ' . json_encode($answer));
    // Not a picture at all.
    [$status, $answer] = $ask('GM', $upload('portrait.gif', '<?php echo "run"; ?>', 'monster_5'));
    pictureCheck(($answer['success'] ?? null) === false && $stored() === $before, 'What is not a picture is not stored: ' . json_encode($answer));

    // Deleting: the Director's, and only a picture this handler stored.
    [$status, $answer] = $ask('cal', $delete($kept));
    pictureCheck($status === 403 && in_array($kept, $stored(), true), 'A player\'s login cannot delete a monster\'s picture (it answered "success" before): ' . json_encode([$status, $answer]));
    foreach (['../upload-image.php', '../router.php', 'monster_1.php', '.htaccess'] as $name) {
        [$status, $answer] = $ask('GM', $delete($name));
        pictureCheck(($answer['success'] ?? null) === false && is_file($site . '/upload-image.php') && is_file($site . '/router.php'), "Nothing but a stored picture is deleted: $name");
    }
    [$status, $answer] = $ask('GM', $delete($kept));
    pictureCheck(($answer['success'] ?? false) === true && !in_array($kept, $stored(), true), 'The Director deletes a picture');
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    usleep(200000);
    $remove($site);
}

// ---- the folder ----------------------------------------------------------------------------------
$rules = (string) @file_get_contents($source . '/images/.htaccess');
pictureCheck(str_contains($rules, 'Require all denied') && preg_match('/<FilesMatch "\(\?i\)\\\\\.\(php\[0-9\]\?\|phtml\|phar/', $rules) === 1 && str_contains($rules, 'Options -ExecCGI'),
    'The pictures folder has a rule file that refuses to run or serve a script: ' . substr($rules, 0, 80));
$house = (string) file_get_contents(dirname($source, 2) . '/portraits/.htaccess');
pictureCheck(array_slice(explode("\n", str_replace("\r", '', trim($rules))), 2) === array_slice(explode("\n", str_replace("\r", '', trim($house))), 1), 'written exactly as the portraits folder\'s, which the host accepts');

echo "monster pictures: the Director only; the stored name is the handler's own; nothing but a stored picture is deleted; the folder runs nothing\n";
