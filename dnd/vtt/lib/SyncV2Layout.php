<?php

declare(strict_types=1);

/**
 * Where a Sync V2 world is kept inside the database file.
 *
 * `single` is the first layout: the whole world is one JSON text in one row of vtt_world_state,
 * and every command packs and rewrites all of it. On a campaign with large maps nearly all of
 * that time went on the ground heights of maps the command never touched.
 *
 * `split` keeps the same world in smaller sections. Each part of a scene's map design (ground,
 * walls and floors, zones, the exploration marker) has its own row in vtt_state_parts, and the
 * rest is one light row in vtt_state_main. A command still reads all of it, exactly as before,
 * and writes back the light row plus only the parts it changed.
 *
 * Nothing outside this class can tell the layouts apart: read() returns the same array either
 * way, and the carry-over refuses to finish unless what it reads back is identical to what it
 * started from.
 *
 * In `split`, the old row in vtt_world_state stays as it was on the day of the carry-over and a
 * trigger refuses every update to it. An older copy of the site's code that is still running
 * during a deploy can therefore read a whole world but cannot write one the old way.
 */
final class SyncV2Layout
{
    public const SINGLE = 'single';
    public const SPLIT = 'split';

    /** Stands in the light row where a part of a design was taken out to its own row. */
    private const STORED_APART = ['__storedApart' => true];
    /** After a carry-over that could not be made, it is not tried again for this long. */
    private const RETRY_AFTER_MS = 600000;
    private const FROZEN_MESSAGE = 'This world is kept in the split layout now; its old row cannot be changed. Reload the page.';

    private PDO $pdo;
    private string $worldId;
    private string $databasePath;
    private string $layout = self::SINGLE;
    /** [sceneId][part] => the entry as last read or written; null when not known. */
    private ?array $partsKnown = null;
    /** [sceneId][part] => true for every part row in the table; null when not known. */
    private ?array $partRows = null;

    public function __construct(PDO $pdo, string $worldId, string $databasePath)
    {
        $this->pdo = $pdo;
        $this->worldId = $worldId;
        $this->databasePath = $databasePath;
    }

    /** Run once vtt_world_state exists. */
    public function createTables(): void
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS vtt_meta (
            world_id TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL,
            PRIMARY KEY (world_id, name))');
        // updated_at stands before the JSON so that reading it never reaches the JSON's pages.
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS vtt_state_main (
            world_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL CHECK (revision >= 0),
            updated_at INTEGER NOT NULL,
            state_json TEXT NOT NULL)');
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS vtt_state_parts (
            world_id TEXT NOT NULL, scene_id TEXT NOT NULL, part TEXT NOT NULL, state_json TEXT NOT NULL,
            PRIMARY KEY (world_id, scene_id, part))');
        $this->pdo->exec("CREATE TRIGGER IF NOT EXISTS vtt_world_state_frozen
            BEFORE UPDATE ON vtt_world_state
            WHEN EXISTS (SELECT 1 FROM vtt_meta WHERE world_id = OLD.world_id AND name = 'layout' AND value = 'split')
            BEGIN SELECT RAISE(ABORT, '" . self::FROZEN_MESSAGE . "'); END");
    }

    /**
     * Decide the layout for this request. A world nobody has decided for yet is carried over to
     * `split`; if that cannot be done the world stays `single` and the reason is recorded.
     */
    public function settle(): void
    {
        $chosen = $this->meta('layout');
        if ($chosen === self::SPLIT || $chosen === self::SINGLE) {
            $this->layout = $chosen;
            return;
        }
        $this->layout = self::SINGLE;
        $failedAt = (int) ($this->meta('split_failed_at') ?? 0);
        if ($failedAt > 0 && $this->now() - $failedAt < self::RETRY_AFTER_MS) {
            return;
        }
        try {
            $this->carryOver();
        } catch (Throwable $error) {
            $this->layout = self::SINGLE;
            $this->forget();
            $this->recordFailure($error);
        }
    }

    public function layout(): string
    {
        return $this->layout;
    }

