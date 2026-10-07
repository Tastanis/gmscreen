<?php
declare(strict_types=1);

// Standalone: never bootstrap the application, initialize storage, or impersonate a player.
function sandboxPath(string $path): string
{
    if ($path === '' || preg_match('/[\\\\:\x00-\x1f]/', $path)) {
        throw new RuntimeException('Invalid path.');
    }
    foreach (explode('/', $path) as $part) {
        if ($part === '' || $part === '.' || $part === '..' || str_starts_with($part, '.')) {
            throw new RuntimeException('Invalid path.');
        }
    }
    return $path;
}

function sandboxJson($value): string
{
    return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function sandboxPolicy(string $path): string
{
    $parts = explode('/', strtolower($path));
    $name = end($parts);
    if ($name === 'error_log' || $name === 'license' || $path === 'dnd/v1' || str_ends_with($name, '.example')) return 'excluded:non-runtime';
    foreach ($parts as $part) {
        if (str_starts_with($part, '.') || in_array($part, ['backups', 'backup', 'logs', 'sessions', 'node_modules', 'tests', '__tests__', 'tools', 'ai-reference', 'docs'], true)) {
            return 'excluded:non-runtime';
        }
    }
    if (preg_match('/^sess_[a-zA-Z0-9,-]+$/D', $name)) return 'excluded:session';
    if (str_ends_with($name, '.old')) return 'excluded:non-runtime';
    if (str_contains($path, '/admin/')) return 'excluded:administration';
    if (preg_match('/(?:secret|credential|password|config\.local|\.env|\/private\/)/i', $path)) return 'excluded:private';
    if (preg_match('/(?:\.lock|\.log|\.tmp|\.part|-wal|-shm|-journal)$/i', $name)) return 'excluded:transient';
    if (preg_match('/(?:backup|_log\.)/i', $name)) return 'excluded:non-runtime';
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (in_array($ext, ['md', 'map'], true)) return 'excluded:documentation';
    if (in_array($ext, ['php', 'js', 'mjs', 'css', 'html', 'htm'], true)) return 'code';
    if (in_array($ext, ['sqlite', 'sqlite3', 'db'], true)) return 'sqlite';
    if (in_array($ext, ['json', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'pdf', 'mp3', 'ogg', 'wav', 'mp4', 'webm', 'woff', 'woff2', 'ttf', 'glb', 'gltf', 'bin', 'dam'], true)) return 'file';
    return 'unreviewed';
}

/** Server-controlled mounts only. Never accept a filesystem root from a request. */
function sandboxRoots(string $dndRoot, array $config): array
{
    $roots = ['dnd' => $dndRoot];
    foreach (($config['extra_dnd_roots'] ?? []) as $mount => $absolute) {
        sandboxPath((string)$mount);
        if (!str_starts_with($mount, 'dnd/') || !is_string($absolute)) throw new RuntimeException('Invalid D&D mount.');
        $roots[$mount] = $absolute;
    }
    return $roots;
}

function sandboxInventory(array $roots): array
{
    $files = []; $excluded = []; $unreviewed = [];
    foreach ($roots as $mount => $root) {
        if (!is_dir($root) || is_link($root)) throw new RuntimeException('A configured root is unavailable.');
        $root = realpath($root);
        $walk = function (string $directory, string $prefix) use (&$walk, &$files, &$excluded, &$unreviewed, $root): void {
            $entries = scandir($directory);
            if ($entries === false) throw new RuntimeException('A directory cannot be read.');
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                $absolute = $directory . DIRECTORY_SEPARATOR . $entry;
                $relative = $prefix . '/' . $entry;
                if (is_link($absolute)) { $unreviewed[] = ['path'=>$relative, 'reason'=>'symbolic-link']; continue; }
                $kind = sandboxPolicy($relative);
                if (str_starts_with($kind, 'excluded:')) { $excluded[] = ['path'=>$relative, 'reason'=>$kind]; continue; }
                if (is_dir($absolute)) { $walk($absolute, $relative); continue; }
                sandboxPath($relative);
                if (!is_file($absolute) || !is_readable($absolute)) throw new RuntimeException('A file cannot be read.');
                if ($kind === 'unreviewed') { $unreviewed[] = ['path'=>$relative, 'reason'=>'unknown-file-type']; continue; }
                if (isset($files[$relative])) throw new RuntimeException('Overlapping mounts.');
                $files[$relative] = ['absolute'=>$absolute, 'kind'=>$kind];
            }
        };
        $walk($root, $mount);
    }
    ksort($files, SORT_STRING);
    return ['files'=>$files, 'excluded'=>$excluded, 'unreviewed'=>$unreviewed];
}

