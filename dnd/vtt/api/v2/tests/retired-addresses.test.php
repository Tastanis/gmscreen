<?php
declare(strict_types=1);
// Old files that were still answering on the live site long after they left the code (the tester's check of the
// host against the code, October 13, 2026: a deploy copies over old files but never deletes them). The worst,
// dnd/inventory_handler.php, asked for no login and stored an uploaded file under the ending of the name it came
// with: anyone on the internet could put a program on the site and run it. Each address is now a file in the
// code that answers 404, so the next deploy replaces the old one.
//
// Held here: every one of them, asked for by nobody, by a player and by the Director, by GET and with an upload,
// answers 404 with nothing in it and writes nothing anywhere.
function retiredCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$dnd = realpath(__DIR__ . '/../../../..');
$retired = [
    'inventory_handler.php', 'vtt/debug_vtt.php', 'vtt/debug-health.php', 'combat/combat_handler.php', 'combat/index.php',
    'strixhaven/map/index-v2.php', 'vtt/api/state_helpers.php', 'includes/database-config.php', 'includes/hex-data-manager.php',
    // Retired earlier, in the same way.
    'strixhaven/map/api/hex-api.php', 'strixhaven/map/setup.php', 'strixhaven/inventory/index.php', 'strixhaven/inventory/save_inventory.php', 'strixhaven/inventory/upload_item_image.php',
    'debug-load.php',
];
foreach ($retired as $address) {
    $text = str_replace("\r", '', (string) @file_get_contents("$dnd/$address"));
    retiredCheck(preg_match('/^<\?php\n\/\/ Left here on purpose: [^\n]+\nhttp_response_code\(404\);\nexit;\n$/D', $text) === 1, "$address is in the code as a file that answers 404 and does nothing else");
    retiredCheck(preg_match('/password\s*=|\$expectedKey\s*=|mysql:host/i', $text) !== 1, "$address carries no setting or key");
}
// Nothing in the code still reads the two old include files.
foreach (['includes/database-config.php', 'includes/hex-data-manager.php'] as $include) {
    $name = basename($include);
    $users = [];
    $walk = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dnd, FilesystemIterator::SKIP_DOTS));
    foreach ($walk as $file) {
        $path = str_replace('\\', '/', $file->getPathname());
        if (!str_ends_with($path, '.php') || str_contains($path, '/node_modules/') || str_contains($path, '/vendor/') || str_ends_with($path, $include) || str_contains($path, '/tests/')) continue;
        if (preg_match('/\b(?:require|include)(?:_once)?\b[^;\n]*' . preg_quote($name, '/') . '/', (string) file_get_contents($path)) === 1) $users[] = substr($path, strlen($dnd) + 1);
    }
    retiredCheck($users === [], "Nothing requires $include any more: " . json_encode($users));
}

$base = sys_get_temp_dir() . '/vtt-retired-' . bin2hex(random_bytes(6));
$site = $base . '/site/dnd';
$remove = static function (string $folder) use (&$remove): void {
    foreach (is_dir($folder) ? (scandir($folder) ?: []) : [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
$everyFile = static function (string $folder) use (&$everyFile): array {
    $found = [];
    foreach (is_dir($folder) ? (scandir($folder) ?: []) : [] as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $path = $folder . '/' . $entry;
        $found = is_dir($path) ? array_merge($found, $everyFile($path)) : array_merge($found, [$path . ' ' . md5_file($path)]);
    }
    return $found;
};
$server = null;
try {
    foreach ($retired as $address) { @mkdir(dirname("$site/$address"), 0777, true); copy("$dnd/$address", "$site/$address"); }
    mkdir("$site/images", 0777, true);                                  // where the old inventory handler stored what it was sent
    mkdir("$base/sessions", 0777, true);
    file_put_contents("$base/router.php", '<?php session_save_path(' . var_export("$base/sessions", true) . '); $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } return false;');
    $probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
    $server = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', "$base/site", "$base/router.php"], [['pipe', 'r'], ['file', "$base/server.log", 'a'], ['file', "$base/server.log", 'a']], $pipes);
    $gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    $ask = static function (?string $user, string $address, bool $upload) use ($port, $gif): array {
        $edge = 'edge' . bin2hex(random_bytes(6));
        $part = static fn (string $name, string $value) => "--$edge\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
        // What the old inventory handler was sent to make it store a program: an "upload" that says it is a picture.
        $body = $part('action', 'inventory_upload_image') . $part('item_id', '../planted') . $part('key', 'anything')
            . "--$edge\r\nContent-Disposition: form-data; name=\"image\"; filename=\"x.php\"\r\nContent-Type: image/png\r\n\r\n" . $gif . "<?php echo 'run'; ?>\r\n--$edge--\r\n";
        $http = ['ignore_errors' => true, 'timeout' => 20, 'follow_location' => 0, 'header' => trim(($user !== null ? "X-Test-User: $user\r\n" : '') . ($upload ? "Content-Type: multipart/form-data; boundary=$edge" : ''))];
        if ($upload) { $http['method'] = 'POST'; $http['content'] = $body; }
        $answer = @file_get_contents("http://127.0.0.1:$port/dnd/$address" . ($upload ? '' : '?key=anything&action=load'), false, stream_context_create(['http' => $http]));
        preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $status);
        return [(int) ($status[1] ?? 0), (string) $answer];
    };
    for ($i = 0; $i < 80; $i++) { [$status] = $ask(null, 'debug-load.php', false); if ($status !== 0) break; usleep(100000); }
    $before = $everyFile("$base/site");
    foreach ($retired as $address) {
        foreach ([null, 'cal', 'GM'] as $who) {
            foreach ([false, true] as $upload) {
                [$status, $answer] = $ask($who, $address, $upload);
                retiredCheck($status === 404 && $answer === '', "$address answers 404 and nothing else to " . ($who ?? 'nobody') . ($upload ? ' sending an upload' : '') . ': ' . json_encode([$status, substr($answer, 0, 80)]));
            }
        }
    }
    clearstatcache();
    retiredCheck($everyFile("$base/site") === $before, 'After all of it not one file was written, changed or removed anywhere in the site');
    retiredCheck(glob("$base/site/*planted*") === [] && glob("$base/site/dnd/*planted*") === [] && glob("$base/site/dnd/images/*") === [], 'and nothing was stored, in the pictures folder or above it');
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    usleep(200000);
    $remove($base);
}
echo 'retired addresses: ' . count($retired) . " old files answer 404 to nobody, a player and the Director, with or without an upload, and write nothing\n";
