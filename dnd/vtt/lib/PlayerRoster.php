<?php
declare(strict_types=1);

/**
 * Public profile IDs only. Authentication and team permissions remain separate.
 *
 * The VTT's players are the site's player list (includes/players.php, Brandon October 2026): every player, on or off,
 * for everything that is data (token links, vision owners, checkpoints), so a player turned off keeps their tokens and
 * their state; activeIds() for what is offered to pick (Show players, vision owner choices). The site list is edited on
 * the dashboard's Players page. VTT_PLAYER_ROSTER_PATH (tests) still points the VTT at a roster file of its own.
 */
final class PlayerRoster
{
    public static function normalize($raw): array
    {
        if (!is_array($raw) || !array_is_list($raw) || count($raw) > 100) {
            throw new InvalidArgumentException('Player roster must be a list of at most 100 profile IDs.');
        }
        $ids = [];
        foreach ($raw as $value) {
            $id = is_string($value) ? strtolower(trim($value)) : '';
            if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $id) || $id === 'gm') {
                throw new InvalidArgumentException('Player roster contains an invalid profile ID.');
            }
            if (!in_array($id, $ids, true)) $ids[] = $id;
        }
        return $ids;
    }

    /** The site's list, or null when the VTT is pointed at a roster file of its own (tests). */
    private static function sitePlayers(): ?array
    {
        if (getenv('VTT_PLAYER_ROSTER_PATH')) return null;
        $site = __DIR__ . '/../../includes/players.php';
        if (!is_file($site)) return null;
        require_once $site;
        return players_public();
    }

    private static function filePlayerIds(): array
    {
        $path = getenv('VTT_PLAYER_ROSTER_PATH') ?: __DIR__ . '/../config/player-roster.json';
        $json = file_get_contents($path);
        if ($json === false) throw new RuntimeException('Unable to read the player roster.');
        return self::normalize(json_decode($json, true, 512, JSON_THROW_ON_ERROR));
    }

    /** Every player, on or off. */
    public static function playerIds(): array
    {
        $site = self::sitePlayers();
        return $site === null ? self::filePlayerIds() : self::normalize(array_column($site, 'id'));
    }

    /** The players who are on. */
    public static function activeIds(): array
    {
        $site = self::sitePlayers();
        if ($site === null) return self::filePlayerIds();
        return self::normalize(array_values(array_column(array_filter($site, static fn ($p) => !empty($p['active'])), 'id')));
    }

    /**
     * id => the words a token's name may carry to be that player's: the id, and the display name when it differs
     * ("player5" named "Mira": a token called "Mira" is theirs). Lower case, spaces between words.
     */
    public static function aliases(): array
    {
        $words = static fn (string $text): string => trim((string) preg_replace('/[^a-z0-9]+/', ' ', strtolower($text)));
        $aliases = [];
        foreach (self::sitePlayers() ?? array_map(static fn ($id) => ['id' => $id, 'name' => $id], self::filePlayerIds()) as $player) {
            $list = [$words($player['id'])];
            $name = $words((string) ($player['name'] ?? ''));
            if ($name !== '' && $name !== 'new player' && !in_array($name, $list, true)) $list[] = $name;
            $aliases[$player['id']] = $list;
        }
        return $aliases;
    }

    /** id => the name shown for each player (the id itself when the VTT has a roster file of its own). */
    public static function names(): array
    {
        $names = [];
        foreach (self::sitePlayers() ?? array_map(static fn ($id) => ['id' => $id, 'name' => $id], self::filePlayerIds()) as $player) $names[$player['id']] = (string) ($player['name'] ?? $player['id']);
        return $names;
    }

    public static function read(): array
    {
        $players = self::playerIds();
        return ['players'=>$players, 'active'=>self::activeIds(), 'names'=>self::names(), 'siteList'=>self::sitePlayers() !== null, 'revision'=>hash('sha256', json_encode($players))];
    }

    public static function replace($raw, string $expectedRevision): array
    {
        if (self::sitePlayers() !== null) {
            throw new InvalidArgumentException('Players are now set on the dashboard\'s Players page.');
        }
        $players = self::normalize($raw);
        $path = getenv('VTT_PLAYER_ROSTER_PATH') ?: __DIR__ . '/../config/player-roster.json';
        $lock = fopen($path . '.lock', 'c');
        if ($lock === false) throw new RuntimeException('Unable to lock the player roster.');
        $temporary = null;
        try {
            if (!flock($lock, LOCK_EX)) throw new RuntimeException('Unable to lock the player roster.');
            $current = self::read();
            if (!hash_equals($current['revision'], $expectedRevision)) throw new PlayerRosterConflict('The roster changed in another session. Load the current roster before saving again.');
            if ($players === $current['players']) return $current;
            $temporary = tempnam(dirname($path), '.roster-');
            if ($temporary === false || file_put_contents($temporary, json_encode($players, JSON_PRETTY_PRINT) . "\n") === false || !rename($temporary, $path)) {
                throw new RuntimeException('Unable to save the player roster.');
            }
            $temporary = null;
            return self::read();
        } finally {
            if (is_string($temporary) && is_file($temporary)) unlink($temporary);
            flock($lock, LOCK_UN); fclose($lock);
        }
    }
}

final class PlayerRosterConflict extends RuntimeException {}