function sandboxResolve(array $roots, string $path): ?array
{
    sandboxPath($path);
    $found = null;
    foreach ($roots as $mount => $root) {
        if (!str_starts_with($path, $mount . '/')) continue;
        $absolute = realpath($root);
        if ($absolute === false || is_link($root)) throw new RuntimeException('Root unavailable.');
        $prefix = $mount;
        foreach (explode('/', substr($path, strlen($mount) + 1)) as $part) {
            $absolute .= DIRECTORY_SEPARATOR . $part;
            $prefix .= '/' . $part;
            if (is_link($absolute) || str_starts_with(sandboxPolicy($prefix), 'excluded:')) continue 2;
        }
        if (!is_file($absolute)) continue;
        if ($found !== null) throw new RuntimeException('Overlapping mounts.');
        $kind = sandboxPolicy($path);
        if (!in_array($kind, ['file', 'sqlite'], true)) continue;
        $found = ['absolute'=>$absolute, 'kind'=>$kind];
    }
    return $found;
}

/** SQLite's backup API includes committed WAL data and all tables/receipts. */
function sandboxSqliteCopy(string $source): string
{
    if (!class_exists('SQLite3')) throw new RuntimeException('PHP sqlite3 extension is required.');
    $temp = tempnam(sys_get_temp_dir(), 'dnd-capture-');
    if ($temp === false) throw new RuntimeException('Private temporary storage unavailable.');
    @chmod($temp, 0600);
    register_shutdown_function(static function () use ($temp): void { if (is_file($temp)) @unlink($temp); });
    try {
        $input = new SQLite3($source, SQLITE3_OPEN_READONLY);
        $input->enableExceptions(true);
        $input->busyTimeout(5000);
        $output = new SQLite3($temp);
        $output->enableExceptions(true);
        if (!$input->backup($output)) throw new RuntimeException('SQLite backup failed.');
        if ($output->querySingle('PRAGMA quick_check') !== 'ok') throw new RuntimeException('SQLite integrity check failed.');
        $output->close(); $input->close();
        return $temp;
    } catch (Throwable $error) {
        unset($output, $input);
        @unlink($temp);
        throw $error;
    }
}

function sandboxFingerprint(array $entry): array
{
    $path = $entry['kind'] === 'sqlite' ? sandboxSqliteCopy($entry['absolute']) : $entry['absolute'];
    try {
        $hash = hash_file('sha256', $path); $size = filesize($path);
        if ($hash === false || $size === false) throw new RuntimeException('Unable to fingerprint a file.');
        return ['kind'=>$entry['kind'], 'sha256'=>$hash, 'size'=>$size];
    } finally {
        if ($entry['kind'] === 'sqlite') @unlink($path);
    }
}

function sandboxManifest(array $roots, array $config): array
{
    $inventory = sandboxInventory($roots); $entries = [];
    foreach ($inventory['files'] as $path => $entry) $entries[$path] = sandboxFingerprint($entry);
    $issues = $inventory['unreviewed'];
    foreach (['dnd/data/characters.json', 'dnd/character_sheet/data/character_sheets.json', 'dnd/vtt/storage/sync-v2.sqlite', 'dnd/vtt/storage/scenes.json', 'dnd/vtt/storage/tokens.json'] as $required) {
        if (!isset($entries[$required])) $issues[] = ['path'=>$required, 'reason'=>'required-runtime-store-missing'];
    }
    // No implicit JSON fallback: this choice must reflect the deployed hex storage.
    if (($config['hex_storage'] ?? 'unreviewed') !== 'json') {
        $issues[] = ['path'=>'dnd/includes/hex-data-manager.php', 'reason'=>'mysql-or-unreviewed-hex-storage: requires a separate scoped database export/import'];
    }
    if (getenv('VTT_PLAYER_ROSTER_PATH')) {
        $issues[] = ['path'=>'dnd/vtt/config/player-roster.json', 'reason'=>'external-player-roster-override: must be mapped before sandbox use'];
    }
    return [
        'schema'=>'gmscreen-sandbox-capture/v1', 'generated_at'=>gmdate('c'),
        'files'=>$entries, 'excluded'=>$inventory['excluded'], 'issues'=>$issues,
        'environment'=>['php'=>PHP_VERSION, 'world_id'=>getenv('VTT_SYNC_V2_WORLD_ID') ?: 'default'],
        'consistency'=>'Per-database SQLite snapshots; file hashes checked before and after download. Not a globally atomic site backup. Capture while the game is idle.',
        'limitations'=>['Browser-only IndexedDB/localStorage and remote media are not stored in this server capture.', 'Code is fingerprinted, not downloaded. Private configuration and backups are excluded.'],
    ];
}
