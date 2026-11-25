<?php
declare(strict_types=1);
// Checks, on a COPY of the board's database, that every stored design part comes back from its compiled form
// exactly as it comes back from its text (SyncV2CompiledParts). Run it before a release that touches that class.
//
//   php dnd/vtt/tools/check-compiled-parts.php path/to/copy-of-sync-v2.sqlite
//
// The database is opened read-only and nothing is written beside it: the compiled files go to the system's
// temporary folder and are removed. It prints sizes and timings only, never what the parts hold.
// Ends with status 0 when every part is identical, 1 when any differs or cannot be read.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../lib/SyncV2CompiledParts.php';

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) {
    fwrite(STDERR, "usage: php check-compiled-parts.php <a copy of sync-v2.sqlite>\n");
    exit(1);
}
$real = realpath($path);
$live = realpath(__DIR__ . '/../storage/sync-v2.sqlite');
if ($live !== false && $real === $live) {
    fwrite(STDERR, "This is the site's own database. Give this tool a copy of it.\n");
    exit(1);
}
$folder = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'vtt-check-compiled-' . bin2hex(random_bytes(6));
mkdir($folder, 0700, true);
$ms = static fn (float $from): float => (hrtime(true) - $from) / 1e6;
$failed = 0; $count = 0; $bytes = 0; $compiledBytes = 0; $unpack = 0.0; $load = 0.0; $large = 0;
try {
    $pdo = new PDO('sqlite:file:' . str_replace('\\', '/', $real) . '?mode=ro', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY | (defined('PDO::SQLITE_OPEN_URI') ? PDO::SQLITE_OPEN_URI : 0)]);
    $rows = $pdo->query('SELECT world_id, scene_id, part, state_json FROM vtt_state_parts ORDER BY LENGTH(state_json) DESC');
    while (is_array($row = $rows->fetch(PDO::FETCH_NUM))) {
        [$world, $scene, $part, $json] = $row;
        $count++; $bytes += strlen($json);
        $label = sprintf('part %2d (%s, %s bytes)', $count, $part, number_format(strlen($json)));
        $a = hrtime(true); $plain = json_decode($json, true); $unpack += $ms($a);
        if (!is_array($plain)) { $failed++; echo "$label: its text does not unpack\n"; continue; }
        try {
            $source = '<?php return ' . SyncV2CompiledParts::export($plain) . ';';
        } catch (Throwable $error) {
            $failed++; echo "$label: cannot be written as a compiled part (" . $error->getMessage() . ")\n"; continue;
        }
        $file = $folder . DIRECTORY_SEPARATOR . $count . '.php';
        file_put_contents($file, $source);
        $compiledBytes += strlen($source);
        $a = hrtime(true); $back = include $file; $load += $ms($a);
        @unlink($file);
        $same = $back === $plain
            && json_encode($back, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) === json_encode($plain, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            && serialize($back) === serialize($plain);            // types and key order too
        if (!$same) { $failed++; echo "$label: DIFFERS from its text\n"; continue; }
        if (strlen($json) >= 32768) $large++;
        echo "$label: identical\n";
    }
    $main = $pdo->query('SELECT LENGTH(state_json) FROM vtt_state_main')->fetchColumn();
    printf("\n%d parts, %.2f MB of text (%d large enough to be kept compiled), %.2f MB as compiled files.\n", $count, $bytes / 1048576, $large, $compiledBytes / 1048576);
    printf("Unpacking them all from text took %.0f ms here; the light row beside them is %.2f MB.\n", $unpack, ((int) $main) / 1048576);
    printf("(Loading the compiled files without the shared cache took %.0f ms; with it, a request does not pay this at all.)\n", $load);
    echo $failed === 0 ? "RESULT: every part is identical.\n" : "RESULT: $failed part(s) differ or could not be checked.\n";
} catch (Throwable $error) {
    $failed++;
    fwrite(STDERR, 'The check could not be made: ' . $error->getMessage() . "\n");
} finally {
    foreach (glob($folder . DIRECTORY_SEPARATOR . '*') ?: [] as $left) @unlink($left);
    @rmdir($folder);
}
exit($failed === 0 ? 0 : 1);
