<?php
/**
 * Ask heroes for a test (Brandon, October 2026).
 *
 * The Director picks the heroes and, if he wishes, one or several characteristics; he never picks the skill.
 * Each player is shown a pop-up, picks a characteristic among those offered (or none), a skill (or none), an
 * edge or a bane, and may type an extra plus or minus. Nothing is forced. The roll is made HERE, on the server,
 * from the hero's own sheet: 2d10 + the characteristic + 2 for a skill the hero has (+ that skill's own bonus)
 * + 2 for an edge or - 2 for a bane + the typed extra. The result comes back to the Director in a pop-up and as
 * a line in chat that only he and the roller see.
 *
 * Reached through chat_handler.php (actions chat_test_ask, chat_test_state, chat_test_sheet, chat_test_roll), so
 * it works wherever the chat does: the main page, the character sheet and the map.
 */
final class AskTest
{
    public const CHARACTERISTICS = ['might', 'agility', 'reason', 'intuition', 'presence'];

    /** The five groups and their skills, as on the character sheet (dnd/character_sheet/sheet.js, SKILL_GROUPS). */
    public const SKILLS = [
        'Crafting' => ['Alchemy', 'Architecture', 'Blacksmithing', 'Carpentry', 'Cooking', 'Fletching', 'Forgery', 'Jewelry', 'Mechanics', 'Tailoring'],
        'Exploration' => ['Climb', 'Drive', 'Endurance', 'Gymnastics', 'Heal', 'Jump', 'Lift', 'Navigate', 'Ride', 'Swim', 'Track'],
        'Interpersonal' => ['Brag', 'Empathize', 'Flirt', 'Gamble', 'Handle Animals', 'Interrogate', 'Intimidate', 'Lead', 'Lie', 'Music', 'Perform', 'Persuade', 'Read Person'],
        'Intrigue' => ['Alertness', 'Conceal Object', 'Disguise', 'Eavesdrop', 'Escape Artist', 'Hide', 'Pick Lock', 'Pick Pocket', 'Sabotage', 'Search', 'Sneak'],
        'Lore' => ['Criminal Underworld', 'Culture', 'History', 'Magic', 'Monsters', 'Nature', 'Psionics', 'Religion', 'Rumors', 'Society', 'Strategy', 'Timescape'],
    ];

    /** How many tests are kept, and how long one waits for its players before it stops being offered. */
    public const KEEP = 30;
    public const WAIT_SECONDS = 1800;
    public const SKILL_BONUS = 2;
    public const EDGE = 2;
    public const EXTRA_LIMIT = 20;

    /** The tier of a total: 11 or lower, 12 to 16, 17 or higher. */
    public static function tier(int $total): int
    {
        return $total >= 17 ? 3 : ($total >= 12 ? 2 : 1);
    }

    /** A whole number out of what a sheet holds for a characteristic or a bonus ("", "2", 2, "+1"). */
    public static function whole($value): int
    {
        if (is_int($value)) return $value;
        if (is_float($value)) return (int) round($value);
        if (is_string($value) && preg_match('/^\s*([+\-\x{2212}]?)\s*(\d{1,3})\s*$/u', $value, $m) === 1) {
            return ($m[1] === '-' || $m[1] === "\u{2212}") ? -(int) $m[2] : (int) $m[2];
        }
        return 0;
    }

    /**
     * What the tool needs of one hero's sheet: the five characteristics, and each skill the hero has with its own
     * extra bonus. A sheet that is missing gives zeros and no skills.
     * @return array{stats: array<string,int>, skills: array<string,int>}
     */
    public static function sheetOf(array $sheets, string $hero): array
    {
        $sheet = is_array($sheets[$hero] ?? null) ? $sheets[$hero] : [];
        $stats = [];
        foreach (self::CHARACTERISTICS as $name) {
            $stats[$name] = self::whole($sheet['hero']['stats'][$name] ?? 0);
        }
        $known = array_merge(...array_values(self::SKILLS));
        $skills = [];
        foreach (is_array($sheet['sidebar']['skills'] ?? null) ? $sheet['sidebar']['skills'] : [] as $skill => $entry) {
            if (!in_array($skill, $known, true)) continue;
            $level = is_array($entry) ? ($entry['level'] ?? 'Trained') : $entry;
            if ($level === '' || $level === 'Untrained' || $level === null) continue;
            $skills[(string) $skill] = is_array($entry) ? self::whole($entry['bonus'] ?? 0) : 0;
        }
        ksort($skills);
        return ['stats' => $stats, 'skills' => $skills];
    }

