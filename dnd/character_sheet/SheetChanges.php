<?php
declare(strict_types=1);

/**
 * Changes to one character's sheet, field by field.
 *
 * Brandon, October 12, 2026: "Character sheets seem to be changing without permission ... zepha's might and
 * agility were just randomly reset to zero. and when they did a respite, i think it didnt give him back any of
 * his recoveries or something. Some weird things seem to not be syncing or staying correctly sometimes."
 *
 * The cause was one thing. Every save sent the WHOLE character as that page held it, and the whole stored
 * record was replaced with it, with no check that the page was up to date. A page left open in Edit mode, a
 * phone tab that woke up, a second device: any old copy that saved wrote its old values over newer ones, and a
 * field that was blank on that copy was stored blank.
 *
 * A page now says only what it changed, as a list of fields, and only those fields are set. A field nobody
 * touched on that page cannot be rolled back or blanked by it. Respite is worked out here from the stored
 * record, not from numbers a page worked out. Every write is noted in a change record.
 */
final class SheetChanges
{
    public const MAX_CHANGES = 400;
    public const MAX_DEPTH = 8;

    /**
     * The counters: numbers that go up and down in play, changed from the sheet page, the map's side panel, a
     * token and ability automation alike. Each of those holds a copy, and a copy can be behind. So a counter is
     * never told "be 7": it is told "one more" or "five fewer", and that is added to the number stored here.
     * Two pages that each take one off take two off, whichever of them was behind.
     */
    public const COUNTERS = ['hero.surges', 'hero.victories', 'hero.vitals.currentRecoveries', 'hero.vitals.currentStamina', 'hero.resource.value'];

    /** A list of {path: [..], value} as a page sends it, checked. Throws on anything else. */
    public static function read($raw): array
    {
        if (!is_array($raw) || !array_is_list($raw)) throw new InvalidArgumentException('Changes must be a list.');
        if (count($raw) > self::MAX_CHANGES) throw new InvalidArgumentException('Too many changes in one save.');
        $changes = [];
        foreach ($raw as $change) {
            $path = is_array($change) ? ($change['path'] ?? null) : null;
            if (!is_array($change) || !array_key_exists('value', $change) || !is_array($path) || !array_is_list($path) || !$path || count($path) > self::MAX_DEPTH) {
                throw new InvalidArgumentException('A change must name a field and give its value.');
            }
            foreach ($path as $step) {
                if ((!is_string($step) && !is_int($step)) || $step === '' || (is_string($step) && (strlen($step) > 120 || in_array($step, ['__proto__', 'prototype', 'constructor'], true)))) {
                    throw new InvalidArgumentException('A change names a field that cannot be set.');
                }
            }
            // Any part of a sheet by its plain name. What begins with an underscore is the server's own (receipts).
            $top = (string) $path[0];
            if (preg_match('/^[A-Za-z][A-Za-z0-9]{0,60}$/', $top) !== 1) throw new InvalidArgumentException('That part of a sheet cannot be changed from a page.');
            if ($top === 'hero' && ($path[1] ?? null) === 'heroTokens') continue;   // the party's own, never a sheet's
            $read = ['path' => $path, 'value' => $change['value']];
            // What the page believed the number was before it changed it. Kept for a counter only.
            if (array_key_exists('from', $change) && in_array(implode('.', $path), self::COUNTERS, true)) $read['from'] = $change['from'];
            $changes[] = $read;
        }
        return $changes;
    }

    /**
     * Sets each named field on the stored sheet and returns it. A characteristic is never set to nothing: an
     * empty Might or Agility is how a blank input reads, not a score, and the stored score is kept.
     */
    public static function apply(array $sheet, array $changes): array
    {
        foreach ($changes as $change) {
            $path = $change['path']; $value = $change['value'];
            if (count($path) === 3 && $path[0] === 'hero' && $path[1] === 'stats' && ($value === '' || $value === null)) {
                $stored = $sheet['hero']['stats'][$path[2]] ?? null;
                if (is_int($stored) || is_float($stored) || (is_string($stored) && is_numeric($stored))) continue;
            }
            // A counter the page moved from one whole number to another moves the stored number by as much.
            if (array_key_exists('from', $change) && ($was = self::whole($change['from'])) !== null && ($now = self::whole($value)) !== null) {
                $sheet = self::move($sheet, implode('.', $path), $now - $was);
                continue;
            }
            $at = &$sheet;
            $last = count($path) - 1;
            foreach ($path as $index => $step) {
                if ($index === $last) { $at[$step] = $value; break; }
                if (!isset($at[$step]) || !is_array($at[$step])) $at[$step] = [];
                $at = &$at[$step];
            }
            unset($at);
        }
        return $sheet;
    }

