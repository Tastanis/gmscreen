<?php
declare(strict_types=1);
// November 24, 2026: during play the Table stalled and the host answered 522. The account had hit its limit of
// 65 processes again and again. Three things in the site's own code held processes open for nothing:
//
//   1. Every open campus map reads the pings twice a second, and each read rewrote the shared ping file.
//   2. PHP keeps a player's session file locked until a request ends, so every request from one player waited in
//      a queue behind that player's slowest one. The reads each page repeats every few seconds only read the
//      session; they now let go of it as soon as they know who is asking.
//   3. Every sync wrote "seen here" to the database, taking its one write lock, even when the mark was fresh.
//
// What must not change: a ping is still seen by everyone, two pings sent at once are both kept, the route's
// drawing pen still belongs to one session, every change is still taken one at a time, and a player is still
// "here" for five seconds after their page last asked.
//
// The browser's side is dnd/strixhaven/map3d/tests/shared-feeds.test.mjs.
require_once __DIR__ . '/../_common.php';

function loadCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

// ---- 3. "seen here": a fresh mark is left alone, and five seconds still decides who is here ----
$database = sys_get_temp_dir() . '/vtt-hosting-load-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database, 'load-world', 10, 10, 10);
try {
    $peek = new PDO('sqlite:' . $database, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $seen = static fn (string $user): ?array => ($row = $peek->query("SELECT is_gm, last_seen FROM vtt_presence WHERE user_id = " . $peek->quote($user))->fetch(PDO::FETCH_ASSOC)) ? array_map('intval', $row) : null;
    $age = static function (string $user, int $milliseconds) use ($peek): int {
        $at = (int) floor(microtime(true) * 1000) - $milliseconds;
        $peek->exec("UPDATE vtt_presence SET last_seen = $at WHERE user_id = " . $peek->quote($user));
        return $at;
    };
    $writes = static fn (): int => (int) $peek->query('PRAGMA data_version')->fetchColumn();   // changes when another connection writes

    $store->touchPresence('Cal', false);
    $first = $seen('cal');
    loadCheck($first !== null && $first['is_gm'] === 0 && abs($first['last_seen'] - (int) floor(microtime(true) * 1000)) < 2000, 'The first request marks the player here: ' . json_encode($first));
    $before = $writes();
    for ($i = 0; $i < 20; $i++) $store->touchPresence('cal', false);
    loadCheck($seen('cal') === $first && $writes() === $before, 'Twenty more requests inside the same second write nothing');
    $old = $age('cal', 1500);
    $store->touchPresence('cal', false);
    loadCheck($seen('cal')['last_seen'] > $old + 1000, 'A mark over a second old is written again: ' . json_encode([$old, $seen('cal')]));
    $age('cal', -60000);
    $store->touchPresence('cal', false);
    loadCheck(abs($seen('cal')['last_seen'] - (int) floor(microtime(true) * 1000)) < 2000, 'A mark from the future (the clock was set back) is put right');
    $store->touchPresence('gm', true);
    $store->touchPresence('gm', false);
    loadCheck($seen('gm')['is_gm'] === 0, 'Who is the Director is written at once, fresh mark or not');
    $store->touchPresence('gm', true);
    loadCheck($seen('gm')['is_gm'] === 1, 'and back');

    $ask = static fn (string $id, string $player) => $store->acceptRequestedTestCommand(['operationId'=>'load-create-' . $id, 'type'=>'requestedTest.create', 'baseRevision'=>$store->getSnapshot()['revision'], 'sceneId'=>'scene', 'entityId'=>$id,
        'payload'=>['request'=>['recipientId'=>$player, 'attribute'=>'Might', 'rollMode'=>'individual', 'targetIds'=>['token-' . $id], 'targetNames'=>[$player], 'test'=>['batchId'=>'batch-' . $id]]]], 'gm', true)['event']['payload']['request'];
    // A page that asks every two seconds, answered late: the oldest its mark can be is the gap plus the second.
    $age('cal', 3400);
    loadCheck($ask('online', 'cal')['recipientId'] === 'cal', 'A player whose page asked 3.4 seconds ago is here, and gets his own test');
    $age('cal', 5600);
    $gone = $ask('gone', 'cal');
    loadCheck($gone['recipientId'] === 'gm' && $gone['wantedRecipientId'] === 'cal', 'A player not heard from for over five seconds is away: the test goes to the Director, who is told whose it was');
    $store->touchPresence('cal', false);
    loadCheck($ask('back', 'cal')['recipientId'] === 'cal', 'The moment his page asks again he is here again');
    unset($store, $peek);
} finally { foreach (['', '-wal', '-shm'] as $suffix) @unlink($database . $suffix); }

// ---- 1 and 2, over real requests ----
$dnd = dirname(__DIR__, 4);
$base = sys_get_temp_dir() . '/vtt-hosting-load-' . bin2hex(random_bytes(6));
$site = $base . '/dnd';
mkdir($base . '/sessions', 0777, true);
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
// The site's PHP files only: no data, no pictures.
$copy = static function (string $from, string $to) use (&$copy): void {
    foreach (scandir($from) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..' || $entry === 'node_modules' || $entry === 'vendor' || $entry === 'tests') continue;
        $path = $from . '/' . $entry;
        if (is_dir($path)) { $copy($path, $to . '/' . $entry); continue; }
        if (!str_ends_with($entry, '.php')) continue;
        if (!is_dir($to)) mkdir($to, 0777, true);
        copy($path, $to . '/' . $entry);
    }
};
$server = null;
try {
    foreach (['includes', 'strixhaven/map', 'character_sheet', 'vtt'] as $part) $copy("$dnd/$part", "$site/$part");
    foreach (['version.php', 'chat_handler.php'] as $file) copy("$dnd/$file", "$site/$file");
    foreach (['data', 'vtt/storage', 'strixhaven/map/data', 'character_sheet/data'] as $folder) if (!is_dir("$site/$folder")) mkdir("$site/$folder", 0777, true);
    copy("$dnd/data/version.json", "$site/data/version.json");
    copy("$dnd/vtt/config/player-roster.json", "$site/vtt/config/player-roster.json");
    file_put_contents("$site/vtt/config/pusher.php", "<?php return ['enabled' => false];\n");

    // Signs a request in as whoever its header names, and, for a request that carries a tag, notes whether the
    // session was still held when the request finished. Written here, for this test, and nowhere in the site.
    file_put_contents("$base/router.php", '<?php session_save_path(' . var_export("$base/sessions", true) . ');'
        . ' $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); }'
        . ' $tag = $_SERVER["HTTP_X_TEST_TAG"] ?? ""; if ($tag !== "") register_shutdown_function(static function () use ($tag) {'
        . ' file_put_contents(' . var_export("$base/held.log", true) . ', $tag . " " . (session_status() === PHP_SESSION_ACTIVE ? "held" : "released") . "\n", FILE_APPEND | LOCK_EX); });'
        . ' return false;');

    $probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
    $extensions = is_file(dirname(PHP_BINARY) . '/ext/php_pdo_sqlite.dll') ? ['-d', 'extension_dir=' . dirname(PHP_BINARY) . '/ext', '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-d', 'extension=mbstring'] : [];
    // Several workers, so requests truly overlap. (Windows PHP has one; the overlapping parts are skipped there.)
    $many = PHP_OS_FAMILY !== 'Windows';
    $env = array_merge(getenv(), ['VTT_SYNC_V2_DATABASE' => "$base/sync.sqlite", 'VTT_SYNC_V2_PUSHER_ENABLED' => '0', 'PHP_CLI_SERVER_WORKERS' => '8']);
    $server = proc_open([PHP_BINARY, ...$extensions, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $site, "$base/router.php"], [['pipe', 'r'], ['file', "$base/server.log", 'a'], ['file', "$base/server.log", 'a']], $pipes, $site, $env);

    // One request, sent and left: returns the open connection. $body: null, an array (JSON) or a string (a form).
    $send = static function (string $user, string $method, string $path, $body = null, string $cookie = '', string $tag = '') use ($port) {
        $content = $body === null ? '' : (is_array($body) ? json_encode($body) : $body);
        $socket = @stream_socket_client("tcp://127.0.0.1:$port", $errno, $error, 5);
        if (!$socket) return null;
        fwrite($socket, "$method /$path HTTP/1.0\r\nHost: 127.0.0.1\r\nX-Test-User: $user\r\n"
            . ($tag !== '' ? "X-Test-Tag: $tag\r\n" : '') . ($cookie !== '' ? "Cookie: PHPSESSID=$cookie\r\n" : '')
            . ($body === null ? '' : 'Content-Type: ' . (is_array($body) ? 'application/json' : 'application/x-www-form-urlencoded') . "\r\nContent-Length: " . strlen($content) . "\r\n")
            . "Connection: close\r\n\r\n" . $content);
        return $socket;
    };
    // The answer on a connection: [status, decoded body], or [0, []] if none came within $seconds.
    $finish = static function ($socket, float $seconds = 30.0): array {
        if (!$socket) return [0, []];
        $raw = ''; $until = microtime(true) + $seconds;
        stream_set_blocking($socket, false);
        while (!feof($socket) && microtime(true) < $until) {
            $read = [$socket]; $none = null;
            if (stream_select($read, $none, $none, 0, 100000)) $raw .= (string) fread($socket, 65536);
        }
        $done = feof($socket); fclose($socket);
        if (!$done) return [0, []];
        [$head, $text] = array_pad(explode("\r\n\r\n", $raw, 2), 2, '');
        preg_match('/^HTTP\/\S+ (\d{3})/', $head, $status);
        return [(int) ($status[1] ?? 0), json_decode($text, true) ?? ['raw' => $text]];
    };
    $ask = static fn (string $user, string $method, string $path, $body = null, string $cookie = '', string $tag = ''): array => $finish($send($user, $method, $path, $body, $cookie, $tag));
    $ping = 'strixhaven/map/api/ping-api.php';
    $path = 'strixhaven/map/api/player-path-api.php';
    for ($i = 0; $i < 80 && $ask('GM', 'GET', "$ping?action=get_pings")[0] === 0; $i++) usleep(100000);

    // ---- 1. reading the pings only reads ----
    $pingFile = "$site/strixhaven/map/data/pings.json";
    [$status, $answer] = $ask('cal', 'GET', "$ping?action=get_pings");
    loadCheck($status === 200 && ($answer['data']['pings'] ?? null) === [] && !file_exists($pingFile), 'With no pings yet a read answers with none and makes no file: ' . json_encode([$status, $answer]));
    loadCheck($ask('', 'GET', "$ping?action=get_pings")[0] === 401, 'Nobody signed in is still refused');

    $now = (int) round(microtime(true) * 1000);
    $stale = ['id' => 'GM:1:old', 'x' => 0.1, 'y' => 0.2, 'type' => 'ping', 'createdAt' => $now - 60000, 'authorId' => 'GM'];
    $live = ['id' => 'GM:2:live', 'x' => 0.3, 'y' => 0.4, 'type' => 'focus', 'createdAt' => $now + 600000, 'authorId' => 'GM', 'view' => [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]];
    file_put_contents($pingFile, json_encode([$stale, $live]));          // not as the site would lay it out, so any rewrite shows
    touch($pingFile, time() - 3600);
    clearstatcache();
    $bytes = file_get_contents($pingFile); $modified = filemtime($pingFile);
    for ($i = 0; $i < 5; $i++) {
        [$status, $answer] = $ask($i % 2 ? 'cal' : 'GM', 'GET', "$ping?action=get_pings");
        loadCheck($status === 200 && array_column($answer['data']['pings'] ?? [], 'id') === ['GM:2:live'] && ($answer['data']['pings'][0]['view'] ?? null) == $live['view'] && abs(($answer['data']['serverTime'] ?? 0) - $now) < 60000,
            'A read gives the pings still alive, whole, and the time: ' . json_encode($answer));
    }
    clearstatcache();
    loadCheck(file_get_contents($pingFile) === $bytes && filemtime($pingFile) === $modified, 'Five reads leave the ping file exactly as it was, expired ping and all');

    [$status, $answer] = $ask('cal', 'POST', $ping, ['action' => 'add_ping', 'x' => 0.25, 'y' => 1.5, 'type' => 'focus', 'view' => [9, 9, 9, 9, 9, 9]]);
    $added = $answer['data']['ping'] ?? [];
    loadCheck($status === 200 && ($answer['success'] ?? false) && ($added['authorId'] ?? '') === 'cal' && $added['x'] == 0.25 && $added['y'] == 1 && $added['type'] === 'focus' && !isset($added['view']),
        'A player\'s ping is taken as before (kept on the map; no camera of his is stored): ' . json_encode($answer));
    loadCheck(array_column(json_decode(file_get_contents($pingFile), true), 'id') === ['GM:2:live', $added['id']], 'Adding a ping is what drops the expired one from the file');
    [, $answer] = $ask('GM', 'POST', $ping, ['action' => 'add_ping', 'x' => 0.5, 'y' => 0.5, 'type' => 'focus', 'view' => [1, 2, 3, 4, 5, 6]]);
    loadCheck(($answer['data']['ping']['view'] ?? null) == [1, 2, 3, 4, 5, 6], 'The Director\'s "everyone look here" keeps his camera');
    [, $answer] = $ask('sharon', 'GET', "$ping?action=get_pings");
    loadCheck(count($answer['data']['pings'] ?? []) === 3, 'and everyone reads all three');
    loadCheck($ask('cal', 'POST', $ping, ['action' => 'add_ping', 'x' => 0.5])[0] === 400 && $ask('cal', 'GET', "$ping?action=nonsense")[0] === 400, 'A ping with no place, and an unknown read, are refused as before');

    [$status] = $ask('GM', 'POST', $ping, ['action' => 'clear_pings']);
    loadCheck($status === 200 && json_decode(file_get_contents($pingFile), true) === [], 'Clearing empties the file');
    // Twelve pings at once: every one is kept. (Each used to read, add its own and write back, the last one winning.)
    $sent = [];
    foreach (['GM', 'cal', 'sharon', 'indigo', 'zepha', 'GM', 'cal', 'sharon', 'indigo', 'zepha', 'GM', 'cal'] as $i => $who) $sent[] = $send($who, 'POST', $ping, ['action' => 'add_ping', 'x' => $i / 20, 'y' => 0.5]);
    $ids = [];
    foreach ($sent as $socket) { [$status, $answer] = $finish($socket); loadCheck($status === 200 && isset($answer['data']['ping']['id']), 'Each of the twelve is answered: ' . json_encode([$status, $answer])); $ids[] = $answer['data']['ping']['id']; }
    $kept = array_column(json_decode(file_get_contents($pingFile), true), 'id');
    sort($ids); sort($kept);
    loadCheck($kept === $ids && count(array_unique($ids)) === 12, 'Twelve pings sent at once are all in the file: ' . count($kept));
    for ($i = 0; $i < 8; $i++) $ask('GM', 'POST', $ping, ['action' => 'add_ping', 'x' => 0.9, 'y' => 0.9]);
    loadCheck(count(json_decode(file_get_contents($pingFile), true)) === 16, 'and never more than the newest sixteen are held');

    // ---- the route: reads leave the file alone; the pen is still one session's ----
    $pathFile = "$site/strixhaven/map/data/player-path-overlay.json";
    [$status, $answer] = $ask('cal', 'POST', $path, ['action' => 'save_marker', 'q' => 3, 'r' => 4, 'note' => 'The Biblioplex'], 'penholder');
    loadCheck($status === 200 && ($answer['success'] ?? false) && isset($answer['data']['markers']['3,4']), 'A destination is saved: ' . json_encode($answer));
    touch($pathFile, time() - 3600); clearstatcache();
    $bytes = file_get_contents($pathFile); $modified = filemtime($pathFile);
    for ($i = 0; $i < 5; $i++) { [$status, $answer] = $ask('sharon', 'GET', "$path?action=get_state"); loadCheck($status === 200 && ($answer['data']['markers']['3,4']['note'] ?? '') === 'The Biblioplex' && ($answer['data']['canUndo'] ?? false) === true, 'Everyone reads the route: ' . json_encode($answer)); }
    clearstatcache();
    loadCheck(file_get_contents($pathFile) === $bytes && filemtime($pathFile) === $modified, 'Five reads leave the route file, undo history and all, exactly as it was');
    [$status, $answer] = $ask('cal', 'POST', $path, ['action' => 'acquire_lock'], 'penholder');
    loadCheck($status === 200 && ($answer['data']['drawLock']['user'] ?? '') === 'cal', 'Cal takes the drawing pen: ' . json_encode($answer));
    $route = [['id' => 'section:1', 'route' => [['q' => 1, 'r' => 1], ['q' => 2, 'r' => 1]], 'createdAt' => 1]];
    [$status, $answer] = $ask('cal', 'POST', $path, ['action' => 'save_path', 'sections' => $route], 'another-tab');
    loadCheck($status !== 200 && !($answer['success'] ?? false), 'Another session, even his own name, cannot draw while that one holds the pen: ' . json_encode([$status, $answer]));
    [$status, $answer] = $ask('sharon', 'POST', $path, ['action' => 'acquire_lock'], 'sharon-session');
    loadCheck(!($answer['success'] ?? false), 'Nor can another player take the pen: ' . json_encode($answer));
    [$status, $answer] = $ask('cal', 'POST', $path, ['action' => 'save_path', 'sections' => $route], 'penholder');
    loadCheck($status === 200 && count($answer['data']['path']['sections'] ?? []) === 1, 'The session that holds the pen draws: ' . json_encode([$status, $answer]));
    [$status, $answer] = $ask('cal', 'POST', $path, ['action' => 'undo'], 'penholder');
    loadCheck($status === 200 && ($answer['data']['path']['sections'] ?? null) === [] && isset($answer['data']['markers']['3,4']), 'Undo takes the line back and leaves the destination: ' . json_encode($answer));
    $ask('cal', 'POST', $path, ['action' => 'release_lock'], 'penholder');

    // ---- 2. which requests still hold the session when they finish ----
    file_put_contents("$site/data/chat_messages.json", '[]');
    file_put_contents("$site/character_sheet/data/character_sheets.json", json_encode(['cal' => ['hero' => ['name' => 'Cal', 'vitals' => ['staminaMax' => 30, 'currentStamina' => 21]]]]));
    $form = static fn (array $fields): string => http_build_query($fields);
    $n = 0;
    $held = static function (string $user, string $method, string $where, $body, string $expect, string $what, ?callable $worked = null) use ($ask, $base, &$n): void {
        $tag = 'request' . (++$n);
        [$status, $answer] = $ask($user, $method, $where, $body, 'session' . $n, $tag);
        loadCheck($worked ? $worked($status, $answer) : ($status === 200 && ($answer['success'] ?? false) === true), "$what still works: " . json_encode([$status, $answer]));
        $line = '';
        foreach (file("$base/held.log", FILE_IGNORE_NEW_LINES) ?: [] as $entry) if (str_starts_with($entry, "$tag ")) $line = substr($entry, strlen($tag) + 1);
        loadCheck($line === $expect, "$what: the session is $expect at the end, not " . ($line === '' ? 'unknown' : $line));
    };
    // The reads each open page repeats: the session is let go of.
    $held('cal', 'GET', "$ping?action=get_pings", null, 'released', 'Reading the pings');
    $held('cal', 'GET', "$path?action=get_state", null, 'released', 'Reading the route');
    $held('GM', 'GET', 'vtt/api/v2/sync.php?after=0', null, 'released', 'The board\'s sync');
    $held('GM', 'GET', 'vtt/api/v2/snapshot.php', null, 'released', 'The board\'s snapshot');
    $held('cal', 'GET', 'vtt/api/v2/vision.php', null, 'released', 'Reading vision', static fn ($s, $a) => $s === 200 && isset($a['vision']['look']));
    $held('cal', 'GET', 'vtt/api/v2/vision.php?explored=scene-1', null, 'released', 'Reading the explored squares', static fn ($s, $a) => $s === 200 && ($a['cells'] ?? null) === []);
    $held('cal', 'POST', 'chat_handler.php', $form(['action' => 'chat_fetch']), 'released', 'Reading the chat', static fn ($s, $a) => $s === 200 && ($a['success'] ?? false) && is_array($a['messages'] ?? null));
    $held('cal', 'POST', 'chat_handler.php', $form(['action' => 'chat_test_state']), 'released', 'Reading the tests asked for', static fn ($s, $a) => $s === 200 && ($a['success'] ?? false) && is_array($a['tests'] ?? null));
    $held('cal', 'GET', 'character_sheet/handler.php?action=party-vitals', null, 'released', 'Reading the party\'s Stamina', static fn ($s, $a) => $s === 200 && ($a['party']['cal']['currentStamina'] ?? null) === 21);
    $held('cal', 'GET', 'character_sheet/handler.php?action=load&character=cal', null, 'released', 'Reading a sheet', static fn ($s, $a) => $s === 200 && ($a['success'] ?? false) && ($a['data']['hero']['name'] ?? '') === 'Cal');
    $held('cal', 'POST', 'character_sheet/inventory_handler.php', $form(['action' => 'load']), 'released', 'Reading the inventory', static fn ($s, $a) => $s === 200 && ($a['success'] ?? false) && is_array($a['data'] ?? null));
    // The campus map's own changes are each guarded by their file's lock, so they let go of the session too.
    $held('cal', 'POST', $ping, ['action' => 'add_ping', 'x' => 0.5, 'y' => 0.5], 'released', 'Sending a ping');
    $held('cal', 'POST', $path, ['action' => 'save_marker', 'q' => 5, 'r' => 5, 'note' => 'Camp'], 'released', 'Saving a destination');
    // Everything else that changes something keeps it to the end, as it always has: one player's changes one at a time.
    $held('cal', 'POST', 'vtt/api/v2/vision.php', ['explore' => 'scene-1', 'cells' => ['1,1', '2,1']], 'held', 'Adding explored squares', static fn ($s, $a) => $s === 200 && ($a['count'] ?? 0) === 2);
    $held('GM', 'POST', 'vtt/api/v2/vision.php', ['on' => true, 'look' => 'Dark'], 'held', 'The Director setting vision', static fn ($s, $a) => $s === 200 && ($a['vision']['look'] ?? '') === 'Dark');
    $held('GM', 'POST', 'vtt/api/v2/commands.php', ['operationId' => 'load-observe-1', 'type' => 'shadow.observe', 'baseRevision' => 0, 'payload' => ['note' => 'x']], 'held', 'A board command', static fn ($s, $a) => $s !== 0 && $s !== 401 && $s !== 500);
    $held('cal', 'POST', 'chat_handler.php', $form(['action' => 'chat_send', 'message' => 'hello', 'target' => 'all']), 'held', 'Sending a chat message', static fn ($s, $a) => $s === 200 && is_array($a));
    $held('cal', 'POST', 'character_sheet/handler.php', $form(['action' => 'load', 'character' => 'cal']), 'held', 'A sheet request sent as a change', static fn ($s, $a) => $s === 200 && is_array($a));
    $held('cal', 'POST', 'character_sheet/inventory_handler.php', $form(['action' => 'not-an-action']), 'held', 'An inventory change', static fn ($s, $a) => $s === 200 && is_array($a));
    [, $answer] = $ask('cal', 'GET', 'vtt/api/v2/vision.php?explored=scene-1');
    loadCheck(($answer['cells'] ?? null) === ['1,1', '2,1'], 'and what was explored is read back: ' . json_encode($answer));
    loadCheck($ask('', 'GET', 'vtt/api/v2/sync.php?after=0')[0] === 401 && $ask('cal', 'GET', 'vtt/api/v2/status.php')[0] === 403, 'Nobody signed in, and a player asking for the Director\'s page, are refused as before');

    // ---- 2, as a player meets it: one slow read no longer holds up that player's other requests ----
    if ($many) {
        $lock = fopen("$site/strixhaven/map/data/pings.lock", 'c');
        loadCheck($lock !== false && flock($lock, LOCK_EX), 'The test holds the ping lock, so a ping read has to wait');
        $slow = $send('cal', 'GET', "$ping?action=get_pings", null, 'onebrowser');
        usleep(400000);                                                    // it is now waiting at the ping lock
        $started = microtime(true);
        [$status, $answer] = $finish($send('cal', 'GET', "$path?action=get_state", null, 'onebrowser'), 6.0);
        $took = microtime(true) - $started;
        [$boardStatus] = $finish($send('cal', 'GET', 'character_sheet/handler.php?action=party-vitals', null, 'onebrowser'), 6.0);
        flock($lock, LOCK_UN); fclose($lock);
        [$slowStatus, $slowAnswer] = $finish($slow, 10.0);
        loadCheck($status === 200 && ($answer['success'] ?? false) && $took < 3.0, 'The same browser\'s route read is answered while its ping read waits: ' . json_encode([$status, round($took, 2)]));
        loadCheck($boardStatus === 200, 'and so is its read of the party\'s Stamina');
        loadCheck($slowStatus === 200 && is_array($slowAnswer['data']['pings'] ?? null), 'and the waiting ping read is answered once the file is free: ' . json_encode([$slowStatus, $slowAnswer]));
    }

    $log = (string) @file_get_contents("$base/server.log");
    loadCheck(!preg_match('/PHP (Warning|Fatal|Deprecated|Notice)|Uncaught/', $log), 'None of it raised a PHP warning or error: ' . substr($log, 0, 1500));
    echo 'hosting load: ping reads only read; pings sent at once are all kept; repeated reads let go of the session' . ($many ? ' and are not queued behind each other' : ' (overlap not tried: one worker here)') . "; presence is written once a second and five seconds still decides who is here\n";
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    $remove($base);
}
