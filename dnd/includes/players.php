<?php
/**
 * The site's one player list (Brandon, October 2026: a fifth player, and the GM turning players on and off).
 *
 * Every area reads this instead of its own copy of the four names: login, dashboard, character sheets, inventory,
 * chat, schedule, students, uploads, export and the VTT. Each player has a fixed id that never changes ("cal",
 * "player5"); everything a player owns is saved under that id, so naming or renaming them never moves their data.
 *
 *   id       fixed, hidden: the key of their sheet, inventory, schedule, relationship points and VTT state
 *   name     what is shown ("Cal"; "New player" until named)
 *   login    the name typed at login ("" until set: nobody can log in as them)
 *   active   off: they cannot log in (a remembered login too), an open session ends, and they drop out of every
 *            list of players (chat, Ask-a-Test, schedule, tabs, students, VTT). All their data is kept untouched.
 *   color    their accent colour (schedule)
 *
 * The list is data/players.json (kept out of git, so a deploy never overwrites it). With no file the four
 * original players are the list, all on, as before. Passwords set from the GM page are stored as hashes only;
 * the original four keep the passwords in index.php until one is set for them.
 */

const PLAYERS_ID_PATTERN = '/^[a-z][a-z0-9_-]{0,31}$/';

function players_file(): string
{
    return __DIR__ . '/../data/players.json';
}

/** The list as it was before there was one: the four original players, all on. */
function players_defaults(): array
{
    return [
        ['id' => 'cal', 'name' => 'Cal', 'login' => 'cal', 'active' => true, 'color' => '#d55b5b'],
        ['id' => 'sharon', 'name' => 'Sharon', 'login' => 'sharon', 'active' => true, 'color' => '#5ba6d5'],
        ['id' => 'indigo', 'name' => 'Indigo', 'login' => 'indigo', 'active' => true, 'color' => '#5fb36a'],
        ['id' => 'zepha', 'name' => 'Zepha', 'login' => 'zepha', 'active' => true, 'color' => '#d5a45e'],
    ];
}

/** One stored entry made safe; null when it has no usable id. */
function players_clean(array $entry): ?array
{
    $id = strtolower(trim((string) ($entry['id'] ?? '')));
    if (!preg_match(PLAYERS_ID_PATTERN, $id) || $id === 'gm') {
        return null;
    }
    $name = trim((string) ($entry['name'] ?? ''));
    $login = strtolower(trim((string) ($entry['login'] ?? '')));
    $color = trim((string) ($entry['color'] ?? ''));
    $clean = [
        'id' => $id,
        'name' => $name !== '' ? (function_exists('mb_substr') ? mb_substr($name, 0, 40) : substr($name, 0, 40)) : 'New player',
        'login' => preg_match('/^[a-z0-9_.-]{1,32}$/', $login) && $login !== 'harms' ? $login : '',
        'active' => !empty($entry['active']),
        'color' => preg_match('/^#[0-9a-f]{6}$/i', $color) ? strtolower($color) : '#a77fd5',
    ];
    if (isset($entry['passwordHash']) && is_string($entry['passwordHash']) && $entry['passwordHash'] !== '') {
        $clean['passwordHash'] = $entry['passwordHash'];
    }
    return $clean;
}

/** Every player, on and off, in their order. Read once per request. */
function players_all(bool $fresh = false): array
{
    static $cache = null;
    if ($cache !== null && !$fresh) {
        return $cache;
    }
    $list = null;
    $file = players_file();
    if (is_file($file)) {
        $raw = json_decode((string) @file_get_contents($file), true);
        if (is_array($raw) && isset($raw['players']) && is_array($raw['players'])) {
            $list = [];
            $seen = [];
            foreach ($raw['players'] as $entry) {
                $clean = is_array($entry) ? players_clean($entry) : null;
                if ($clean && !isset($seen[$clean['id']])) {
                    $seen[$clean['id']] = true;
                    $list[] = $clean;
                }
            }
        }
    }
    // An unreadable file never empties the site of players: the four originals stand in.
    $cache = $list ?: players_defaults();
    // Frunk, a past hero whose sheet and record are still saved, is on the roster turned off (Brandon, October 2026).
    if (!in_array('frunk', array_column($cache, 'id'), true)) {
        $frunk = players_clean(['id' => 'frunk', 'name' => 'Frunk', 'login' => '', 'active' => false, 'color' => '#8a8f98']);
        if ($frunk) {
            $cache[] = $frunk;
        }
    }
    return $cache;
}

