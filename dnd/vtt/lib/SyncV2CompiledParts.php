<?php

declare(strict_types=1);

/**
 * A scene's large design parts (ground heights, walls), ready-unpacked.
 *
 * Every board command reads the whole world. On November 24, 2026 the live world was 5.8 MB of JSON, 4.0 MB of it
 * the ground and walls of six scenes, and unpacking that took most of a command's half second, although a command
 * almost never changes a design (two did that whole evening, of 1,539).
 *
 * A part's text is therefore also kept as a small PHP file that returns the same array. PHP's own cache of compiled
 * files (opcache) holds such an array ready in memory shared by every request, so loading it costs next to nothing.
 * Nothing that reads the world can tell the difference: unpack() returns exactly what json_decode returned for that
 * text the first time, and the file is named for the text, so a changed part is simply a different file.
 *
 * It is only ever a shortcut. Where opcache is off, the folder cannot be written, or a file is not in the cache yet,
 * the text is unpacked as before. Files are written and compiled when the request ends, one per request, so a world
 * seen for the first time is taken over a handful of requests and none of them is held up for long.
 *
 * The files live beside the database in `compiled-parts/`: one per stored part, an older version removed when a
 * newer one is kept, all of a part's files removed with its row. The folder can be deleted at any time.
 */
final class SyncV2CompiledParts
{
    /** A part shorter than this is unpacked from its text: there is too little to gain. */
    private const SMALLEST = 32768;
    /** opcache will not take a file changed in the last moments (opcache.file_update_protection, 2 s unless set). */
    private const SETTLE_SECONDS = 5;
    /** An older version of a part is left this long, for a request still reading the world as it was. */
    private const KEEP_OLD_SECONDS = 60;
    /** When the cache turned out not to take our files, it is left alone this long before trying again. */
    private const OFF_SECONDS = 3600;
    /** A file compiled less than this long ago and already gone from the cache: the cache is not being kept. */
    private const LOST_SOON_SECONDS = 120;
    /** That many such losses within OFF_SECONDS, and the shortcut is switched off. */
    private const LOSSES_ALLOWED = 3;

    private string $folder;
    private string $worldId;
    private bool $on;
    private int $smallest;
    private int $settle;
    /** file => [prefix, value]: parts unpacked from text in this request, to be kept when it ends. */
    private array $pending = [];
    private bool $registered = false;
    /** One file written or compiled per request, whatever the number of stores. */
    private static bool $workedThisRequest = false;
    /** Large parts in this request: how many came ready-unpacked, how many were unpacked from their text. */
    private static int $ready = 0;
    private static int $fromText = 0;

    /** [came ready-unpacked, unpacked from text] for the large parts read in this request. */
    public static function tally(): array
    {
        return [self::$ready, self::$fromText];
    }

    public function __construct(string $databasePath, string $worldId)
    {
        $this->worldId = $worldId;
        $this->folder = $databasePath === '' ? '' : dirname($databasePath) . DIRECTORY_SEPARATOR . 'compiled-parts';
        $smallest = getenv('VTT_SYNC_V2_COMPILED_PARTS_MIN');
        $settle = getenv('VTT_SYNC_V2_COMPILED_PARTS_SETTLE');
        $this->smallest = is_string($smallest) && ctype_digit($smallest) ? (int) $smallest : self::SMALLEST;
        $this->settle = is_string($settle) && ctype_digit($settle) ? (int) $settle : self::SETTLE_SECONDS;
        $this->on = $this->folder !== '' && self::available() && !$this->switchedOff();
    }

