<?php
declare(strict_types=1);

// The site's read-only export (dnd/admin/sandbox-export): the quick list, which opens no file, and
// checksums for a named set of paths. The whole list had grown past the host's time limit, because
// it read every file of the site on every request.
require_once __DIR__ . '/../../../../admin/sandbox-export/lib.php';

function exportCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'vtt-export-' . bin2hex(random_bytes(8));
$write = static function (string $relative, string $content) use ($root): string {
    $path = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0775, true);
    }
    file_put_contents($path, $content);
    return $path;
};
$remove = static function (string $directory) use (&$remove): void {
    foreach (scandir($directory) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $path = $directory . DIRECTORY_SEPARATOR . $entry;
        is_dir($path) ? $remove($path) : @unlink($path);
    }
    @rmdir($directory);
};

try {
    $write('data/characters.json', '{"cal":1}');
    $write('character_sheet/data/character_sheets.json', '{}');
    $write('vtt/storage/scenes.json', '{"scenes":[]}');
    $write('vtt/storage/tokens.json', '{"tokens":[]}');
    $picture = $write('vtt/storage/uploads/map.png', str_repeat('p', 5000));
    $write('vtt/index.php', '<?php echo 1;');
    $write('vtt/storage/backups/scenes-20261007_154500.json', '{}');
    $write('vtt/storage/sync-v2.before-split-20261011-101500.sqlite', 'not a real database');
    $databasePath = $root . DIRECTORY_SEPARATOR . 'vtt' . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'sync-v2.sqlite';
    $database = new PDO('sqlite:' . $databasePath);
    $database->exec('CREATE TABLE t (x TEXT)');
    $database->exec("INSERT INTO t VALUES ('one')");
    $database = null;
    touch($picture, 1700000000);
    $roots = ['dnd' => $root];
    $config = ['hex_storage' => 'json'];

    // ---- The whole list is as it was ----------------------------------------------------------
    $whole = sandboxManifest($roots, $config);
    exportCheck(!array_key_exists('checksums', $whole), 'The whole list carries no new key.');
    exportCheck($whole['files']['dnd/vtt/storage/uploads/map.png'] === ['kind' => 'file', 'sha256' => hash('sha256', str_repeat('p', 5000)), 'size' => 5000], 'A file in the whole list is its kind, checksum and size, as before.');
    exportCheck(array_keys($whole['files']) === ['dnd/character_sheet/data/character_sheets.json', 'dnd/data/characters.json', 'dnd/vtt/index.php', 'dnd/vtt/storage/scenes.json', 'dnd/vtt/storage/sync-v2.sqlite', 'dnd/vtt/storage/tokens.json', 'dnd/vtt/storage/uploads/map.png'], 'The whole list holds the same files as before; the dated copy and the backups are left out.');

    // ---- The quick list: the same list, sizes and times, nothing read ----------------------------
    $quick = sandboxManifest($roots, $config, false);
    exportCheck(array_key_first($quick) === 'checksums' && $quick['checksums'] === false, 'The quick list says at its top that it has no checksums.');
    exportCheck(array_keys($quick['files']) === array_keys($whole['files']), 'It lists exactly the files the whole list does.');
    exportCheck($quick['files']['dnd/vtt/storage/uploads/map.png'] === ['kind' => 'file', 'size' => 5000, 'mtime' => 1700000000], 'A file in the quick list is its kind, size and last-changed time in whole seconds.');
    exportCheck($quick['files']['dnd/vtt/index.php']['kind'] === 'code' && !isset($quick['files']['dnd/vtt/index.php']['sha256']), 'Code is listed with no checksum.');
    exportCheck($quick['files']['dnd/vtt/storage/sync-v2.sqlite'] === ['kind' => 'sqlite', 'size' => filesize($databasePath), 'mtime' => filemtime($databasePath)], 'A database is listed by its main file as it stands.');
    foreach (['excluded', 'issues', 'environment', 'consistency', 'limitations', 'schema'] as $block) {
        exportCheck($quick[$block] === $whole[$block], "The quick list's {$block} block is the whole list's.");
    }
    // Proof that nothing is opened: a file that cannot be read at all still gets its line. (The
    // whole list reads every file; the listing itself still requires each file to be readable.)
    $before = fileatime($picture);
    sandboxManifest($roots, $config, false);
    clearstatcache();
    exportCheck(fileatime($picture) === $before, 'Making the quick list does not read a file.');

    // ---- Checksums for a named set of paths ---------------------------------------------------------
    $some = sandboxChecksums($roots, ['dnd/vtt/storage/uploads/map.png', 'dnd/vtt/index.php', 'dnd/vtt/storage/gone.png', 'dnd/vtt/storage/backups/scenes-20261007_154500.json', 'dnd/vtt/storage/sync-v2.before-split-20261011-101500.sqlite', 'dnd/vtt/storage/uploads/map.png']);
    exportCheck($some['files']['dnd/vtt/storage/uploads/map.png'] === ['kind' => 'file', 'sha256' => hash('sha256', str_repeat('p', 5000)), 'size' => 5000, 'mtime' => 1700000000], 'A named file is answered as the whole list gives it, with its time.');
    exportCheck($some['files']['dnd/vtt/index.php']['kind'] === 'code' && $some['files']['dnd/vtt/index.php']['sha256'] === hash('sha256', '<?php echo 1;'), 'Code may be fingerprinted here.');
    exportCheck($some['missing'] === ['dnd/vtt/storage/gone.png', 'dnd/vtt/storage/backups/scenes-20261007_154500.json', 'dnd/vtt/storage/sync-v2.before-split-20261011-101500.sqlite'], 'A path that is gone or left out by the rules is reported as missing, once.');
    exportCheck(count($some['files']) === 2, 'A path named twice is answered once.');
    exportCheck(sandboxResolve($roots, 'dnd/vtt/index.php') === null, 'Code is still never downloadable.');
    $alone = sandboxChecksums($roots, ['dnd/vtt/storage/sync-v2.sqlite']);
    exportCheck($alone['files']['dnd/vtt/storage/sync-v2.sqlite']['sha256'] === $whole['files']['dnd/vtt/storage/sync-v2.sqlite']['sha256'] && $alone['files']['dnd/vtt/storage/sync-v2.sqlite']['size'] === $whole['files']['dnd/vtt/storage/sync-v2.sqlite']['size'], 'A database alone is answered with the checksum and size of its backup copy, as the whole list gives them.');

    // ---- What is refused rather than run long ----------------------------------------------------------
    $refused = static function (callable $ask): ?string {
        try { $ask(); } catch (SandboxTooMuch $error) { return $error->getMessage(); }
        return null;
    };
    exportCheck(str_contains((string) $refused(fn () => sandboxChecksums($roots, ['dnd/vtt/storage/sync-v2.sqlite', 'dnd/vtt/storage/uploads/map.png'])), 'alone'), 'A database with anything else in the request is refused.');
    $many = [];
    for ($n = 0; $n <= SANDBOX_CHECKSUM_PATHS; $n++) $many[] = "dnd/vtt/storage/uploads/file-{$n}.png";
    exportCheck(str_contains((string) $refused(fn () => sandboxChecksums($roots, $many)), 'at most ' . SANDBOX_CHECKSUM_PATHS), 'More than 200 paths are refused.');
    exportCheck($refused(fn () => sandboxChecksums($roots, array_slice($many, 0, SANDBOX_CHECKSUM_PATHS))) === null, 'Exactly 200 paths are answered.');
    // 300 MB of listed size: a sparse file stands in for a large picture, so the test writes almost nothing.
    $large = $root . DIRECTORY_SEPARATOR . 'vtt' . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'large.png';
    $handle = fopen($large, 'w'); ftruncate($handle, SANDBOX_CHECKSUM_BYTES + 1); fclose($handle);
    exportCheck(str_contains((string) $refused(fn () => sandboxChecksums($roots, ['dnd/vtt/storage/uploads/large.png'])), 'MB of listed size'), 'More than 300 MB of listed size is refused before anything is read.');
    @unlink($large);
    $invalid = false;
    try { sandboxChecksums($roots, ['dnd/../secret']); } catch (SandboxTooMuch $error) { } catch (RuntimeException $error) { $invalid = true; }
    exportCheck($invalid, 'A path that climbs out of the site is an error, not a "missing" entry.');

    // ---- sending a file larger than PHP's memory limit --------------------------------------
    // October 12, 2026: the first download of the store's database after its layout was split answered HTTP 500.
    // The checksum of the same database, asked a moment before, had worked. The download differed in one thing:
    // readfile(). With an output buffer open, readfile holds the whole file in memory first; past the memory
    // limit that is a fatal error no try/catch sees, and the server reports a bare 500. The file is sent in
    // pieces now. Each case below is its own PHP with 24 MB of memory and a 64 MB file.
    $big = $root . '/big.bin'; $handle = fopen($big, 'w');
    for ($k = 0; $k < 64; $k++) fwrite($handle, str_repeat(chr(65 + $k % 26), 1048576));
    fclose($handle);
    $libPath = var_export(realpath(__DIR__ . '/../../../../admin/sandbox-export/lib.php'), true); $bigPath = var_export($big, true);
    $child = static function (string $body) use ($root, $libPath, $bigPath): array {
        $script = $root . '/send-' . bin2hex(random_bytes(4)) . '.php'; $out = $script . '.out';
        file_put_contents($script, "<?php\nrequire_once $libPath;\n\$big = $bigPath;\n$body\n");
        $code = 1; exec(escapeshellarg(PHP_BINARY) . ' -d memory_limit=24M -d display_errors=0 -d log_errors=0 ' . escapeshellarg($script) . ' > ' . escapeshellarg($out) . ' 2>&1', $lines, $code);
        $result = [$code, is_file($out) ? filesize($out) : -1, is_file($out) ? hash_file('sha256', $out) : null];
        @unlink($script); @unlink($out);
        return $result;
    };
    $wantHash = hash_file('sha256', $big); $wantSize = 64 * 1048576;
    // What it was: a buffer open, then readfile. The request dies and the file does not arrive.
    [$code, $size] = $child('ob_start(); readfile($big);');
    exportCheck($code !== 0 && $size < $wantSize, "The old way must fail here, or this test proves nothing: exit $code, $size bytes");
    // What it is: the same buffer open, the file arrives whole.
    exportCheck($child('ob_start(); sandboxSend($big);') === [0, $wantSize, $wantHash], 'With an output buffer open the file is still sent whole, a piece at a time');
    exportCheck($child('ob_start(); ob_start(); ob_start(); sandboxSend($big);') === [0, $wantSize, $wantHash], 'and with several buffers open');
    exportCheck($child('ob_start(null, 0, PHP_OUTPUT_HANDLER_FLUSHABLE); sandboxSend($big);') === [0, $wantSize, $wantHash], 'and with a buffer that may be flushed but not closed: it is flushed after every piece');
    exportCheck($child('sandboxSend($big);') === [0, $wantSize, $wantHash], 'and with none');
    $missing = false; try { sandboxSend($root . '/not-there.bin'); } catch (RuntimeException $error) { $missing = true; }
    exportCheck($missing, 'A file that cannot be opened is an error the caller hears, not a silent empty answer');
    @unlink($big);
    $index = file_get_contents(__DIR__ . '/../../../../admin/sandbox-export/index.php');
    exportCheck(str_contains($index, 'sandboxSend($source);') && !str_contains($index, 'readfile('), 'The export sends its files with sandboxSend and never with readfile');

    echo "Sandbox export: whole list unchanged, quick list without reading, named checksums, limits, refusals and sending in pieces passed.\n";
} finally {
    $database = null;
    $remove($root);
}