    /** A whole number, or null: 3, 3.0 and "3" are; "", null, "3 or so" and 3.5 are not. */
    public static function whole($value): ?int
    {
        if (is_int($value)) return $value;
        if (is_float($value)) return is_finite($value) && floor($value) === $value && abs($value) < 1e12 ? (int) $value : null;
        if (is_string($value) && preg_match('/^\s*-?\d{1,12}\s*$/', $value) === 1) return (int) trim($value);
        return null;
    }

    /** The least a counter may be: nothing for most; a heroic resource that may go negative, as far as the sheet's own rule. */
    public static function floorOf(array $sheet, string $counter): ?int
    {
        if ($counter === 'hero.vitals.currentStamina') return null;                 // a dying hero is below nought
        if ($counter !== 'hero.resource.value') return 0;
        $resource = is_array($sheet['hero']['resource'] ?? null) ? $sheet['hero']['resource'] : [];
        if (empty($resource['allowNegative'])) return 0;
        return -(1 + (self::whole($sheet['hero']['stats']['reason'] ?? null) ?? 0));
    }

    /** Where a counter stands on the stored sheet (nothing stored counts as nought). */
    public static function counter(array $sheet, string $counter): int
    {
        $at = $sheet;
        foreach (explode('.', $counter) as $step) $at = is_array($at) ? ($at[$step] ?? null) : null;
        return self::whole($at) ?? 0;
    }

    /** Moves a counter by an amount from where it stands on the stored sheet, never below its least. */
    public static function move(array $sheet, string $counter, int $amount): array
    {
        if (!in_array($counter, self::COUNTERS, true)) throw new InvalidArgumentException('Not a counter: ' . $counter);
        $next = self::counter($sheet, $counter) + $amount;
        $least = self::floorOf($sheet, $counter);
        if ($least !== null && $amount < 0) $next = max($least, $next);
        $at = &$sheet;
        $steps = explode('.', $counter);
        $last = array_pop($steps);
        foreach ($steps as $step) {
            if (!isset($at[$step]) || !is_array($at[$step])) $at[$step] = [];
            $at = &$at[$step];
        }
        $at[$last] = $next;
        unset($at);
        if ($counter === 'hero.surges') $sheet['hero']['surgesUsed'] = 0;
        return $sheet;
    }

    /**
     * Temporary Stamina is its own number (hero.vitals.tempStamina, Director's ruling October 2026). Stamina above
     * the maximum, the way it used to be kept, is read as temporary Stamina: the excess moves over (keeping the higher
     * of the two) and Stamina stops at the maximum. Doing it twice changes nothing more.
     */
    public static function migrateTemp(array $sheet): array
    {
        if (!isset($sheet['hero']['vitals']) || !is_array($sheet['hero']['vitals'])) return $sheet;
        $sheet['hero']['vitals'] = self::migrateTempVitals($sheet['hero']['vitals']);
        return $sheet;
    }

    public static function migrateTempVitals(array $vitals): array
    {
        $temp = max(0, self::whole($vitals['tempStamina'] ?? null) ?? 0);
        $max = self::whole($vitals['staminaMax'] ?? null);
        $current = self::whole($vitals['currentStamina'] ?? null);
        if ($max !== null && $max > 0 && $current !== null && $current > $max) {
            $temp = max($temp, $current - $max);
            $vitals['currentStamina'] = $max;
        }
        $vitals['tempStamina'] = $temp;
        return $vitals;
    }

    /** Damage: temporary Stamina first, the rest from Stamina. */
    public static function damage(array $sheet, int $amount): array
    {
        $sheet = self::migrateTemp($sheet);
        $amount = max(0, $amount);
        $temp = max(0, self::whole($sheet['hero']['vitals']['tempStamina'] ?? null) ?? 0);
        $fromTemp = min($temp, $amount);
        $sheet['hero']['vitals']['tempStamina'] = $temp - $fromTemp;
        $sheet['hero']['vitals']['currentStamina'] = self::counter($sheet, 'hero.vitals.currentStamina') - ($amount - $fromTemp);
        return $sheet;
    }

    /** Healing: Stamina up as far as the maximum, never lowered; temporary Stamina untouched. */
    public static function heal(array $sheet, int $amount): array
    {
        $sheet = self::migrateTemp($sheet);
        $current = self::counter($sheet, 'hero.vitals.currentStamina');
        $max = self::whole($sheet['hero']['vitals']['staminaMax'] ?? null) ?? 0;
        $next = $current + max(0, $amount);
        $sheet['hero']['vitals']['currentStamina'] = $max > 0 ? max($current, min($max, $next)) : $next;
        return $sheet;
    }

