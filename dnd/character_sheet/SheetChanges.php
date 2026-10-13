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

    /** What one Recovery heals: the sheet's own number when it has one, else a third of the Stamina maximum. */
    public static function recoveryValue(array $vitals): int
    {
        $own = self::whole(is_float($vitals['recoveryValue'] ?? null) ? floor($vitals['recoveryValue']) : ($vitals['recoveryValue'] ?? null));
        if ($own !== null && $own !== 0) return max(0, $own);
        $max = self::whole($vitals['staminaMax'] ?? null) ?? 0;
        return $max > 0 ? intdiv($max, 3) : 0;
    }

    /**
     * Spends one Recovery, from the stored record: one fewer Recovery, and Stamina up by the recovery value, as
     * far as the maximum. Stamina already above the maximum (temporary Stamina) is left alone, never lowered, and
     * a sheet with no maximum heals the full value. With no Recovery left, or nothing to heal by, nothing changes.
     */
    public static function useRecovery(array $sheet): array
    {
        $vitals = is_array($sheet['hero']['vitals'] ?? null) ? $sheet['hero']['vitals'] : [];
        $left = max(0, self::whole($vitals['currentRecoveries'] ?? null) ?? 0);
        $heals = self::recoveryValue($vitals);
        $stamina = self::whole($vitals['currentStamina'] ?? null) ?? 0;
        $answer = static fn (array $sheet, int $spent, int $stamina, int $left, string $reason = ''): array => ['sheet' => $sheet, 'spent' => $spent,
            'currentStamina' => $stamina, 'currentRecoveries' => $left, 'recoveryValue' => $heals, ...($reason !== '' ? ['reason' => $reason] : [])];
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
