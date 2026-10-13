<?php
declare(strict_types=1);
// A page only needs the scene it is showing (Brandon, October 13, 2026: "it only needs the scene that they're on.
// It doesn't need the rest."). Server half: a page that asks with ?designs= is sent one scene's design (ground
// heights, walls, zones, what has been explored) and fetches another scene's from scene-design.php.
//
// What must hold, and is held here for the Director and for each of the four players:
//  - a page that does not ask is answered exactly as before (a page still open from before a deploy);
//  - nothing but other scenes' designs is left out, and every design left out is named with its versions;
//  - the lighter answer with each scene's design put back IS the whole answer, hidden things hidden the same;
//  - nothing stored is changed by any of it.
// The scene the players sit on is called gravity-orchard here; the real one is held to the same rule on a copy of
// the live site by dnd/vtt/tools/check-scene-designs.cjs.
require_once __DIR__ . '/../_common.php';
$base = sys_get_temp_dir() . '/vtt-scene-designs-' . bin2hex(random_bytes(8));
mkdir($base . '/sessions', 0777, true);
$path = $base . '/sync-v2.sqlite';
putenv('VTT_SYNC_V2_DATABASE=' . $path);
putenv('VTT_SYNC_V2_PUSHER_ENABLED=0');
function designCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$same = static fn ($a, $b): bool => json_encode($a) === json_encode($b);
$server = null;
try {
    $store = vttSyncV2Store();
    $store->migrateLegacyPlacements(['placements' => [
        'gravity-orchard' => [
            ['id' => 'cal-hero', 'profileId' => 'cal', 'primaryPc' => true, 'team' => 'ally', 'levelId' => 'level-0', 'column' => 4, 'row' => 4],
            ['id' => 'lurker', 'hidden' => true, 'team' => 'enemy', 'levelId' => 'level-0', 'column' => 6, 'row' => 4],
        ],
        'cellar' => [['id' => 'rat', 'team' => 'enemy', 'levelId' => 'level-0', 'column' => 1, 'row' => 1]],
        'plain' => [['id' => 'sharon-hero', 'profileId' => 'sharon', 'primaryPc' => true, 'team' => 'ally', 'levelId' => 'level-0', 'column' => 2, 'row' => 2]],
    ]]);
    $store->migrateLegacyBoardDomains(['activeSceneId' => 'cellar', 'mapUrl' => '/maps/cellar.jpg', 'sceneState' => [
        'gravity-orchard' => ['grid' => ['size' => 64], 'mapLevels' => ['levels' => [['id' => 'island-2'], ['id' => 'vault', 'hidden' => true, 'mapUrl' => '/vault.jpg']]]],
        'cellar' => ['grid' => ['size' => 50]],
        'plain' => [],
    ]]);
    $send = static function (array $command) use ($store): array {
        $snapshot = $store->getSnapshot();
        $result = $store->acceptBoardDomainCommand(['operationId' => 'designs-' . bin2hex(random_bytes(6)), 'baseRevision' => $snapshot['revision'], ...$command], 'GM', true);
        designCheck(($result['status'] ?? '') === 'accepted', 'The scene could not be set up: ' . json_encode($result['error'] ?? $result['status'] ?? null));
        return $result;
    };
    $design = static function (string $sceneId, string $field, array $value) use ($store, $send): void {
        $config = $store->getSnapshot()['state']['sceneConfig'][$sceneId] ?? [];
        $send(['type' => 'environment.set', 'sceneId' => $sceneId, 'entityRevision' => (int) ($config['_revision'] ?? 0),
            'payload' => ['field' => $field, 'expectedRevision' => (int) ($config['environment'][$field]['revision'] ?? 0), 'value' => $value]]);
    };
    $zones = json_decode((string) file_get_contents(__DIR__ . '/fixtures/terrain-zones-scene.json'), true, 64, JSON_THROW_ON_ERROR)['domains']['sceneConfig']['environment']['zones']['value'];
    $zones['zones'] = array_values(array_filter($zones['zones'], static fn ($zone) => ($zone['levelId'] ?? 'level-0') === 'level-0'));
    designCheck(in_array('hidden-pit', array_column($zones['zones'], 'id'), true), 'The borrowed zones have the GM-only one');
    $design('gravity-orchard', 'terrain', ['n' => 3, 'm' => 3, 'h' => [0, 1, 2, 3, 4, 5, 6, 7, 8]]);
    $design('gravity-orchard', 'terrain', ['n' => 3, 'm' => 3, 'h' => [0, 1, 2, 3, 9, 5, 6, 7, 8]]);       // its second version
    $design('gravity-orchard', 'zones', $zones);
    $design('cellar', 'terrain', ['n' => 2, 'm' => 2, 'h' => [0, 0, 1, 1]]);
    $routingRevision = static fn (): int => (int) ($store->getSnapshot()['state']['routing']['_revision'] ?? 0);
    $send(['type' => 'routing.set', 'entityRevision' => $routingRevision(), 'payload' => ['routing' => ['playerActiveSceneId' => 'gravity-orchard', 'playerMapUrl' => '/maps/orchard.jpg', 'playerMapDisabled' => false]]]);

    $stored = $store->getSnapshot();
    $viewers = ['GM' => ['user' => 'GM', 'isGM' => true, 'isLoggedIn' => true]];
    foreach (['cal', 'sharon', 'indigo', 'zepha'] as $player) $viewers[$player] = ['user' => $player, 'isGM' => false, 'isLoggedIn' => true];
    $withDesign = ['gravity-orchard', 'cellar'];

    foreach ($viewers as $name => $auth) {
        $whole = vttSyncV2ProjectSnapshotForUser($stored, $auth);
        designCheck(vttSyncV2ScopeDesigns($whole, null) === $whole, "$name: a page that does not ask gets the whole answer, untouched");
        $shown = $name === 'GM' ? 'cellar' : 'gravity-orchard';
        designCheck(($whole['state']['routing']['activeSceneId'] ?? null) === $shown, "$name is shown $shown");
        foreach (['own', 'gravity-orchard', 'cellar', 'plain', 'no-such-scene'] as $asked) {
            $scene = $asked === 'own' ? $shown : $asked;
            $light = vttSyncV2ScopeDesigns($whole, $asked);
            $told = json_decode((string) json_encode($light['designs']), true);
            designCheck($told['scene'] === $scene, "$name asking $asked: told which scene's design is in the answer");
            // Only designs are left out, and each one left out is named, with the versions of its parts.
            $expectedHeld = [];
            foreach ($withDesign as $other) if ($other !== $scene) foreach ($whole['state']['sceneConfig'][$other]['environment'] as $part => $entry) $expectedHeld[$other][$part] = $entry['revision'];
            designCheck($same($told['held'], $expectedHeld), "$name asking $asked: every design left out is named with its versions: " . json_encode($told['held']));
            foreach ($whole['state']['sceneConfig'] as $sceneId => $config) {
                $has = array_key_exists('environment', $light['state']['sceneConfig'][$sceneId]);
                designCheck($has === ($sceneId === $scene && array_key_exists('environment', $config)), "$name asking $asked: $sceneId " . ($sceneId === $scene ? 'keeps' : 'is sent without') . ' its design');
            }
            // Everything else is the whole answer's, key for key.
            $stripped = $whole; foreach ($stripped['state']['sceneConfig'] as $sceneId => $config) unset($stripped['state']['sceneConfig'][$sceneId]['environment']);
            $rest = $light; unset($rest['designs']); foreach ($rest['state']['sceneConfig'] as $sceneId => $config) unset($rest['state']['sceneConfig'][$sceneId]['environment']);
            designCheck($same($rest, $stripped), "$name asking $asked: tokens, floors, fights, drawings and routing are all there as before");
            // Put back what was left out, one scene at a time, as a page will: it is the whole answer again.
            $rebuilt = $light; unset($rebuilt['designs']);
            foreach (array_keys($told['held']) as $other) {
                $fetched = vttSyncV2SceneDesign($whole, (string) $other);
                designCheck($fetched['hasDesign'] === true && $fetched['sceneId'] === $other && $fetched['revision'] === $whole['revision'], "$name: the design of $other can be fetched");
                $config = $rebuilt['state']['sceneConfig'][$other]; $ordered = [];
                foreach ($whole['state']['sceneConfig'][$other] as $key => $unused) $ordered[$key] = $key === 'environment' ? $fetched['environment'] : $config[$key];
                $rebuilt['state']['sceneConfig'][$other] = $ordered;
            }
            designCheck($same($rebuilt, $whole), "$name asking $asked: the lighter answer with each design put back IS the whole answer");
        }
        $own = vttSyncV2ScopeDesigns($whole, 'own');
        designCheck(strlen((string) json_encode($own)) < strlen((string) json_encode($whole)), "$name: the lighter answer is smaller");
        // Hidden things are hidden the same in every piece.
        $pieces = json_encode([$own, vttSyncV2SceneDesign($whole, 'gravity-orchard'), vttSyncV2SceneDesign($whole, 'cellar')]);
        foreach (['hidden-pit', 'lurker', 'vault'] as $secret) {
            designCheck(str_contains((string) $pieces, $secret) === ($name === 'GM'), "$name " . ($name === 'GM' ? 'still sees' : 'is still not sent') . " $secret");
        }
        $none = vttSyncV2SceneDesign($whole, 'plain');
        designCheck($none['hasDesign'] === false && $none['environment'] === null, "$name: a scene with no design says so");
    }
    designCheck($store->getSnapshot() === $stored, 'Nothing stored was changed by any of it');

    // ---- through the real addresses ------------------------------------------------------------------
    // The oldest events are dropped, as the server itself drops them in time, so that a page at revision 0 can
    // no longer be caught up by events and is sent a snapshot.
    $direct = new PDO('sqlite:' . $path);
    $direct->exec('DELETE FROM vtt_events WHERE revision <= (SELECT MIN(revision) + 1 FROM vtt_events)');
    $direct = null;
    $api = realpath(__DIR__ . '/..');
    file_put_contents($base . '/router.php', '<?php $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } '
        . '$name = basename((string) parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH)); if (!in_array($name, ["snapshot.php", "sync.php", "scene-design.php", "commands.php"], true)) { http_response_code(404); return true; } '
        . 'chdir(' . var_export($api, true) . '); require ' . var_export($api, true) . ' . "/" . $name; return true;');
    $probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
    $extensions = is_file(dirname(PHP_BINARY) . '/ext/php_pdo_sqlite.dll') ? ['-d', 'extension_dir=' . dirname(PHP_BINARY) . '/ext', '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-d', 'extension=mbstring'] : [];
    $server = proc_open([PHP_BINARY, ...$extensions, '-d', 'display_errors=0', '-d', 'session.save_path=' . $base . '/sessions', '-S', "127.0.0.1:$port", '-t', $base, $base . '/router.php'],
        [['pipe', 'r'], ['file', $base . '/server.log', 'a'], ['file', $base . '/server.log', 'a']], $pipes, null, [...getenv(), 'VTT_SYNC_V2_DATABASE' => $path, 'VTT_SYNC_V2_PUSHER_ENABLED' => '0']);
    $ask = static function (?string $user, string $address, ?array $post = null) use ($port): array {
        $headers = ($user !== null ? "X-Test-User: $user\r\n" : '') . ($post !== null ? "Content-Type: application/json\r\n" : '');
        $context = stream_context_create(['http' => ['method' => $post !== null ? 'POST' : 'GET', 'ignore_errors' => true, 'timeout' => 30, 'header' => trim($headers), 'content' => $post !== null ? json_encode($post) : '']]);
        $body = (string) file_get_contents("http://127.0.0.1:$port/$address", false, $context);
        preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $status);
        return [(int) ($status[1] ?? 0), json_decode($body, true), $body];
    };
    for ($i = 0; $i < 80; $i++) { [$status] = $ask(null, 'snapshot.php'); if ($status !== 0) break; usleep(100000); }
    designCheck($status === 401, 'Nobody is sent a snapshot without a login: ' . $status);
    $plain = static fn ($value) => json_decode((string) json_encode($value), true);
    foreach (['GM', 'cal', 'sharon'] as $name) {
        $whole = vttSyncV2ProjectSnapshotForUser($store->getSnapshot(), $viewers[$name]);
        // An old page: no question asked, the whole answer, with no new key in it.
        [$status, $answer, $body] = $ask($name, 'snapshot.php');
        designCheck($status === 200 && $answer['snapshot'] === $plain($whole) && !array_key_exists('designs', $answer['snapshot']) && array_keys($answer) === ['success', 'mode', 'snapshot'], "$name, asking the old way, is answered exactly as before");
        $wholeBytes = strlen($body);
        [$status, $answer, $body] = $ask($name, 'snapshot.php?designs=own');
        designCheck($status === 200 && $answer['snapshot'] === $plain(vttSyncV2ScopeDesigns($whole, 'own')) && strlen($body) < $wholeBytes, "$name, asking for its own scene's design, gets the lighter answer");
        [$status, $answer] = $ask($name, 'snapshot.php?designs=cellar');
        designCheck($status === 200 && $answer['snapshot']['designs']['scene'] === 'cellar' && isset($answer['snapshot']['state']['sceneConfig']['cellar']['environment']) && !isset($answer['snapshot']['state']['sceneConfig']['gravity-orchard']['environment']), "$name can ask for a scene by its id");
        foreach (['gravity-orchard', 'cellar', 'plain'] as $sceneId) {
            [$status, $answer] = $ask($name, 'scene-design.php?sceneId=' . $sceneId);
            designCheck($status === 200 && $answer === $plain(['success' => true] + vttSyncV2SceneDesign($whole, $sceneId)), "$name fetches the design of $sceneId, and it is the whole answer's own");
        }
        // Too far behind for events: the snapshot that comes back is the lighter one too, when asked.
        [$status, $answer] = $ask($name, 'sync.php?after=0');
        designCheck($status === 200 && ($answer['recovery']['mode'] ?? '') === 'snapshot', "$name: recovery from far behind answers with a snapshot: " . json_encode($answer['recovery']['mode'] ?? null));
        designCheck($answer['recovery']['snapshot'] === $plain($whole) && !array_key_exists('designs', $answer['recovery']['snapshot']), "$name: recovery asked the old way is the whole snapshot, as before");
        [$status, $answer] = $ask($name, 'sync.php?after=0&designs=own');
        designCheck($status === 200 && $answer['recovery']['snapshot'] === $plain(vttSyncV2ScopeDesigns($whole, 'own')), "$name: recovery asked the new way is the lighter one");
        // A page that is up to date is sent events, and those are not touched.
        [$status, $answer] = $ask($name, 'sync.php?designs=own&after=' . $whole['revision']);
        designCheck($status === 200 && ($answer['recovery']['mode'] ?? '') === 'events' && $answer['recovery']['events'] === [], "$name: a page that is up to date is told so, asked either way");
    }
    // Refused questions.
    designCheck($ask(null, 'scene-design.php?sceneId=cellar')[0] === 401, 'Nobody is sent a design without a login');
    designCheck($ask('cal', 'scene-design.php')[0] === 422 && $ask('cal', 'scene-design.php?sceneId=../x')[0] === 422, 'A design is asked for by a plain scene id');
    designCheck($ask('cal', 'snapshot.php?designs=../x')[0] === 422 && $ask('cal', 'snapshot.php?designs[]=x')[0] === 422, 'and so is the lighter snapshot');
    designCheck($ask('GM', 'scene-design.php?sceneId=cellar', [])[0] === 405, 'A design is only read');
    // A refused command comes back with a snapshot: the lighter one when asked.
    $stale = ['type' => 'scene.activate', 'sceneId' => 'plain', 'operationId' => 'designs-stale-1', 'baseRevision' => $store->getSnapshot()['revision'], 'entityRevision' => 999, 'payload' => []];
    [$status, $answer] = $ask('GM', 'commands.php', $stale);
    if ($status === 409 && is_array($answer['snapshot'] ?? null)) {
        designCheck(!array_key_exists('designs', $answer['snapshot']) && isset($answer['snapshot']['state']['sceneConfig']['gravity-orchard']['environment']), 'A refused command asked the old way comes back with everything');
        [$status, $answer] = $ask('GM', 'commands.php?designs=own', ['operationId' => 'designs-stale-2'] + $stale);
        designCheck($status === 409 && $answer['snapshot']['designs']['scene'] === 'cellar' && !isset($answer['snapshot']['state']['sceneConfig']['gravity-orchard']['environment']) && isset($answer['snapshot']['state']['sceneConfig']['cellar']['environment']), 'and asked the new way, with the lighter one');
        $conflictSeen = true;
    }
    designCheck(($conflictSeen ?? false) === true, 'The refused-command answer was reached: ' . json_encode([$status, $answer['error'] ?? null]));
    $now = $store->getSnapshot();
    designCheck($now['state']['sceneConfig'] === $stored['state']['sceneConfig'] && $now['state']['placements'] === $stored['state']['placements'] && $now['state']['routing'] === $stored['state']['routing'], 'After all the asking, every scene, token and routing is as it was stored');
    echo "scene designs: a page that asks is sent one scene's design; the pieces put back are the whole; an old page is answered as before; nothing stored changes\n";
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    unset($store, $send, $design, $routingRevision);
    vttSyncV2ForgetStore();                     // or the database cannot be removed on Windows
    gc_collect_cycles();
    usleep(300000);
    foreach (array_merge(glob($base . '/sessions/*') ?: [], glob($base . '/*') ?: []) as $file) if (is_file($file)) @unlink($file);
    @rmdir($base . '/sessions'); @rmdir($base);
    if (is_dir($base)) fwrite(STDERR, "scene designs: the temporary folder could not be removed: $base\n");
}