    /** Gaining temporary Stamina keeps the higher of what is held and what is gained. */
    public static function gainTemp(array $sheet, int $amount): array
    {
        $sheet = self::migrateTemp($sheet);
        $sheet['hero']['vitals']['tempStamina'] = max(max(0, self::whole($sheet['hero']['vitals']['tempStamina'] ?? null) ?? 0), max(0, $amount));
        return $sheet;
    }

    /** Where temporary Stamina stands on the stored sheet. */
    public static function temp(array $sheet): int
    {
        return max(0, self::whole($sheet['hero']['vitals']['tempStamina'] ?? null) ?? 0);
    }

    /**
     * What one Recovery heals: a third of the Stamina maximum, rounded down (Draw Steel; the sheet shows the same
     * number, October 2026). A stored recovery value is used only by a sheet with no maximum to work it out from;
     * the sheet warns when the stored number is out of date.
     */
    public static function recoveryValue(array $vitals): int
    {
        $max = self::whole($vitals['staminaMax'] ?? null) ?? 0;
        if ($max > 0) return intdiv($max, 3);
        $own = self::whole(is_float($vitals['recoveryValue'] ?? null) ? floor($vitals['recoveryValue']) : ($vitals['recoveryValue'] ?? null));
        return $own !== null && $own > 0 ? $own : 0;
    }

    /**
     * Spends one Recovery, from the stored record: one fewer Recovery, and Stamina up by the recovery value, as
     * far as the maximum (never lowered), temporary Stamina untouched, and a sheet with no maximum heals the full
     * value. With no Recovery left, or nothing to heal by, nothing changes.
     */
    public static function useRecovery(array $sheet): array
    {
        $sheet = self::migrateTemp($sheet);
        $vitals = is_array($sheet['hero']['vitals'] ?? null) ? $sheet['hero']['vitals'] : [];
        $left = max(0, self::whole($vitals['currentRecoveries'] ?? null) ?? 0);
        $heals = self::recoveryValue($vitals);
        $stamina = self::whole($vitals['currentStamina'] ?? null) ?? 0;
        $answer = static fn (array $sheet, int $spent, int $stamina, int $left, string $reason = ''): array => ['sheet' => $sheet, 'spent' => $spent,
            'currentStamina' => $stamina, 'currentRecoveries' => $left, 'recoveryValue' => $heals, 'tempStamina' => self::temp($sheet), ...($reason !== '' ? ['reason' => $reason] : [])];
        if ($left < 1) return $answer($sheet, 0, $stamina, $left, 'No Recoveries left.');
        if ($heals < 1) return $answer($sheet, 0, $stamina, $left, 'This sheet has no recovery value and no Stamina maximum to work one out from.');
        $max = self::whole($vitals['staminaMax'] ?? null) ?? 0;
        $healed = $max > 0 ? max($stamina, min($max, $stamina + $heals)) : $stamina + $heals;
        $sheet['hero']['vitals']['currentRecoveries'] = $left - 1;
        $sheet['hero']['vitals']['currentStamina'] = $healed;
        return $answer($sheet, 1, $healed, $left - 1);
    }

    /**
     * A respite, from the stored record: Victories become XP, Recoveries and Stamina return to their maximums.
     * A maximum that is blank or nought restores nothing of its own and is reported, so a sheet with no
     * Recoveries maximum is not quietly set to none.
     */
    public static function respite(array $sheet): array
    {
        $hero = is_array($sheet['hero'] ?? null) ? $sheet['hero'] : [];
        $vitals = is_array($hero['vitals'] ?? null) ? $hero['vitals'] : [];
        $number = static fn ($value): ?int => (is_int($value) || is_float($value) || (is_string($value) && is_numeric(trim($value)))) ? (int) $value : null;
        $victories = max(0, $number($hero['victories'] ?? null) ?? 0);
        $notes = [];
        $hero['xp'] = max(0, $number($hero['xp'] ?? null) ?? 0) + $victories;
        $hero['victories'] = 0;
        $recoveriesMax = $number($vitals['recoveriesMax'] ?? null);
        if ($recoveriesMax !== null && $recoveriesMax > 0) $vitals['currentRecoveries'] = $recoveriesMax;
        else $notes[] = 'This sheet has no Recoveries maximum, so Recoveries were not changed.';
        $staminaMax = $number($vitals['staminaMax'] ?? null);
        if ($staminaMax !== null && $staminaMax > 0) $vitals['currentStamina'] = $staminaMax;
        else $notes[] = 'This sheet has no Stamina maximum, so Stamina was not changed.';
        $vitals['tempStamina'] = 0;   // temporary Stamina does not outlast the encounter, let alone a respite
        $hero['vitals'] = $vitals;
        $sheet['hero'] = $hero;
        return ['sheet' => $sheet, 'victories' => $victories, 'notes' => $notes];
    }

