<?php
declare(strict_types=1);

/** Account-owned, immutable sheet snapshots. The GM can read only submitted copies. */
final class CharacterLibrary
{
    private PDO $db;

    public function __construct(string $directory)
    {
        if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Cannot open character storage.');
        }
        $this->db = new PDO('sqlite:' . $directory . '/characters.sqlite', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->db->exec('PRAGMA busy_timeout = 5000');
        $this->db->exec('CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL, digest TEXT NOT NULL,
            name TEXT NOT NULL, class TEXT NOT NULL, ancestry TEXT NOT NULL, level INTEGER NOT NULL,
            sheet TEXT NOT NULL, saved TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted TEXT,
            UNIQUE(owner, digest)
        )');
    }

    public function save(string $owner, stdClass $sheet): string
    {
        $hero = $sheet->hero ?? null;
        if (!$hero instanceof stdClass || !is_string($hero->name ?? null) || trim($hero->name) === ''
            || strlen($hero->name) > 360 || !is_string($hero->class ?? null) || trim($hero->class) === ''
            || !is_string($hero->ancestry ?? null) || !is_int($hero->level ?? null) || $hero->level < 1 || $hero->level > 10
            || !(($sheet->sidebar ?? null) instanceof stdClass) || !(($sheet->actions ?? null) instanceof stdClass)
            || !is_array($sheet->features ?? null)) {
            throw new InvalidArgumentException('Choose a completed character builder sheet.');
        }
        foreach (['mains', 'maneuvers', 'triggers', 'freeStrikes'] as $group) {
            if (!is_array($sheet->actions->$group ?? null)) throw new InvalidArgumentException('The ability groups are missing.');
        }
        $json = json_encode($sheet, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $digest = hash('sha256', $json);
        $insert = $this->db->prepare('INSERT INTO characters (id, owner, digest, name, class, ancestry, level, sheet)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner, digest) DO NOTHING');
        $insert->execute([bin2hex(random_bytes(16)), $owner, $digest, trim($hero->name), $hero->class, $hero->ancestry, $hero->level, $json]);
        $find = $this->db->prepare('SELECT id FROM characters WHERE owner = ? AND digest = ?');
        $find->execute([$owner, $digest]);
        return (string) $find->fetchColumn();
    }

    public function listing(string $user, bool $submissions): array
    {
        $fields = 'id, owner, name, class, ancestry, level, saved, submitted';
        if ($submissions) {
            if ($user !== 'GM') throw new DomainException('This list is for the GM.');
            return $this->db->query("SELECT $fields FROM characters WHERE submitted IS NOT NULL ORDER BY submitted DESC, rowid DESC")->fetchAll();
        }
        $query = $this->db->prepare("SELECT $fields FROM characters WHERE owner = ? ORDER BY saved DESC, rowid DESC");
        $query->execute([$user]);
        return $query->fetchAll();
    }

    public function view(string $user, string $id): ?array
    {
        $query = $this->db->prepare("SELECT id, owner, name, sheet, submitted FROM characters
            WHERE id = ? AND (owner = ? OR (? = 'GM' AND submitted IS NOT NULL))");
        $query->execute([$id, $user, $user]);
        return $query->fetch() ?: null;
    }

    public function submit(string $owner, string $id): void
    {
        $query = $this->db->prepare('UPDATE characters SET submitted = COALESCE(submitted, CURRENT_TIMESTAMP) WHERE id = ? AND owner = ?');
        $query->execute([$id, $owner]);
        if (!$query->rowCount()) throw new OutOfBoundsException('Character not found.');
    }
}

function character_library(): CharacterLibrary
{
    return new CharacterLibrary(__DIR__ . '/../../data/.my-characters');
}

function character_library_token(): string
{
    return $_SESSION['character_library_csrf'] ??= bin2hex(random_bytes(32));
}
