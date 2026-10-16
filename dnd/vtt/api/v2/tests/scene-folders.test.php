<?php
declare(strict_types=1);
// Build 522 (Brandon, October 2026): "every time you put one of the maps into the VTT it goes into the unsorted
// folder". An imported map now goes into the folder picked in the import box, and any scene can be moved into a
// folder (or back to Unsorted) from the Scenes panel.
//
// These run the real scene endpoints behind PHP's own command-line server, on a copy of the VTT's PHP files in an
// empty folder (with Pusher switched off), signed in by a header this test's router reads.
function folderCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$dnd = realpath(__DIR__ . '/../../../..');
require_once $dnd . '/vtt/lib/ScenePackage.php';

$base = sys_get_temp_dir() . '/vtt-scene-folders-' . bin2hex(random_bytes(6));
$site = $base . '/dnd';
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
// PHP files only: no data, no storage, no tests.
$copy = static function (string $from, string $to) use (&$copy): void {
    foreach (scandir($from) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..' || in_array($entry, ['node_modules', 'vendor', 'storage', 'tests', '__tests__', 'board3d', 'assets'], true)) continue;
        $path = $from . '/' . $entry;
        if (is_dir($path)) { $copy($path, $to . '/' . $entry); continue; }
        if (!str_ends_with($entry, '.php')) continue;
        if (!is_dir($to)) mkdir($to, 0777, true);
        copy($path, $to . '/' . $entry);
    }
};
$server = null;
try {
    $copy("$dnd/vtt", "$site/vtt");
    $copy("$dnd/includes", "$site/includes");
    copy("$dnd/version.php", "$site/version.php");
    foreach (['sessions', 'dnd/data', 'dnd/vtt/storage'] as $folder) if (!is_dir("$base/$folder")) mkdir("$base/$folder", 0777, true);
    copy("$dnd/data/version.json", "$site/data/version.json");
    file_put_contents("$site/vtt/config/pusher.php", "<?php return ['enabled' => false];\n");
    copy("$dnd/vtt/config/player-roster.json", "$site/vtt/config/player-roster.json");
    file_put_contents("$base/router.php", '<?php session_save_path(' . var_export("$base/sessions", true) . '); $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } return false;');

    $probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
    $extensions = is_file(dirname(PHP_BINARY) . '/ext/php_pdo_sqlite.dll') ? ['-d', 'extension_dir=' . dirname(PHP_BINARY) . '/ext', '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-d', 'extension=mbstring'] : [];
    $env = array_merge(getenv(), ['VTT_SYNC_V2_DATABASE' => "$base/sync.sqlite", 'VTT_SYNC_V2_PUSHER_ENABLED' => '0']);
    $server = proc_open([PHP_BINARY, ...$extensions, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $site, "$base/router.php"], [['pipe', 'r'], ['file', "$base/server.log", 'a'], ['file', "$base/server.log", 'a']], $pipes, $site, $env);
    $ask = static function (string $user, string $method, string $path, ?array $body = null) use ($port): array {
        $context = stream_context_create(['http' => ['method' => $method, 'ignore_errors' => true, 'timeout' => 30,
            'header' => "X-Test-User: $user\r\nContent-Type: application/json", 'content' => $body === null ? '' : json_encode($body)]]);
        $answer = @file_get_contents("http://127.0.0.1:$port/$path", false, $context);
        preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $status);
        return [(int) ($status[1] ?? 0), json_decode((string) $answer, true) ?? ['raw' => (string) $answer]];
    };
    for ($i = 0; $i < 80 && $ask('GM', 'GET', 'vtt/api/scenes.php')[0] === 0; $i++) usleep(100000);
    $catalog = static fn (): array => $ask('GM', 'GET', 'vtt/api/scenes.php')[1]['data'] ?? [];
    $sceneIn = static function (string $id) use ($catalog): ?array { foreach ($catalog()['items'] ?? [] as $scene) if (($scene['id'] ?? null) === $id) return $scene; return null; };
    $package = static fn (string $name) => ScenePackage::build(['id' => 'source', 'name' => $name, 'mapUrl' => '/map.jpg'], ['state' => ['placements' => ['source' => []], 'sceneConfig' => ['source' => []]]]);
    $import = static fn (string $name, $folderId, string $operation) => $ask('GM', 'POST', 'vtt/api/v2/scene-import.php', ['package' => $package($name), 'operationId' => $operation, 'allowPlayerBrowsing' => true] + ($folderId === false ? [] : ['folderId' => $folderId]));

    [$status, $made] = $ask('GM', 'POST', 'vtt/api/scenes.php', ['action' => 'create-folder', 'name' => 'Dungeons']);
    $folder = $made['data']['id'] ?? null;
    folderCheck($status === 200 && is_string($folder), 'The Director makes a folder: ' . json_encode($made));

    // ---- importing into a folder ----
    [$status, $answer] = $import('Dead Root', $folder, 'scene-folders-import-1');
    $deadRoot = $answer['scene']['id'] ?? null;
    folderCheck($status === 200 && ($answer['scene']['folderId'] ?? 'x') === $folder, 'An imported map goes into the folder picked: ' . json_encode($answer));
    folderCheck(($sceneIn($deadRoot)['folderId'] ?? null) === $folder, 'and it is in that folder in the scene list');
    [$status, $answer] = $import('Medpilis', false, 'scene-folders-import-2');
    $medpilis = $answer['scene']['id'] ?? null;
    folderCheck($status === 200 && array_key_exists('folderId', $sceneIn($medpilis) ?? []) && $sceneIn($medpilis)['folderId'] === null, 'No folder picked: Unsorted, as before');
    [$status, $answer] = $import('Nowhere', 'folder-that-was-deleted', 'scene-folders-import-3');
    folderCheck($status === 422 && ($answer['error'] ?? '') === 'That folder no longer exists. Pick another.', 'A folder that does not exist is refused, not guessed at: ' . json_encode([$status, $answer]));
    folderCheck(count(array_filter($catalog()['items'] ?? [], static fn ($s) => ($s['name'] ?? '') === 'Nowhere')) === 0, 'and no scene is made');

    // ---- moving a scene that is already there ----
    [$status, $answer] = $ask('GM', 'POST', 'vtt/api/scenes.php', ['action' => 'move-scene', 'sceneId' => $medpilis, 'folderId' => $folder]);
    folderCheck($status === 200 && ($sceneIn($medpilis)['folderId'] ?? null) === $folder, 'A scene already uploaded is moved into a folder: ' . json_encode($answer));
    [$status] = $ask('GM', 'POST', 'vtt/api/scenes.php', ['action' => 'move-scene', 'sceneId' => $medpilis, 'folderId' => '']);
    folderCheck($status === 200 && $sceneIn($medpilis)['folderId'] === null, 'and back to Unsorted');
    [$status, $answer] = $ask('GM', 'POST', 'vtt/api/scenes.php', ['action' => 'move-scene', 'sceneId' => $medpilis, 'folderId' => 'folder-that-was-deleted']);
    folderCheck($status === 422 && $sceneIn($medpilis)['folderId'] === null, 'A folder that does not exist is refused');
    [$status] = $ask('GM', 'POST', 'vtt/api/scenes.php', ['action' => 'move-scene', 'sceneId' => 'scn-not-there', 'folderId' => $folder]);
    folderCheck($status === 404, 'A scene that is not there says so');
    [$status] = $ask('cal', 'POST', 'vtt/api/scenes.php', ['action' => 'move-scene', 'sceneId' => $deadRoot, 'folderId' => '']);
    folderCheck($status === 403 && $sceneIn($deadRoot)['folderId'] === $folder, 'A player cannot move scenes');
    folderCheck(($sceneIn($deadRoot)['name'] ?? '') === 'Dead Root' && ($sceneIn($deadRoot)['mapUrl'] ?? '') === '/map.jpg', 'Moving changes nothing else about a scene');
} catch (Throwable $failure) {
    // What the server wrote, to see why.
    fwrite(STDERR, is_file("$base/server.log") ? substr((string) file_get_contents("$base/server.log"), -3000) : '');
    throw $failure;
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    usleep(300000);
    $remove($base);
}
echo "scene-folders tests passed\n";