/** The players who are on. */
function players_active(): array
{
    return array_values(array_filter(players_all(), static fn ($p) => $p['active']));
}

/** Their ids: every player (data, saving) or only those on (anything shown). */
function players_ids(bool $activeOnly = false): array
{
    return array_column($activeOnly ? players_active() : players_all(), 'id');
}

function player_by_id(string $id): ?array
{
    foreach (players_all() as $player) {
        if ($player['id'] === $id) {
            return $player;
        }
    }
    return null;
}

function player_by_login(string $login): ?array
{
    $login = strtolower(trim($login));
    if ($login === '') {
        return null;
    }
    foreach (players_all() as $player) {
        if ($player['login'] === $login) {
            return $player;
        }
    }
    return null;
}

/** Whether this session user may be here: the GM always; a player only while on. */
function player_may_play(string $user): bool
{
    if ($user === 'GM') {
        return true;
    }
    $player = player_by_id($user);
    return $player !== null && $player['active'];
}

/** The list for pages and scripts: no password hashes. */
function players_public(bool $activeOnly = false): array
{
    return array_map(static function ($p) {
        unset($p['passwordHash']);
        return $p;
    }, $activeOnly ? players_active() : players_all());
}

/** id => name, for labels. */
function players_names(bool $activeOnly = false): array
{
    $names = [];
    foreach ($activeOnly ? players_active() : players_all() as $player) {
        $names[$player['id']] = $player['name'];
    }
    return $names;
}

/**
 * Called by every page and endpoint that checks the session: a player who has been turned off is logged out here
 * (their remembered login too), so the page's own check then sends them to the login page or refuses the request.
 */
function players_gate(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE || empty($_SESSION['logged_in'])) {
        return;
    }
    $user = (string) ($_SESSION['user'] ?? '');
    if ($user === '' || player_may_play($user)) {
        return;
    }
    $_SESSION = [];
    if (!headers_sent()) {
        setcookie('dnd_remember', '', time() - 3600, '/');
    }
}

/** Writes the list, under a lock. Throws on failure; the old list is then left as it was. */
function players_save(array $players): array
{
    $clean = [];
    $seen = [];
    $logins = [];
    foreach ($players as $entry) {
        $player = is_array($entry) ? players_clean($entry) : null;
        if (!$player || isset($seen[$player['id']])) {
            throw new InvalidArgumentException('Each player needs its own id.');
        }
        if ($player['login'] !== '') {
            if (isset($logins[$player['login']])) {
                throw new InvalidArgumentException('Two players cannot share the login "' . $player['login'] . '".');
            }
            $logins[$player['login']] = true;
        }
        $seen[$player['id']] = true;
        $clean[] = $player;
    }
    if (!$clean) {
        throw new InvalidArgumentException('The list cannot be empty.');
    }
    $file = players_file();
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        throw new RuntimeException('The data folder could not be made.');
    }
    $lock = @fopen($file . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) {
        throw new RuntimeException('The player list is busy; try again.');
    }
    try {
        $tmp = $file . '.tmp';
        $json = json_encode(['players' => $clean, 'updated' => date('c')], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false || @file_put_contents($tmp, $json) === false || !@rename($tmp, $file)) {
            @unlink($tmp);
            throw new RuntimeException('The player list could not be saved.');
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
    players_all(true);
    return $clean;
}

/** The next free fixed id for a new player: player5, player6, ... */
function players_next_id(): string
{
    $ids = array_flip(players_ids());
    for ($n = count($ids) + 1; ; $n++) {
        if (!isset($ids['player' . $n])) {
            return 'player' . $n;
        }
    }
}

/** The page's player list for its scripts: window.dndPlayers (every player, on and off, without hashes). */
function players_script(): string
{
    $json = json_encode(players_public(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
    return '<script>window.dndPlayers=' . $json . ';</script>';
}
