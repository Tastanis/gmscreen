<?php
declare(strict_types=1);

/** Public profile IDs only. Authentication and team permissions remain separate. */
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

    public static function playerIds(): array
    {
        $path = getenv('VTT_PLAYER_ROSTER_PATH') ?: __DIR__ . '/../config/player-roster.json';
        $json = file_get_contents($path);
        if ($json === false) throw new RuntimeException('Unable to read the player roster.');
        return self::normalize(json_decode($json, true, 512, JSON_THROW_ON_ERROR));
    }

    public static function read(): array
    {
        $players = self::playerIds();
        return ['players'=>$players, 'revision'=>hash('sha256', json_encode($players))];
    }

    public static function replace($raw, string $expectedRevision): array
    {
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