    /** Every field that differs between two copies of a sheet, as {path, from, to}. Receipts are not fields. */
    public static function differences($before, $after, array $path = [], int $limit = 200): array
    {
        $found = [];
        self::walk($before, $after, $path, $found, $limit);
        return $found;
    }

    private static function walk($before, $after, array $path, array &$found, int $limit): void
    {
        if (count($found) >= $limit) return;
        if ($path && is_string($path[0]) && str_starts_with($path[0], '_')) return;
        $bothMaps = is_array($before) && is_array($after) && !array_is_list($before) && !array_is_list($after);
        if ($bothMaps && count($path) < self::MAX_DEPTH) {
            foreach (array_unique([...array_keys($before), ...array_keys($after)]) as $key) {
                self::walk($before[$key] ?? null, $after[$key] ?? null, [...$path, $key], $found, $limit);
            }
            return;
        }
        if ($before === $after || ($before == $after && is_scalar($before) && is_scalar($after) && (string) $before === (string) $after)) return;
        if (is_array($before) && is_array($after) && json_encode($before) === json_encode($after)) return;
        $found[] = ['path' => implode('.', $path), 'from' => self::brief($before), 'to' => self::brief($after)];
    }

    /** A value small enough to keep in the record: a list or a long text is noted by its size, not its content. */
    private static function brief($value)
    {
        if (is_array($value)) return '[' . count($value) . (array_is_list($value) ? ' entries]' : ' fields]');
        if (is_string($value) && strlen($value) > 120) return substr($value, 0, 117) . '...';
        return $value;
    }

    /**
     * Notes a write in the change record beside the sheets: when, who, which request, and each field's old and
     * new value. One line of JSON a write. The file's name ends in .json so the data folder's keep-out rule
     * covers it. Past two megabytes it is kept once as the "previous" record and a new one begun.
     */
    public static function record(string $dataDir, string $who, string $action, array $before, array $after, array $characters): void
    {
        try {
            $lines = '';
            foreach ($characters as $character) {
                if (!is_string($character) || str_starts_with($character, '_')) continue;   // receipts are the server's own book-keeping
                $changed = self::differences($before[$character] ?? null, $after[$character] ?? null);
                if (!$changed) continue;
                $lines .= json_encode(['at' => gmdate('c'), 'by' => $who === '' ? 'nobody' : $who, 'request' => $action, 'character' => $character, 'changes' => $changed], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR) . "\n";
            }
            if ($lines === '') return;
            $file = $dataDir . '/sheet_changes.json';
            if (is_file($file) && filesize($file) > 2 * 1048576) @rename($file, $dataDir . '/sheet_changes_previous.json');
            @file_put_contents($file, $lines, FILE_APPEND | LOCK_EX);
        } catch (Throwable $error) {
            // The record is a help, never a reason for a save to fail.
        }
    }

    /**
     * One copy of the sheets a day, kept sixty days, beside the copies made at every write (which roll over in
     * minutes during a session). Made from the file as it stands before the day's first write.
     */
    public static function dailyCopy(string $dataDir, string $dataFile): void
    {
        try {
            if (!is_readable($dataFile) || filesize($dataFile) <= 2) return;
            $folder = $dataDir . '/backups';
            if (!is_dir($folder)) @mkdir($folder, 0755, true);
            $copy = $folder . '/daily_character_sheets_' . date('Ymd') . '.json';
            if (is_file($copy)) return;
            @copy($dataFile, $copy);
            $kept = glob($folder . '/daily_character_sheets_*.json') ?: [];
            sort($kept);
            foreach (array_slice($kept, 0, max(0, count($kept) - 60)) as $old) @unlink($old);
        } catch (Throwable $error) {
            // As above.
        }
    }
}