    /** The characteristics the Director lit, tidied: known ones only, in the sheet's order, each once. */
    public static function characteristics($asked): array
    {
        $asked = array_map(static fn ($value) => is_string($value) ? strtolower(trim($value)) : '', is_array($asked) ? $asked : []);
        return array_values(array_filter(self::CHARACTERISTICS, static fn ($name) => in_array($name, $asked, true)));
    }

    /**
     * A new test. $heroes are the ids asked (already checked against the players of the game).
     * @return array the test as stored
     */
    public static function create(array $heroes, array $characteristics, bool $private, int $now): array
    {
        $rows = [];
        foreach ($heroes as $hero) $rows[$hero] = ['status' => 'waiting'];
        return [
            'id' => 'test_' . bin2hex(random_bytes(8)),
            'askedAt' => $now,
            'characteristics' => $characteristics,
            'private' => $private,
            'rows' => $rows,
        ];
    }

    /**
     * The roll for one hero. $choice is what the player picked: characteristic ('' for none), skill ('' for none),
     * edge (-1 bane, 0, 1 edge), extra (a typed plus or minus). $dice are the two d10, rolled by the caller so that
     * a test can name them. Throws InvalidArgumentException with words fit to show when the choice is not one the
     * test offers.
     * @return array the hero's row, rolled
     */
    public static function roll(array $test, array $sheet, array $choice, array $dice, int $now): array
    {
        $lit = $test['characteristics'] ?? [];
        $offered = $lit ? $lit : self::CHARACTERISTICS;
        $characteristic = is_string($choice['characteristic'] ?? null) ? strtolower(trim($choice['characteristic'])) : '';
        if ($characteristic !== '' && !in_array($characteristic, $offered, true)) {
            throw new InvalidArgumentException('That characteristic is not one this test offers.');
        }
        $skill = is_string($choice['skill'] ?? null) ? trim($choice['skill']) : '';
        if ($skill !== '' && !in_array($skill, array_merge(...array_values(self::SKILLS)), true)) {
            throw new InvalidArgumentException('That is not a skill.');
        }
        $edge = max(-1, min(1, (int) ($choice['edge'] ?? 0)));
        $extra = max(-self::EXTRA_LIMIT, min(self::EXTRA_LIMIT, self::whole($choice['extra'] ?? 0)));
        $fromCharacteristic = $characteristic !== '' ? (int) ($sheet['stats'][$characteristic] ?? 0) : 0;
        // A skill adds only when the hero has it; one that is not theirs can be named and adds nothing.
        $has = $skill !== '' && array_key_exists($skill, $sheet['skills'] ?? []);
        $fromSkill = $has ? self::SKILL_BONUS + (int) $sheet['skills'][$skill] : 0;
        $modifier = $fromCharacteristic + $fromSkill + $edge * self::EDGE + $extra;
        $d1 = max(1, min(10, (int) ($dice[0] ?? 1)));
        $d2 = max(1, min(10, (int) ($dice[1] ?? 1)));
        $total = $d1 + $d2 + $modifier;
        return [
            'status' => 'rolled',
            'rolledAt' => $now,
            'characteristic' => $characteristic,
            'skill' => $skill,
            'hasSkill' => $has,
            'edge' => $edge,
            'extra' => $extra,
            'dice' => [$d1, $d2],
            'modifier' => $modifier,
            'total' => $total,
            'tier' => self::tier($total),
        ];
    }

