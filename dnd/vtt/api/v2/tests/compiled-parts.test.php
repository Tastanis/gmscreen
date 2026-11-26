<?php
declare(strict_types=1);
// A scene's large design parts, kept ready-unpacked (SyncV2CompiledParts).
//
// November 24, 2026: a board command took half a second on the host with nothing in its way, most of it unpacking
// 4 MB of ground heights and walls that the command never touched. The parts are now also kept as compiled PHP
// files, which PHP's shared cache hands back without unpacking anything.
//
// What must not change: the world a command reads is exactly the world it read before, value for value and type
// for type; and wherever the cache cannot be used, everything is unpacked from its text as it always was.
if (!extension_loaded('Zend OPcache')) {
    echo "compiled parts: this PHP has no opcache, so there is no shortcut to test\n";
    exit(0);
}
if (!filter_var(ini_get('opcache.enable_cli'), FILTER_VALIDATE_BOOLEAN) || (int) ini_get('opcache.file_update_protection') !== 0) {
    // The command line starts with the cache off, and the cache waits two seconds before taking a new file.
    passthru(escapeshellarg(PHP_BINARY) . ' -d opcache.enable=1 -d opcache.enable_cli=1 -d opcache.file_update_protection=0 ' . escapeshellarg(__FILE__), $code);
    exit($code);
}
putenv('VTT_SYNC_V2_VERIFY_WRITES=1');
putenv('VTT_SYNC_V2_COMPILED_PARTS_MIN=64');
putenv('VTT_SYNC_V2_COMPILED_PARTS_SETTLE=0');
require_once __DIR__ . '/../../../lib/SyncV2Store.php';

function partsCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$base = sys_get_temp_dir() . '/vtt-compiled-' . bin2hex(random_bytes(6));
mkdir($base, 0775, true);
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
$files = static fn (string $folder): array => array_map('basename', glob($folder . '/compiled-parts/*.php') ?: []);
// A new request: the one piece of end-of-request work may be done again.
$request = static function (SyncV2CompiledParts ...$ended): void { foreach ($ended as $parts) $parts->keep(); SyncV2CompiledParts::allowWorkAgain(); };
try {
    partsCheck(SyncV2CompiledParts::available(), 'With opcache on, the shortcut is available');

    // ---- every kind of value comes back the same -------------------------------------------------
    $tricky = [
        'floats' => [0.1, 2.0, -0.0, 1.0E+25, 1.5E-9, 12.34, 0.30000000000000004, 9007199254740993.0, -3.75],
        'whole' => [0, -1, PHP_INT_MAX, PHP_INT_MIN, 42],
        'text' => ["O'Brien", 'a "quoted" \\ back\\slash', "line\nbreak\ttab", 'ünïcödé 龍 🐉', '<?php echo 1; ?>', '$not {$a} variable', ''],
        'flags' => [true, false, null],
        'empty' => [], 'nested' => ['list' => [[1, 2], [3, [4, [5]]]], 'map' => ['a' => ['b' => ['c' => 1.0]]]],
        'keys' => ['0' => 'zero', '7' => 'seven', '-3' => 'minus', 'x y' => 1, '' => 'empty key', "quo'te" => 2, '08' => 'not a number'],
        'gap' => [3 => 'three', 5 => 'five'], 'h' => array_map(static fn (int $i): float => round($i * 0.37 - 20, 2), range(0, 3000)),
    ];
    $json = json_encode($tricky, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $plain = json_decode($json, true);
    $back = eval('return ' . SyncV2CompiledParts::export($plain) . ';');
    partsCheck($back === $plain, 'What is written as PHP reads back identical to what the text unpacks to');
    partsCheck(json_encode($back, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) === json_encode($plain, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'and packs to the very same text');
    $direct = eval('return ' . SyncV2CompiledParts::export($tricky) . ';');
    partsCheck($direct === $tricky && is_float($direct['floats'][2]) && fdiv(1, $direct['floats'][2]) === -INF, 'Values the text itself would have altered (a minus zero) are written as they are');
    $precision = ini_get('serialize_precision'); ini_set('serialize_precision', '5');
    partsCheck(eval('return ' . SyncV2CompiledParts::export($plain) . ';') === $plain && ini_get('serialize_precision') === '5', 'A server set to write short numbers still writes these in full, and its setting is put back');
    ini_set('serialize_precision', (string) $precision);
    foreach ([NAN, INF, new stdClass()] as $bad) {
        try { SyncV2CompiledParts::export(['x' => $bad]); partsCheck(false, 'Something that is not plain data was written'); } catch (InvalidArgumentException $expected) { /* refused */ }
    }

    // ---- one part, over several requests ---------------------------------------------------------
    $database = $base . '/one/sync-v2.sqlite'; mkdir(dirname($database), 0775, true);
    $unpacked = 0;
    $decode = static function (string $text) use (&$unpacked): array { $unpacked++; return json_decode($text, true); };
    $first = new SyncV2CompiledParts($database, 'world');
    partsCheck($first->isOn() && $first->unpack('cave', 'terrain', $json, $decode) === $plain && $unpacked === 1 && $files(dirname($database)) === [], 'First seen: unpacked from its text, nothing written while the request runs');
    partsCheck($first->unpack('cave', 'zones', '{"a":1}', $decode) === ['a' => 1] && $unpacked === 2, 'A small part is always unpacked from its text');
    $request($first);
    partsCheck(count($files(dirname($database))) === 1 && is_file(dirname($database) . '/compiled-parts/.htaccess'), 'When the request ends the part is kept as one file, in a folder nobody outside may read');
    $second = new SyncV2CompiledParts($database, 'world');
    partsCheck($second->unpack('cave', 'terrain', $json, $decode) === $plain && $unpacked === 3, 'The next request still unpacks the text: the file is not in the cache yet');
    $request($second);
    $file = dirname($database) . '/compiled-parts/' . $files(dirname($database))[0];
    partsCheck(opcache_is_script_cached($file) && is_file($file . '.ok'), 'and hands the file to the cache when it ends');
    $third = new SyncV2CompiledParts($database, 'world');
    $ready = $third->unpack('cave', 'terrain', $json, $decode);
    partsCheck($ready === $plain && $unpacked === 3, 'From then on the part comes ready-unpacked, identical, and its text is not unpacked at all');
    $mine = $ready; $mine['h'][5] = 99.5; $mine['text'][] = 'added';
    partsCheck($third->unpack('cave', 'terrain', $json, $decode) === $plain && $mine !== $plain, 'A command changing its own copy does not change what the next reader is given');
    $request($third);

    // ---- a changed part, and a part that is gone --------------------------------------------------
    $changed = $plain; $changed['h'][0] = 7.25; $changedJson = json_encode($changed, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $fourth = new SyncV2CompiledParts($database, 'world');
    partsCheck($fourth->unpack('cave', 'terrain', $changedJson, $decode) === $changed && $unpacked === 4, 'A changed part is another text: unpacked, never mistaken for the old one');
    $other = new SyncV2CompiledParts($database, 'world');
    partsCheck($other->unpack('tower', 'terrain', $json, $decode) === $plain && $unpacked === 5, 'The same text in another scene is that scene\'s own');
    $request($fourth, $other);
    partsCheck(count($files(dirname($database))) === 2, 'One piece of work at the end of a request, however many parts were waiting: ' . json_encode($files(dirname($database))));
    $other = new SyncV2CompiledParts($database, 'world');
    $other->unpack('tower', 'terrain', $json, $decode);
    $request($other);
    partsCheck(count($files(dirname($database))) === 3, 'The other is kept by the next request that reads it');
    touch($file, time() - 600);
    $again = new SyncV2CompiledParts($database, 'world');
    $newer = $changed; $newer['h'][1] = 8.5;
    $again->unpack('cave', 'terrain', json_encode($newer, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $decode);
    $request($again);
    partsCheck(!is_file($file) && !is_file($file . '.ok') && count($files(dirname($database))) === 3, 'An older version of a part is removed once a newer one is kept: ' . json_encode($files(dirname($database))));
    $again->drop('tower', 'terrain');
    partsCheck(count($files(dirname($database))) === 2, 'A part whose row is deleted loses its file');

    // ---- where the cache cannot be used -----------------------------------------------------------
    putenv('VTT_SYNC_V2_COMPILED_PARTS=0');
    $off = new SyncV2CompiledParts($base . '/off/sync-v2.sqlite', 'world');
    $before = $unpacked;
    partsCheck(!$off->isOn() && $off->unpack('cave', 'terrain', $json, $decode) === $plain && $unpacked === $before + 1, 'Switched off: unpacked from the text');
    $request($off);
    partsCheck(!is_dir($base . '/off/compiled-parts'), 'and nothing is written');
    putenv('VTT_SYNC_V2_COMPILED_PARTS');
    partsCheck(!(new SyncV2CompiledParts('', 'world'))->isOn(), 'With no folder to keep them in (the read-back check) it is off');

    // A host where every request starts with an empty cache: compiling each time would cost more than unpacking.
    $database = $base . '/fresh/sync-v2.sqlite'; mkdir(dirname($database), 0775, true);
    $parts = new SyncV2CompiledParts($database, 'world');
    $parts->unpack('cave', 'terrain', $json, $decode); $request($parts);                        // written
    $compiles = 0;
    for ($n = 1; $n <= 6; $n++) {
        $parts = new SyncV2CompiledParts($database, 'world');
        if (!$parts->isOn()) break;
        $parts->unpack('cave', 'terrain', $json, $decode);
        $request($parts);
        $kept = glob(dirname($database) . '/compiled-parts/*.php')[0];
        if (opcache_is_script_cached($kept)) { $compiles++; opcache_invalidate($kept, true); }   // the next request finds the cache empty again
    }
    partsCheck($compiles >= 1 && $compiles <= 3 && is_file(dirname($database) . '/compiled-parts/off'), "After a few files lost straight after compiling, the shortcut switches itself off ($compiles compiles)");
    $parts = new SyncV2CompiledParts($database, 'world');
    $before = $unpacked;
    partsCheck(!$parts->isOn() && $parts->unpack('cave', 'terrain', $json, $decode) === $plain && $unpacked === $before + 1, 'and everything is unpacked from its text, as before');
    touch(dirname($database) . '/compiled-parts/off', time() - 4000);
    clearstatcache();
    partsCheck((new SyncV2CompiledParts($database, 'world'))->isOn(), 'An hour later it is tried again');

    // ---- through the store: the world is the same world -------------------------------------------
    $database = $base . '/board/sync-v2.sqlite'; mkdir(dirname($database), 0775, true);
    mt_srand(11);
    $heights = []; for ($i = 0; $i < 6000; $i++) $heights[] = round(mt_rand(0, 4000) / 100, 2);
    $heights[10] = 2.0; $heights[11] = -0.0;
    $walls = ['version' => 1, 'nodes' => array_map(static fn (int $i): array => ['id' => 'n' . $i, 'x' => $i * 1.5, 'y' => $i / 3], range(0, 80)), 'segments' => [], 'roofs' => []];
    $world = ['shadow' => ['mode' => 'shadow', 'observations' => []], 'routing' => ['activeSceneId' => 'cave', '_revision' => 1],
        'placements' => ['cave' => ['hero' => ['id' => 'hero', 'column' => 1, 'row' => 1, 'stamina' => 12, '_entityRevision' => 1]], 'tower' => []],
        'sceneConfig' => [
            'cave' => ['_revision' => 1, 'grid' => ['size' => 64], 'environment' => ['terrain' => ['revision' => 1, 'value' => ['n' => 100, 'm' => 60, 'h' => $heights]], 'walls' => ['revision' => 1, 'value' => $walls]], 'mapLevels' => ['levels' => [], 'baseStairs' => [], 'activeLevelId' => null], 'userLevelState' => []],
            'tower' => ['_revision' => 1, 'grid' => ['size' => 64], 'environment' => ['terrain' => ['revision' => 1, 'value' => ['n' => 2, 'm' => 2, 'h' => [9, 9, 9, 9.5]]]]],
        ]];
    $seed = new PDO('sqlite:' . $database); $seed->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $seed->exec('CREATE TABLE vtt_world_state (world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    $seed->prepare('INSERT INTO vtt_world_state VALUES (?,?,?,?)')->execute(['default', 7, json_encode($world, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 1700000000000]);
    $seed = null;
    $storage = new ReflectionProperty(SyncV2Store::class, 'storage'); $storage->setAccessible(true);
    $compiled = new ReflectionProperty(SyncV2Layout::class, 'compiled'); $compiled->setAccessible(true);
    $endRequest = static function (SyncV2Store $store) use ($storage, $compiled, $request): void { $request($compiled->getValue($storage->getValue($store))); };
    $withoutShortcut = static function () use ($database): array { putenv('VTT_SYNC_V2_COMPILED_PARTS=0'); try { return (new SyncV2Store($database))->getSnapshot(); } finally { putenv('VTT_SYNC_V2_COMPILED_PARTS'); } };
    $move = static function (SyncV2Store $store, string $id, int $column): array {
        $snapshot = $store->getSnapshot();
        return $store->acceptTokenMove(['operationId' => $id, 'type' => 'token.move', 'baseRevision' => $snapshot['revision'], 'entityRevision' => $snapshot['state']['placements']['cave']['hero']['_entityRevision'],
            'sceneId' => 'cave', 'entityId' => 'hero', 'payload' => ['placementId' => 'hero', 'column' => $column, 'row' => 1]], 'GM', true);
    };
    for ($n = 1; $n <= 6; $n++) {                                  // six requests: the two large parts are written, then compiled
        $store = new SyncV2Store($database);
        partsCheck($move($store, 'compiled-move-' . $n, 1 + $n)['status'] === 'accepted', "Move $n is accepted (every save here is read back and compared, part for part)");
        $endRequest($store); $store = null;
    }
    $kept = glob(dirname($database) . '/compiled-parts/*.php') ?: [];
    partsCheck(count($kept) === 2 && count(array_filter($kept, 'opcache_is_script_cached')) === 2, 'The ground and the walls of the large scene are in the cache; the small scene\'s are not worth keeping: ' . count($kept));
    $store = new SyncV2Store($database);
    $with = $store->getSnapshot(); $without = $withoutShortcut();
    partsCheck($with === $without && $with['revision'] === 13, 'The world read with the shortcut is identical to the world read without it');
    partsCheck($with['state']['sceneConfig']['cave']['environment']['terrain']['value']['h'][10] === 2 && $with['state']['placements']['cave']['hero']['column'] === 7, 'down to a whole number that was written as 2.0, and the token where the last move left it');

    // A design change through the store: the new ground is what everyone reads, at once and afterwards.
    $snapshot = $store->getSnapshot();
    $result = $store->acceptBoardDomainCommand(['type' => 'environment.terrain.patch', 'operationId' => 'compiled-ground-1', 'sceneId' => 'cave', 'baseRevision' => $snapshot['revision'],
        'entityRevision' => (int) $snapshot['state']['sceneConfig']['cave']['_revision'], 'payload' => ['expectedRevision' => 1, 'patch' => ['i0' => 0, 'j0' => 0, 'i1' => 0, 'j1' => 0, 'values' => [77.25]]]], 'GM', true);
    partsCheck(($result['status'] ?? '') === 'accepted', 'The ground is changed: ' . json_encode($result['error'] ?? $result['status'] ?? null));
    $endRequest($store); $store = null;
    for ($n = 7; $n <= 9; $n++) { $store = new SyncV2Store($database); partsCheck($move($store, 'compiled-move-' . $n, 20 + $n)['status'] === 'accepted', "Move $n after the change"); $endRequest($store); $store = null; }
    $with = (new SyncV2Store($database))->getSnapshot(); $without = $withoutShortcut();
    partsCheck($with === $without, 'After the change the two readings are still identical');
    partsCheck($with['state']['sceneConfig']['cave']['environment']['terrain']['value']['h'][0] === 77.25 && $with['state']['sceneConfig']['cave']['environment']['terrain']['revision'] === 2, 'and it is the new ground');
    $kept = glob(dirname($database) . '/compiled-parts/*.php') ?: [];
    partsCheck(count($kept) === 3 && count(array_filter($kept, 'opcache_is_script_cached')) === 3, 'The new ground has its own file, in the cache (the old one goes a minute later): ' . count($kept));

    echo "compiled parts: identical to the unpacked text for every kind of value; kept and compiled one per request; a changed part is never mistaken; off wherever the cache cannot be used\n";
} finally {
    $remove($base);
}