/**
 * Live editing of one hero's sheet by more than one person (October 2026, approved by the Director).
 *
 * Each character has a revision: a number that goes up whenever its stored sheet changes, with the revision at
 * which each field last changed. A page polls the revision (cheap: one small file) and reloads when it moved. A
 * save carries the revision the page last read; a field that somebody else changed since then is not overwritten:
 * the save is refused as stale and the page reloads. While somebody edits a field it is locked on everyone
 * else's screen ("Cal is editing"), until they leave it or 20 seconds pass with no heartbeat.
 *
 * Kept in data/sheet_live.json beside the sheets, under its own file lock (data/sheet_live.lock).
 */
final class SheetLive
{
    public const LOCK_SECONDS = 20;
    public const MAX_FIELDS = 300;

    private static function path(string $dataDir): string { return $dataDir . '/sheet_live.json'; }

    /** Runs $change on the live record under the file lock; what $change returns is returned. */
    public static function with(string $dataDir, callable $change)
    {
        if (!is_dir($dataDir)) @mkdir($dataDir, 0755, true);
        $handle = fopen($dataDir . '/sheet_live.lock', 'c');
        if ($handle === false || !flock($handle, LOCK_EX)) {
            if (is_resource($handle)) fclose($handle);
            throw new RuntimeException('Unable to lock the live sheet record.');
        }
        try {
            $file = self::path($dataDir);
            $live = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
            if (!is_array($live)) $live = [];
            $before = json_encode($live);
            $result = $change($live);
            if (json_encode($live) !== $before) {
                $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
                file_put_contents($tmp, json_encode($live));
                if (!@rename($tmp, $file)) { @copy($tmp, $file); @unlink($tmp); }
            }
            return $result;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private static function stampOf(string $dataFile): string
    {
        clearstatcache(true, $dataFile);
        return is_file($dataFile) ? filemtime($dataFile) . '-' . filesize($dataFile) : 'none';
    }

    /** After a write of the sheets: each character whose sheet changed gets a new revision, and its changed fields. */
    public static function noteWrite(string $dataDir, string $dataFile, $before, array $after): array
    {
        try {
            return self::with($dataDir, static function (array &$live) use ($dataFile, $before, $after): array {
                $moved = [];
                foreach ($after as $character => $sheet) {
                    if (!is_string($character) || str_starts_with($character, '_')) continue;
                    $changed = SheetChanges::differences(is_array($before) ? ($before[$character] ?? null) : null, $sheet, [], 400);
                    if (!$changed) continue;
                    $entry = is_array($live[$character] ?? null) ? $live[$character] : [];
                    $rev = (int) ($entry['rev'] ?? 0) + 1;
                    $fields = is_array($entry['fields'] ?? null) ? $entry['fields'] : [];
                    foreach ($changed as $difference) $fields[(string) $difference['path']] = $rev;
                    if (count($fields) > self::MAX_FIELDS) { asort($fields); $fields = array_slice($fields, -self::MAX_FIELDS, null, true); }
                    $entry['rev'] = $rev;
                    $entry['fields'] = $fields;
                    $live[$character] = $entry;
                    $moved[$character] = $rev;
                }
                $live['_stamp'] = self::stampOf($dataFile);
                return $moved;
            });
        } catch (Throwable $error) {
            return [];   // The live record is a help; a save never fails for it.
        }
    }

    /** A write made by something that does not tell this record: every hero's revision moves, so pages reload. */
    private static function catchUp(array &$live, string $dataFile): void
    {
        $stamp = self::stampOf($dataFile);
        if (($live['_stamp'] ?? null) === $stamp) return;
        if (isset($live['_stamp'])) {
            foreach ($live as $character => $entry) {
                if (is_string($character) && !str_starts_with($character, '_') && is_array($entry)) $live[$character]['rev'] = (int) ($entry['rev'] ?? 0) + 1;
            }
        }
        $live['_stamp'] = $stamp;
    }

    public static function revision(string $dataDir, string $dataFile, string $character): int
    {
        return (int) self::with($dataDir, static function (array &$live) use ($dataFile, $character): int {
            self::catchUp($live, $dataFile);
            return (int) ($live[$character]['rev'] ?? 0);
        });
    }

    /** The revision and the fields locked, for a page's poll. */
    public static function state(string $dataDir, string $dataFile, string $character, string $user, ?int $now = null): array
    {
        $now = $now ?? time();
        return self::with($dataDir, static function (array &$live) use ($dataFile, $character, $user, $now): array {
            self::catchUp($live, $dataFile);
            self::expire($live, $character, $now);
            $locks = [];
            foreach (($live[$character]['locks'] ?? []) as $field => $lock) {
                $locks[] = ['field' => (string) $field, 'user' => $lock['user'], 'name' => $lock['name'], 'mine' => strcasecmp((string) $lock['user'], $user) === 0, 'expiresIn' => max(0, (int) $lock['until'] - $now)];
            }
            return ['revision' => (int) ($live[$character]['rev'] ?? 0), 'locks' => $locks];
        });
    }

    private static function expire(array &$live, string $character, int $now): void
    {
        if (!isset($live[$character]['locks']) || !is_array($live[$character]['locks'])) return;
        foreach ($live[$character]['locks'] as $field => $lock) {
            if (!is_array($lock) || (int) ($lock['until'] ?? 0) <= $now) unset($live[$character]['locks'][$field]);
        }
        if (!$live[$character]['locks']) unset($live[$character]['locks']);
    }

    /** A field key: a sheet path ("hero.name", "actions.mains") or a record field ("info.college"). */
    public static function field($raw): ?string
    {
        $field = is_string($raw) ? trim($raw) : '';
        return preg_match('/^[A-Za-z][A-Za-z0-9_.:\-]{0,119}$/', $field) === 1 ? $field : null;
    }

    /** Takes or renews a lock. Answers ['locked' => true, 'until'] or ['locked' => false, 'holder' => [user, name]]. */
    public static function lock(string $dataDir, string $character, string $field, string $user, string $name, ?int $now = null): array
    {
        $now = $now ?? time();
        return self::with($dataDir, static function (array &$live) use ($character, $field, $user, $name, $now): array {
            self::expire($live, $character, $now);
            $held = $live[$character]['locks'][$field] ?? null;
            if (is_array($held) && strcasecmp((string) $held['user'], $user) !== 0) {
                return ['locked' => false, 'holder' => ['user' => $held['user'], 'name' => $held['name']]];
            }
            $live[$character]['locks'][$field] = ['user' => $user, 'name' => $name, 'until' => $now + self::LOCK_SECONDS];
            return ['locked' => true, 'until' => $now + self::LOCK_SECONDS, 'expiresIn' => self::LOCK_SECONDS];
        });
    }

    public static function unlock(string $dataDir, string $character, string $field, string $user, ?int $now = null): bool
    {
        $now = $now ?? time();
        return (bool) self::with($dataDir, static function (array &$live) use ($character, $field, $user, $now): bool {
            self::expire($live, $character, $now);
            $held = $live[$character]['locks'][$field] ?? null;
            if (!is_array($held) || strcasecmp((string) $held['user'], $user) !== 0) return false;
            unset($live[$character]['locks'][$field]);
            if (!$live[$character]['locks']) unset($live[$character]['locks']);
            return true;
        });
    }

    private static function overlaps(string $a, string $b): bool
    {
        return $a === $b || str_starts_with($a, $b . '.') || str_starts_with($b, $a . '.');
    }

    /**
     * Whether a save from a page that last read $baseRevision may set these fields: refused for any field somebody
     * else holds locked, or that changed since that revision (stale). A counter moved by an amount ('from') is
     * never stale: amounts add up. Answers null when the save may go ahead, else the reason.
     */
    public static function check(string $dataDir, string $dataFile, string $character, array $changes, ?int $baseRevision, string $user, ?int $now = null): ?array
    {
        $now = $now ?? time();
        return self::with($dataDir, static function (array &$live) use ($dataFile, $character, $changes, $baseRevision, $user, $now): ?array {
            self::catchUp($live, $dataFile);
            self::expire($live, $character, $now);
            $entry = is_array($live[$character] ?? null) ? $live[$character] : [];
            $paths = [];
            foreach ($changes as $change) if (!array_key_exists('from', $change)) $paths[] = implode('.', $change['path']);
            foreach (($entry['locks'] ?? []) as $field => $lock) {
                if (strcasecmp((string) $lock['user'], $user) === 0) continue;
                foreach ($paths as $path) {
                    if (self::overlaps($path, (string) $field)) return ['locked' => true, 'field' => (string) $field, 'holder' => ['user' => $lock['user'], 'name' => $lock['name']], 'revision' => (int) ($entry['rev'] ?? 0)];
                }
            }
            if ($baseRevision === null) return null;
            $conflicts = [];
            foreach (($entry['fields'] ?? []) as $field => $rev) {
                if ((int) $rev <= $baseRevision) continue;
                foreach ($paths as $path) if (self::overlaps($path, (string) $field)) $conflicts[$path] = true;
            }
            return $conflicts ? ['stale' => true, 'conflicts' => array_keys($conflicts), 'revision' => (int) ($entry['rev'] ?? 0)] : null;
        });
    }
}

/**
 * A hero's conditions (October 2026: one list with the hero's token). Brandon: "Idk why you would have a condition
 * that is in your character sheet and not in the vtt or vice versa. So probably merge them."
 *
 * hero.conditions is a list of {name, duration: {type}} (and a damage rider's amount and type). While the hero has a
 * token on the map, the token's list is the truth and this is its mirror, written by the map (handler.php
 * sync-conditions, source vtt) with the token's revision; with no token, the sheet edits it here. Names are the
 * shared list's (character_sheet/parts/conditions.js) or a name typed by hand. An old sheet's free text is read
 * leniently by the pages; it is rewritten here as a list at the next change.
 */
final class SheetConditions
{
    public const MAX = 40;
    public const DURATIONS = ['save-ends', 'end-of-turn', 'end-of-encounter', 'until-dying', 'instantaneous'];

    /** A list as a page sends it (structured), checked: one of each, at most 40. Anything that is not one is dropped. */
    public static function normalize($list): array
    {
        if (!is_array($list)) return [];
        $result = [];
        $seen = [];
        foreach ($list as $entry) {
            if (!is_array($entry) || !is_string($entry['name'] ?? null)) continue;
            $name = trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $entry['name'])));
            if ($name === '' || strcasecmp($name, 'hiddenEffect') === 0) continue;
            $name = (string) preg_replace('/^(.{80}).+$/us', '$1', $name);
            $durationSource = $entry['duration'] ?? 'save-ends';
            $type = is_array($durationSource) ? ($durationSource['type'] ?? 'save-ends') : $durationSource;
            $type = in_array($type, self::DURATIONS, true) ? $type : 'save-ends';
            $condition = ['name' => $name, 'duration' => ['type' => $type]];
            $rider = $name === 'damageWeakness' || $name === 'damageImmunity';
            if ($rider) {
                $amount = $entry['amount'] ?? null;
                if ($amount === 'all') $condition['amount'] = 'all';
                elseif (is_numeric($amount) && (int) $amount > 0) $condition['amount'] = min(1000, (int) $amount);
                $damageType = is_string($entry['damageType'] ?? null) ? strtolower(trim($entry['damageType'])) : '';
                if ($damageType !== '' && $damageType !== 'untyped') $condition['damageType'] = substr($damageType, 0, 40);
                if (($entry['stacks'] ?? false) === true) $condition['stacks'] = true;
            }
            $key = self::key($condition);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $result[] = $condition;
            if (count($result) >= self::MAX) break;
        }
        return $result;
    }

    public static function key(array $condition): string
    {
        $key = strtolower((string) $condition['name']) . '|' . ($condition['duration']['type'] ?? 'save-ends');
        if (($condition['name'] ?? '') === 'damageWeakness' || ($condition['name'] ?? '') === 'damageImmunity') {
            $key .= '|' . ($condition['amount'] ?? '') . (($condition['stacks'] ?? false) ? '+' : '') . '|' . ($condition['damageType'] ?? '');
        }
        return $key;
    }

    public static function same(array $a, array $b): bool
    {
        return array_map([self::class, 'key'], $a) === array_map([self::class, 'key'], $b);
    }

    // ---- deltas (late October 2026) --------------------------------------------------------------------------
    // Brandon: "If a map isn't used, then it shouldn't send any signals." The map sends only what a real change on
    // the hero's token did ({op: add|remove|duration, condition, from}), never the token's whole list, so a finished
    // fight's leftovers on a map left open never come back onto the sheet. Each condition's change is taken once per
    // token revision and never an older one (guard()).

    private const KNOWN = ['Bleeding', 'Dazed', 'Frightened', 'Grabbed', 'Invisible', 'Concealed', 'Hidden', 'Prone', 'Restrained', 'Slowed', 'Taunted', 'Unconscious', 'Weakened', 'damageWeakness', 'damageImmunity'];

    /** An old sheet's free text read as a condition, as the pages read it (parts/conditions.js parseConditionText). */
    public static function parseText(string $text): ?array
    {
        $rest = trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text)));
        if ($rest === '') return null;
        $type = null;
        $eot = '/\b(?:until\s+)?(?:the\s+)?end\s+of\s+(?:(?:your|its|their|the)\s+)?(?:next\s+)?turn\b|\be\.?o\.?t\.?\b|\beont\b/iu';
        $save = '/\b(?:\(\s*)?save\s*s?\s*ends?\b|\bse\b|\bsave\b/iu';
        if (preg_match($eot, $rest)) { $type = 'end-of-turn'; $rest = (string) preg_replace($eot, ' ', $rest); }
        if (preg_match($save, $rest)) { $type = $type ?? 'save-ends'; $rest = (string) preg_replace($save, ' ', $rest); }
        $rest = trim((string) preg_replace('/[()\[\]{}]/u', ' ', $rest));
        $rest = trim((string) preg_replace('/^[\s,;:\-\x{2013}\x{2014}\/|.]+|[\s,;:\-\x{2013}\x{2014}\/|.]+$/u', '', (string) preg_replace('/\s+/u', ' ', $rest)));
        if ($rest === '') return null;
        $name = strcasecmp($rest, 'grappled') === 0 ? 'Grabbed' : $rest;
        foreach (self::KNOWN as $known) if (strcasecmp($known, $name) === 0) { $name = $known; break; }
        return ['name' => $name, 'duration' => ['type' => $type ?? 'save-ends']];
    }

    /** The stored list, whatever it was stored as (an old sheet's text too), as a list. */
    public static function lenient($list): array
    {
        if (!is_array($list)) $list = $list === null || $list === '' ? [] : [$list];
        $read = [];
        foreach ($list as $entry) {
            if (is_string($entry)) { $parsed = self::parseText($entry); if ($parsed !== null) $read[] = $parsed; }
            else $read[] = $entry;
        }
        return self::normalize($read);
    }

    /** A delta as a page sends it, checked: known ops with a condition each, at most 80. */
    public static function readOps($ops): array
    {
        if (!is_array($ops) || !array_is_list($ops)) throw new InvalidArgumentException('Missing or invalid condition changes.');
        $result = [];
        foreach (array_slice($ops, 0, 80) as $op) {
            if (!is_array($op) || !in_array($op['op'] ?? null, ['add', 'remove', 'duration'], true)) continue;
            $condition = self::normalize([$op['condition'] ?? null]);
            if ($condition === []) continue;
            $entry = ['op' => $op['op'], 'condition' => $condition[0]];
            if ($op['op'] === 'duration') $entry['from'] = in_array($op['from'] ?? null, self::DURATIONS, true) ? $op['from'] : 'save-ends';
            $result[] = $entry;
        }
        return $result;
    }

    /** A delta applied to a list: adding one already there, or taking off one not there, is nothing. */
    public static function applyOps(array $list, array $ops): array
    {
        $indexOf = static function (array $list, string $key): ?int {
            foreach ($list as $index => $entry) if (self::key($entry) === $key) return $index;
            return null;
        };
        foreach ($ops as $op) {
            $condition = $op['condition'];
            $at = $indexOf($list, self::key($condition));
            if ($op['op'] === 'add') {
                if ($at === null && count($list) < self::MAX) $list[] = $condition;
            } elseif ($op['op'] === 'remove') {
                if ($at !== null) array_splice($list, $at, 1);
            } else {
                $from = $condition;
                $from['duration'] = ['type' => $op['from']];
                $fromAt = $indexOf($list, self::key($from));
                if ($fromAt !== null) {
                    if ($at === null) $list[$fromAt] = $condition; else array_splice($list, $fromAt, 1);
                } elseif ($at === null && count($list) < self::MAX) $list[] = $condition;
            }
            $list = array_values($list);
        }
        return $list;
    }

    /**
     * Which ops a token's revision lets through, and what the sheet then keeps of that token: [ops, source]. A
     * condition's change is taken when the revision is newer than the last one taken for that condition (and than a
     * whole list written before deltas); another token of the hero starts again.
     */
    public static function guard(?array $source, string $placementId, int $revision, array $ops): array
    {
        $same = is_array($source) && ($source['placementId'] ?? '') === $placementId;
        $floor = $same ? (int) ($source['floor'] ?? ($source['revision'] ?? 0)) : 0;
        $names = $same && is_array($source['names'] ?? null) ? $source['names'] : [];
        $pass = [];
        foreach ($ops as $op) {
            $name = strtolower((string) $op['condition']['name']);
            if ($revision > max($floor, (int) ($names[$name] ?? 0))) $pass[] = $op;
        }
        foreach ($pass as $op) $names[strtolower((string) $op['condition']['name'])] = $revision;
        if (count($names) > 60) {
            arsort($names);
            $floor = max($floor, ...array_values(array_slice($names, 60, null, true)));
            $names = array_slice($names, 0, 60, true);
        }
        return [$pass, ['placementId' => $placementId, 'revision' => max($same ? (int) ($source['revision'] ?? 0) : 0, $revision), 'floor' => $floor, 'names' => $names]];
    }
}