    /** "Intuition, no skill. 9 - 1 = 8, tier 1": the line for chat and for the Director's list. */
    public static function words(array $row): string
    {
        $parts = [$row['characteristic'] !== '' ? ucfirst($row['characteristic']) : 'No characteristic', $row['skill'] !== '' ? $row['skill'] : 'no skill'];
        if (($row['edge'] ?? 0) > 0) $parts[] = 'edge';
        if (($row['edge'] ?? 0) < 0) $parts[] = 'bane';
        if (($row['extra'] ?? 0) !== 0) $parts[] = 'extra ' . ($row['extra'] > 0 ? '+' : "\u{2212}") . abs($row['extra']);
        $rolled = $row['dice'][0] + $row['dice'][1];
        $sign = $row['modifier'] < 0 ? "\u{2212}" : '+';
        return implode(', ', $parts) . '. ' . $rolled . ' ' . $sign . ' ' . abs($row['modifier']) . ' = ' . $row['total'] . ', tier ' . $row['tier'];
    }

    /** What a test asks for, in words: "Agility or Intuition", "Presence", "any characteristic". */
    public static function asks(array $test): string
    {
        $lit = array_map('ucfirst', $test['characteristics'] ?? []);
        return $lit ? implode(' or ', $lit) : 'any characteristic';
    }

    /**
     * The tests one user may see. The Director sees every row of every test; a hero sees the tests that ask them,
     * with their own row only. `open` says whether a waiting test is still young enough to be offered.
     */
    public static function visibleTo(array $tests, string $user, bool $isGm, int $now): array
    {
        $seen = [];
        foreach ($tests as $test) {
            if (!is_array($test) || !isset($test['id'], $test['rows']) || !is_array($test['rows'])) continue;
            if (!$isGm && !array_key_exists($user, $test['rows'])) continue;
            $rows = $isGm ? $test['rows'] : [$user => $test['rows'][$user]];
            foreach ($rows as $hero => $row) {
                if (($row['status'] ?? '') === 'rolled') $rows[$hero]['words'] = self::words($row);
            }
            $seen[] = [
                'id' => $test['id'],
                'askedAt' => (int) $test['askedAt'],
                'age' => max(0, $now - (int) $test['askedAt']),
                'open' => $now - (int) $test['askedAt'] <= self::WAIT_SECONDS,
                'characteristics' => $test['characteristics'] ?? [],
                'asks' => self::asks($test),
                'private' => !empty($test['private']),
                'rows' => $rows,
            ];
        }
        return $seen;
    }

    // ---- kept in one small file, changed only under a lock ---------------------------------------------

    /** Reads the tests, hands them to $change, and saves what it returns (when it returns an array). */
    public static function change(string $file, callable $change)
    {
        $lock = fopen($file . '.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            if (is_resource($lock)) fclose($lock);
            throw new RuntimeException('The tests could not be opened.');
        }
        try {
            $tests = self::read($file);
            $result = $change($tests);
            if (is_array($result) && array_key_exists('tests', $result)) {
                $kept = array_slice(array_values($result['tests']), -self::KEEP);
                if (file_put_contents($file, json_encode($kept, JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
                    throw new RuntimeException('The test could not be saved.');
                }
            }
            return $result;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public static function read(string $file): array
    {
        if (!is_file($file)) return [];
        $handle = @fopen($file, 'r');
        if ($handle === false) return [];
        // Under a shared lock, so a list that is being written at this moment is not read half-written.
        $content = flock($handle, LOCK_SH) ? stream_get_contents($handle) : '';
        flock($handle, LOCK_UN);
        fclose($handle);
        $decoded = json_decode((string) $content, true);
        return is_array($decoded) ? array_values(array_filter($decoded, 'is_array')) : [];
    }

    /** A mark that changes whenever the tests change, so a page that has them already is told so in a word. */
    public static function stamp(string $file): string
    {
        clearstatcache(true, $file);
        return is_file($file) ? filemtime($file) . '-' . filesize($file) : '0';
    }
}