    /** @return array{revision:int, serverTime:int} */
    public function revision(bool $withTime = true): array
    {
        $table = $this->layout === self::SPLIT ? 'vtt_state_main' : 'vtt_world_state';
        // In the first layout updated_at follows the large JSON column, so it is asked for only when wanted.
        $statement = $this->pdo->prepare(
            ($withTime ? 'SELECT revision, updated_at' : 'SELECT revision') . " FROM {$table} WHERE world_id = :world_id"
        );
        $statement->execute(['world_id' => $this->worldId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new RuntimeException('Sync V2 world state is unavailable.');
        }
        return ['revision' => max(0, (int) $row['revision']), 'serverTime' => (int) ($row['updated_at'] ?? 0)];
    }

    /**
     * The whole world, the same array in either layout.
     * @return array{revision:int, state:array, serverTime:int}
     */
    public function read(): array
    {
        if ($this->layout !== self::SPLIT) {
            $this->forget();
            return $this->readSingle();
        }
        $statement = $this->pdo->prepare('SELECT revision, updated_at, state_json FROM vtt_state_main WHERE world_id = :world_id');
        $statement->execute(['world_id' => $this->worldId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new RuntimeException('Sync V2 world state is unavailable.');
        }
        $state = $this->decode((string) $row['state_json']);
        $rows = [];
        $read = [];
        $statement = $this->pdo->prepare('SELECT scene_id, part, state_json FROM vtt_state_parts WHERE world_id = :world_id');
        $statement->execute(['world_id' => $this->worldId]);
        while (is_array($part = $statement->fetch())) {
            $rows[(string) $part['scene_id']][(string) $part['part']] = (string) $part['state_json'];
        }
        $present = [];
        foreach ($rows as $sceneId => $parts) {
            foreach ($parts as $name => $json) {
                $present[$sceneId][$name] = true;
            }
        }
        if (isset($state['sceneConfig']) && is_array($state['sceneConfig'])) {
            foreach ($state['sceneConfig'] as $sceneId => $config) {
                if (!is_array($config) || !isset($config['environment']) || !is_array($config['environment'])) {
                    continue;
                }
                foreach ($config['environment'] as $name => $entry) {
                    if ($entry !== self::STORED_APART) {
                        continue;
                    }
                    $json = $rows[(string) $sceneId][(string) $name] ?? null;
                    if ($json === null) {
                        // Never carry on without a design: movement rules read a missing design as "no walls".
                        throw new RuntimeException("A stored part of a scene's design is missing ({$sceneId}, {$name}).");
                    }
                    $decoded = $this->decode($json);
                    $state['sceneConfig'][$sceneId]['environment'][$name] = $decoded;
                    $read[(string) $sceneId][(string) $name] = $decoded;
                }
            }
        }
        $this->partsKnown = $read;
        $this->partRows = $present;
        return [
            'revision' => max(0, (int) $row['revision']),
            'state' => $state,
            'serverTime' => (int) $row['updated_at'],
        ];
    }

    /**
     * Save the whole world. In `split` only the light row and the parts that changed are written,
     * and the world is returned exactly as a read would now return it (packing turns a whole-number
     * float into an integer, so that is not always the very array that was passed in). Null in `single`.
     */
    public function write(int $revision, array $state, int $serverTime): ?array
    {
        if ($this->layout !== self::SPLIT) {
            $this->forget();
            $statement = $this->pdo->prepare(
                'UPDATE vtt_world_state
                 SET revision = :revision, state_json = :state_json, updated_at = :updated_at
                 WHERE world_id = :world_id'
            );
            $statement->execute([
                'revision' => $revision,
                'state_json' => $this->encode($state),
                'updated_at' => $serverTime,
                'world_id' => $this->worldId,
            ]);
            return null;
        }
        return $this->writeSplit($revision, $state, $serverTime, false);
    }

    /** Drop what is remembered of the stored parts, after a rollback or a failure. */
    public function forget(): void
    {
        $this->partsKnown = null;
        $this->partRows = null;
    }

    /**
     * Put the world back into the first layout, in place, and keep it there until asked otherwise.
     * The code then reads and writes vtt_world_state exactly as it did before the split existed.
     */
    public function makeSingle(): array
    {
        if ($this->layout !== self::SPLIT) {
            $this->setMeta('layout', self::SINGLE);
            return $this->status();
        }
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $world = $this->read();
            // The layout is changed first, inside the same transaction, so the trigger lets the old row be written.
            $this->setMeta('layout', self::SINGLE);
            $statement = $this->pdo->prepare(
                'UPDATE vtt_world_state SET revision = :revision, state_json = :state_json, updated_at = :updated_at WHERE world_id = :world_id'
            );
            $statement->execute([
                'revision' => $world['revision'],
                'state_json' => $this->encode($world['state']),
                'updated_at' => $world['serverTime'],
                'world_id' => $this->worldId,
            ]);
            if ($statement->rowCount() !== 1) {
                throw new RuntimeException('The old row is missing, so the world cannot be put back into it.');
            }
            $this->layout = self::SINGLE;
            $back = $this->readSingle();
            if ($back['revision'] !== $world['revision'] || $back['state'] !== $world['state']) {
                throw new RuntimeException('The world did not read back the same from the first layout.');
            }
            $this->deleteRows();
            $this->setMeta('single_at', (string) $this->now());
            $this->pdo->exec('COMMIT');
        } catch (Throwable $error) {
            $this->rollBack();
            $this->layout = self::SPLIT;
            $this->forget();
            throw $error;
        }
        $this->forget();
        return $this->status();
    }

    /** Carry the world over to the split layout now, with a fresh dated copy first. */
    public function makeSplit(): array
    {
        if ($this->layout === self::SPLIT) {
            return $this->status();
        }
        $this->clearMeta('layout');
        try {
            $this->carryOver();
        } catch (Throwable $error) {
            // Asked for by a person, so it stays where it was rather than trying again by itself.
            $this->setMeta('layout', self::SINGLE);
            $this->layout = self::SINGLE;
            $this->forget();
            $this->recordFailure($error);
            throw $error;
        }
        return $this->status();
    }

    /** What the Director is shown about where the world is kept. */
    public function status(): array
    {
        $failedAt = (int) ($this->meta('split_failed_at') ?? 0);
        return [
            'layout' => $this->layout,
            'keptSingleOnRequest' => $this->layout === self::SINGLE && $this->meta('layout') === self::SINGLE,
            'splitAt' => (int) ($this->meta('split_at') ?? 0) ?: null,
            'splitFromRevision' => $this->meta('split_from_revision') !== null ? (int) $this->meta('split_from_revision') : null,
            'copyFile' => $this->meta('split_copy'),
            'lastFailure' => $failedAt > 0 ? ['at' => $failedAt, 'reason' => (string) $this->meta('split_failed_reason')] : null,
        ];
    }

    // ---- the carry-over -------------------------------------------------------

    private function carryOver(): void
    {
        $onDisk = $this->databasePath !== '' && $this->databasePath !== ':memory:' && is_file($this->databasePath);
        $lock = null;
        // A world nobody has written to yet has nothing to protect: no copy, so no lock either.
        if ($onDisk && $this->revisionOfOldRow() > 0) {
            // Its name holds ".sqlite", so the folder's keep-out rule covers it.
            $lock = @fopen($this->databasePath . '.split.lock', 'c');
            if ($lock === false || !flock($lock, LOCK_EX)) {
                throw new RuntimeException('The carry-over could not take its lock.');
            }
        }
        try {
            if ($this->meta('layout') === self::SPLIT) {
                $this->layout = self::SPLIT;   // another request did it while this one waited
                return;
            }
            $copy = null;
            if ($onDisk && $this->revisionOfOldRow() > 0) {
                $copy = $this->writeDatedCopy();
            }
            $this->pdo->exec('BEGIN IMMEDIATE');
            try {
                if ($this->meta('layout') !== null) {
                    throw new RuntimeException('The layout was decided while the carry-over was starting.');
                }
                $this->layout = self::SINGLE;
                $world = $this->readSingle();
                $this->deleteRows();
                $insert = $this->pdo->prepare('INSERT INTO vtt_state_main (world_id, revision, updated_at, state_json) VALUES (:world_id, 0, 0, :state_json)');
                $insert->execute(['world_id' => $this->worldId, 'state_json' => '{}']);
                $this->forget();
                $this->writeSplit($world['revision'], $world['state'], $world['serverTime'], true);
                $this->layout = self::SPLIT;
                $this->forget();
                $back = $this->read();
                if ($back['revision'] !== $world['revision'] || $back['serverTime'] !== $world['serverTime']) {
                    throw new RuntimeException('The revision did not read back the same after the carry-over.');
                }
                if ($back['state'] !== $world['state'] || $this->encode($back['state']) !== $this->encode($world['state'])) {
                    throw new RuntimeException('The world did not read back the same after the carry-over.');
                }
                $this->setMeta('layout', self::SPLIT);
                $this->setMeta('split_at', (string) $this->now());
                $this->setMeta('split_from_revision', (string) $world['revision']);
                if ($copy !== null) {
                    $this->setMeta('split_copy', $copy);
                }
                $this->clearMeta('split_failed_at');
                $this->clearMeta('split_failed_reason');
                $this->pdo->exec('COMMIT');
            } catch (Throwable $error) {
                $this->rollBack();
                $this->layout = self::SINGLE;
                $this->forget();
                throw $error;
            }
        } finally {
            if (is_resource($lock)) {
                flock($lock, LOCK_UN);
                fclose($lock);
            }
        }
    }

    /** A whole, checked copy of the database beside it, named with the date. Returns the file's name. */
    private function writeDatedCopy(): string
    {
        $source = $this->databasePath;
        $directory = dirname($source);
        $size = (int) filesize($source) + (is_file($source . '-wal') ? (int) filesize($source . '-wal') : 0);
        $free = @disk_free_space($directory);
        if (is_float($free) && $free < $size * 2 + 16 * 1048576) {
            throw new RuntimeException(sprintf(
                'Not enough room on the disk for the safety copy: %d MB free, about %d MB needed.',
                (int) ($free / 1048576),
                (int) (($size * 2 + 16 * 1048576) / 1048576)
            ));
        }
        $stem = preg_replace('/\.sqlite$/i', '', basename($source));
        $stamp = gmdate('Ymd-His');
        $final = $directory . DIRECTORY_SEPARATOR . $stem . '.before-split-' . $stamp . '.sqlite';
        // Never write over an earlier copy: two made within the same second get different names.
        for ($n = 2; file_exists($final); $n++) {
            $final = $directory . DIRECTORY_SEPARATOR . $stem . '.before-split-' . $stamp . '-' . $n . '.sqlite';
        }
        $partial = $final . '.part';
        foreach (glob($directory . DIRECTORY_SEPARATOR . $stem . '.before-split-*.sqlite.part') ?: [] as $stale) {
            @unlink($stale);
        }
        if (function_exists('set_time_limit')) {
            @set_time_limit(180);
        }
        try {
            try {
                $this->pdo->exec('VACUUM INTO ' . $this->pdo->quote($partial));
            } catch (Throwable $first) {
                @unlink($partial);
                if (!class_exists('SQLite3')) {
                    throw $first;
                }
                $input = new SQLite3($source, SQLITE3_OPEN_READONLY);
                $input->enableExceptions(true);
                $input->busyTimeout(5000);
                $output = new SQLite3($partial);
                $output->enableExceptions(true);
                $copied = $input->backup($output);
                $output->close();
                $input->close();
                if (!$copied) {
                    throw new RuntimeException('The safety copy could not be written.');
                }
            }
            $check = new PDO('sqlite:' . $partial, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $sound = $check->query('PRAGMA quick_check')->fetchColumn() === 'ok';
            $statement = $check->prepare('SELECT COUNT(*) FROM vtt_world_state WHERE world_id = :world_id');
            $statement->execute(['world_id' => $this->worldId]);
            $holdsWorld = (int) $statement->fetchColumn() === 1;
            $statement = null;
            $check = null;
            if (!$sound || !$holdsWorld) {
                throw new RuntimeException('The safety copy did not pass its check.');
            }
            if (!rename($partial, $final)) {
                throw new RuntimeException('The safety copy could not be given its name.');
            }
        } catch (Throwable $error) {
            @unlink($partial);
            throw $error;
        }
        return basename($final);
    }

    // ---- reading and writing ---------------------------------------------------

    private function readSingle(): array
    {
        $statement = $this->pdo->prepare('SELECT revision, state_json, updated_at FROM vtt_world_state WHERE world_id = :world_id');
        $statement->execute(['world_id' => $this->worldId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new RuntimeException('Sync V2 world state is unavailable.');
        }
        return [
            'revision' => max(0, (int) $row['revision']),
            'state' => $this->decode((string) $row['state_json']),
            'serverTime' => (int) $row['updated_at'],
        ];
    }

    private function writeSplit(int $revision, array $state, int $serverTime, bool $everyPart): array
    {
        $main = $state;
        $present = [];
        $kept = [];
        $upsert = null;
        if (isset($state['sceneConfig']) && is_array($state['sceneConfig'])) {
            foreach ($state['sceneConfig'] as $sceneId => $config) {
                if (!is_array($config) || !isset($config['environment']) || !is_array($config['environment'])) {
                    continue;
                }
                $scene = (string) $sceneId;
                foreach ($config['environment'] as $name => $entry) {
                    if (!is_array($entry)) {
                        continue;
                    }
                    if ($entry === self::STORED_APART) {
                        throw new LogicException('A design part was about to be saved as its own stand-in.');
                    }
                    $part = (string) $name;
                    $main['sceneConfig'][$sceneId]['environment'][$name] = self::STORED_APART;
                    $present[$scene][$part] = true;
                    // An array nobody changed is still the very one that was read, so this costs nothing for it.
                    $unchanged = !$everyPart && $this->partsKnown !== null
                        && isset($this->partRows[$scene][$part])
                        && array_key_exists($part, $this->partsKnown[$scene] ?? [])
                        && $this->partsKnown[$scene][$part] === $entry;
                    if ($unchanged) {
                        $kept[$scene][$part] = $this->partsKnown[$scene][$part];
                        continue;
                    }
                    $upsert ??= $this->pdo->prepare(
                        'INSERT INTO vtt_state_parts (world_id, scene_id, part, state_json) VALUES (:world_id, :scene_id, :part, :state_json)
                         ON CONFLICT(world_id, scene_id, part) DO UPDATE SET state_json = excluded.state_json'
                    );
                    $json = $this->encode($entry);
                    $upsert->execute(['world_id' => $this->worldId, 'scene_id' => $scene, 'part' => $part, 'state_json' => $json]);
                    $kept[$scene][$part] = $this->decode($json);
                }
            }
        }
        // The rows are exactly the parts the world holds: a part or a scene that is gone loses its row.
        $rows = $this->partRows ?? $this->listPartRows();
        $delete = null;
        foreach ($rows as $scene => $parts) {
            foreach ($parts as $part => $unused) {
                if (isset($present[(string) $scene][(string) $part])) {
                    continue;
                }
                $delete ??= $this->pdo->prepare('DELETE FROM vtt_state_parts WHERE world_id = :world_id AND scene_id = :scene_id AND part = :part');
                $delete->execute(['world_id' => $this->worldId, 'scene_id' => (string) $scene, 'part' => (string) $part]);
            }
        }
        $statement = $this->pdo->prepare(
            'UPDATE vtt_state_main SET revision = :revision, updated_at = :updated_at, state_json = :state_json WHERE world_id = :world_id'
        );
        $mainJson = $this->encode($main);
        $statement->execute([
            'revision' => $revision,
            'updated_at' => $serverTime,
            'state_json' => $mainJson,
            'world_id' => $this->worldId,
        ]);
        if ($statement->rowCount() !== 1) {
            throw new RuntimeException('Sync V2 world state is unavailable.');
        }
        $this->partsKnown = $kept;
        $this->partRows = $present;
        // The world as a read would return it now: the light row unpacked from the text just saved,
        // each part either the one read earlier or unpacked from the text just saved.
        $saved = $this->decode($mainJson);
        foreach ($kept as $scene => $parts) {
            foreach ($parts as $part => $entry) {
                $saved['sceneConfig'][$scene]['environment'][$part] = $entry;
            }
        }
        return $saved;
    }

    private function listPartRows(): array
    {
        $rows = [];
        $statement = $this->pdo->prepare('SELECT scene_id, part FROM vtt_state_parts WHERE world_id = :world_id');
        $statement->execute(['world_id' => $this->worldId]);
        while (is_array($row = $statement->fetch())) {
            $rows[(string) $row['scene_id']][(string) $row['part']] = true;
        }
        return $rows;
    }

    private function deleteRows(): void
    {
        foreach (['vtt_state_parts', 'vtt_state_main'] as $table) {
            $statement = $this->pdo->prepare("DELETE FROM {$table} WHERE world_id = :world_id");
            $statement->execute(['world_id' => $this->worldId]);
        }
    }

    private function revisionOfOldRow(): int
    {
        $statement = $this->pdo->prepare('SELECT revision FROM vtt_world_state WHERE world_id = :world_id');
        $statement->execute(['world_id' => $this->worldId]);
        $revision = $statement->fetchColumn();
        if ($revision === false) {
            throw new RuntimeException('Sync V2 world state is unavailable.');
        }
        return max(0, (int) $revision);
    }

    // ---- small things ----------------------------------------------------------

    private function recordFailure(Throwable $error): void
    {
        try {
            $this->setMeta('split_failed_at', (string) $this->now());
            // A database error leads with its code ("SQLSTATE[23000]: ...: 19 "); the Director is shown the words after it.
            $reason = preg_replace('/^SQLSTATE\[\w+\]:?[^:]*:\s*\d+\s*/', '', $error->getMessage()) ?? $error->getMessage();
            $this->setMeta('split_failed_reason', substr($reason, 0, 300));
        } catch (Throwable $ignored) {
            // The world keeps running the first way; the next request will try to say why again.
        }
    }

    private function meta(string $name): ?string
    {
        $statement = $this->pdo->prepare('SELECT value FROM vtt_meta WHERE world_id = :world_id AND name = :name');
        $statement->execute(['world_id' => $this->worldId, 'name' => $name]);
        $value = $statement->fetchColumn();
        return $value === false ? null : (string) $value;
    }

    private function setMeta(string $name, string $value): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO vtt_meta (world_id, name, value) VALUES (:world_id, :name, :value)
             ON CONFLICT(world_id, name) DO UPDATE SET value = excluded.value'
        );
        $statement->execute(['world_id' => $this->worldId, 'name' => $name, 'value' => $value]);
    }

    private function clearMeta(string $name): void
    {
        $statement = $this->pdo->prepare('DELETE FROM vtt_meta WHERE world_id = :world_id AND name = :name');
        $statement->execute(['world_id' => $this->worldId, 'name' => $name]);
    }

    private function rollBack(): void
    {
        try {
            $this->pdo->exec('ROLLBACK');
        } catch (Throwable $ignored) {
            // Keep the failure that led here.
        }
    }

    private function encode(array $value): string
    {
        $encoded = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded)) {
            throw new InvalidArgumentException('Value is not JSON serializable.');
        }
        return $encoded;
    }

    private function decode(string $json): array
    {
        $decoded = json_decode($json, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Stored Sync V2 JSON is invalid.');
        }
        return $decoded;
    }

    private function now(): int
    {
        return (int) floor(microtime(true) * 1000);
    }
}