    /** Whether this PHP can hold compiled files in shared memory and we are allowed to ask it. */
    public static function available(): bool
    {
        if (getenv('VTT_SYNC_V2_COMPILED_PARTS') === '0') {
            return false;
        }
        if (!function_exists('opcache_is_script_cached') || !function_exists('opcache_compile_file')) {
            return false;
        }
        if (!filter_var(ini_get('opcache.enable'), FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }
        if (PHP_SAPI === 'cli' && !filter_var(ini_get('opcache.enable_cli'), FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }
        return in_array('xxh128', hash_algos(), true);
    }

    public function isOn(): bool
    {
        return $this->on;
    }

    /**
     * The array for a stored part's text. `$decode` is the caller's own unpacking of the text; what this returns
     * is identical to its result.
     */
    public function unpack(string $sceneId, string $part, string $json, callable $decode): array
    {
        if (!$this->on || strlen($json) < $this->smallest) {
            return $decode($json);
        }
        $prefix = $this->prefix($sceneId, $part);
        $file = $this->folder . DIRECTORY_SEPARATOR . $prefix . '-' . hash('xxh128', $json) . '-' . strlen($json) . '.php';
        if (opcache_is_script_cached($file)) {
            try {
                $value = include $file;
            } catch (Throwable $error) {
                $value = null;
            }
            if (is_array($value)) {
                self::$ready++;
                return $value;
            }
        }
        self::$fromText++;
        $value = $decode($json);
        $this->pending[$file] = [$prefix, $value];
        if (!$this->registered) {
            $this->registered = true;
            register_shutdown_function([$this, 'keep']);
        }
        return $value;
    }

    /** A part's row is gone (its scene was deleted, or the design no longer has that part): so are its files. */
    public function drop(string $sceneId, string $part): void
    {
        if (!$this->on) {
            return;
        }
        foreach (glob($this->folder . DIRECTORY_SEPARATOR . $this->prefix($sceneId, $part) . '-*.php') ?: [] as $file) {
            $this->remove($file);
        }
    }

    /**
     * At the end of the request: one part that was unpacked from its text is written as a file, or, if its file is
     * already there and has settled, handed to opcache. Public for the shutdown hook and for tests.
     */
    public function keep(): void
    {
        $pending = $this->pending;
        $this->pending = [];
        if (!$this->on || self::$workedThisRequest) {
            return;
        }
        foreach ($pending as $file => [$prefix, $value]) {
            try {
                if (is_file($file)) {
                    if (time() - (int) @filemtime($file) < $this->settle) {
                        continue;                                  // too fresh for opcache to take: a later request
                    }
                    self::$workedThisRequest = true;
                    // Where every request starts with an empty cache (some hosts run PHP that way), compiling again
                    // each time would cost more than unpacking the text ever did. A file that was compiled moments
                    // ago and is already gone counts against the shortcut, and after a few it is switched off.
                    $compiledAt = (int) @filemtime($file . '.ok');
                    if ($compiledAt > 0 && time() - $compiledAt < self::LOST_SOON_SECONDS && $this->lossesSoFar() + 1 >= self::LOSSES_ALLOWED) {
                        $this->switchOff();
                        return;
                    }
                    if (!@opcache_compile_file($file) || !opcache_is_script_cached($file)) {
                        $this->switchOff();                       // this PHP will not hold our files: stop asking for a while
                        return;
                    }
                    @touch($file . '.ok');
                    return;
                }
                self::$workedThisRequest = true;
                $this->write($file, $prefix, $value);
                return;
            } catch (Throwable $error) {
                error_log('[VTT] A compiled design part could not be kept: ' . $error->getMessage());
                return;
            }
        }
    }

    /** For tests: let the next keep() in this process do its one piece of work. */
    public static function allowWorkAgain(): void
    {
        self::$workedThisRequest = false;
    }

    /** PHP source that evaluates to exactly `$value` (arrays of arrays, strings, numbers, booleans and null). */
    public static function export($value): string
    {
        $precision = ini_get('serialize_precision');
        ini_set('serialize_precision', '-1');                      // floats written so that they read back the same
        try {
            return self::exportValue($value);
        } finally {
            if ($precision !== false) {
                ini_set('serialize_precision', (string) $precision);
            }
        }
    }

    private static function exportValue($value): string
    {
        if (!is_array($value)) {
            if (is_object($value) || is_resource($value)) {
                throw new InvalidArgumentException('Only plain data can be kept as a compiled part.');
            }
            if (is_float($value) && !is_finite($value)) {
                throw new InvalidArgumentException('A number that is not finite cannot be kept as a compiled part.');
            }
            return var_export($value, true);
        }
        $items = [];
        if (array_is_list($value)) {
            foreach ($value as $item) {
                $items[] = self::exportValue($item);
            }
        } else {
            foreach ($value as $key => $item) {
                $items[] = var_export($key, true) . '=>' . self::exportValue($item);
            }
        }
        return '[' . implode(',', $items) . ']';
    }

    private function write(string $file, string $prefix, array $value): void
    {
        if (!is_dir($this->folder)) {
            if (!@mkdir($this->folder, 0775, true) && !is_dir($this->folder)) {
                $this->on = false;
                return;
            }
            // Nobody outside may ask for these files: the two lines storage/backups/.htaccess uses, which the host accepts.
            @file_put_contents($this->folder . DIRECTORY_SEPARATOR . '.htaccess', "Order deny,allow\nDeny from all\n");
        }
        $temporary = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
        if (@file_put_contents($temporary, '<?php return ' . self::export($value) . ';') === false) {
            @unlink($temporary);
            return;
        }
        if (!@rename($temporary, $file)) {
            @unlink($temporary);
            return;
        }
        // An older version of the same part, once no request can still be reading the world it belonged to.
        foreach (glob($this->folder . DIRECTORY_SEPARATOR . $prefix . '-*.php') ?: [] as $other) {
            if ($other !== $file && time() - (int) @filemtime($other) >= self::KEEP_OLD_SECONDS) {
                $this->remove($other);
            }
        }
        // A write that was cut short leaves a .tmp behind: an hour old, it is nobody's.
        foreach (glob($this->folder . DIRECTORY_SEPARATOR . '*.tmp') ?: [] as $stray) {
            if (time() - (int) @filemtime($stray) >= 3600) {
                @unlink($stray);
            }
        }
    }

    private function remove(string $file): void
    {
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate($file, true);
        }
        @unlink($file);
        @unlink($file . '.ok');
    }

    /** Counts one more file lost from the cache soon after it was compiled; returns how many there were before. */
    private function lossesSoFar(): int
    {
        $tally = $this->folder . DIRECTORY_SEPARATOR . 'losses';
        $before = is_file($tally) && time() - (int) @filemtime($tally) < self::OFF_SECONDS ? (int) @filesize($tally) : 0;
        @file_put_contents($tally, str_repeat('x', $before + 1));
        return $before;
    }

    private function prefix(string $sceneId, string $part): string
    {
        return substr(sha1($this->worldId . "\n" . $sceneId . "\n" . $part), 0, 20);
    }

    private function switchedOff(): bool
    {
        $marker = $this->folder . DIRECTORY_SEPARATOR . 'off';
        return is_file($marker) && time() - (int) @filemtime($marker) < self::OFF_SECONDS;
    }

    private function switchOff(): void
    {
        $this->on = false;
        @touch($this->folder . DIRECTORY_SEPARATOR . 'off');
        @unlink($this->folder . DIRECTORY_SEPARATOR . 'losses');
    }
}
