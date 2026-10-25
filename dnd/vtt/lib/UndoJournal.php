<?php
declare(strict_types=1);

/**
 * Turn undo journal (Brandon, October 2026). While a combatant's turn is running, every saved change to a token,
 * every Malice change, and every hero sheet counter change a page reports, is kept with what it was before, who
 * made it, and the action it belongs to (`group`: one ability use, one move, one damage entry). Ctrl+Z takes back the
 * turn's newest action, Ctrl+Shift+Z all of them; anyone in the game may. Outside a turn nothing is kept here (the
 * movement receipts in MovementUndo still undo a user's own last move).
 */
final class UndoJournal
{
    /** Never restored: worked out by the server, or page bookkeeping that is not part of the game. */
    public const SKIP = ['id', '_entityRevision', '_movementUndo', '_lastModified', 'flags', 'metadata', 'authorIsGm', 'authorRole', 'authorId', 'gmAuthored'];

    /** The fields of a move, restored together. */
    public const POSITION = ['column', 'row', 'levelId', 'flightHeight', 'movementMode', '_supportSurfaceId', '_floorTraversal'];

    public function __construct(private PDO $pdo, private string $world)
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS vtt_undo_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            world_id TEXT NOT NULL,
            scene_id TEXT NOT NULL,
            turn_key TEXT NOT NULL,
            group_id TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT \'\',
            operation_id TEXT NOT NULL DEFAULT \'\',
            actor_id TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 0,
            kind TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            before_json TEXT NOT NULL,
            after_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            undone_at INTEGER,
            undone_by TEXT
        )');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_vtt_undo_turn ON vtt_undo_steps (world_id, scene_id, turn_key, id)');
    }

    /** The running turn of a scene's combat (encounter, round, combatant, when it began); null when none runs. */
    public static function turnKey(mixed $combat): ?string
    {
        if (!is_array($combat)) return null;
        $active = $combat['activeCombatantId'] ?? null;
        if (!is_string($active) || trim($active) === '') return null;
        return implode('|', [
            (string) ($combat['encounterId'] ?? ''),
            (string) (int) ($combat['round'] ?? 0),
            $active,
            (string) ($combat['turnLock']['acquiredAt'] ?? ''),
        ]);
    }

    /** What changed in these fields between two versions of a token: [before, after], or null when nothing did. */
    public static function diff(array $before, array $after, array $keys): ?array
    {
        $old = [];
        $new = [];
        foreach (array_unique($keys) as $key) {
            $key = (string) $key;
            if (in_array($key, self::SKIP, true)) continue;
            $was = $before[$key] ?? null;
            $is = $after[$key] ?? null;
            if (json_encode($was) === json_encode($is)) continue;
            $old[$key] = $was;
            $new[$key] = $is;
        }
        if ($old === []) return null;
        // A move is put back whole: where it stood, its floor, its height.
        if (array_intersect(array_keys($old), ['column', 'row'])) {
            foreach (self::POSITION as $key) {
                if (array_key_exists($key, $old)) continue;
                if (!array_key_exists($key, $before) && !array_key_exists($key, $after)) continue;
                $old[$key] = $before[$key] ?? null;
                $new[$key] = $after[$key] ?? null;
            }
        }
        return [$old, $new];
    }

    public static function cleanId(mixed $value, int $max = 128): string
    {
        $text = trim((string) (is_scalar($value) ? $value : ''));
        return preg_match('/^[A-Za-z0-9._:|-]{1,' . $max . '}$/', $text) === 1 ? $text : '';
    }

    public static function cleanLabel(mixed $value): string
    {
        $text = trim(preg_replace('/\s+/', ' ', (string) (is_scalar($value) ? $value : '')) ?? '');
        return preg_match('/^.{0,80}/us', $text, $match) === 1 ? $match[0] : substr($text, 0, 80);
    }

    public function record(string $scene, string $turn, string $group, string $label, string $operation, string $actor,
        int $revision, string $kind, string $entity, array $before, array $after, int $now): void
    {
        $statement = $this->pdo->prepare('INSERT INTO vtt_undo_steps
            (world_id, scene_id, turn_key, group_id, label, operation_id, actor_id, revision, kind, entity_id, before_json, after_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $statement->execute([$this->world, $scene, $turn, $group, $label, $operation, $actor, $revision, $kind, $entity,
            json_encode($before, JSON_THROW_ON_ERROR), json_encode($after, JSON_THROW_ON_ERROR), $now]);
        if (random_int(1, 50) === 1) $this->prune($now);
    }

    /** The turn's steps not yet undone, newest first: the newest action's only, or all of them. */
    public function standing(string $scene, string $turn, bool $whole): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM vtt_undo_steps WHERE world_id = ? AND scene_id = ? AND turn_key = ? AND undone_at IS NULL ORDER BY id DESC LIMIT 500');
        $statement->execute([$this->world, $scene, $turn]);
        $rows = array_map(static function (array $row): array {
            $row['id'] = (int) $row['id'];
            $row['before'] = json_decode((string) $row['before_json'], true) ?: [];
            $row['after'] = json_decode((string) $row['after_json'], true) ?: [];
            unset($row['before_json'], $row['after_json']);
            return $row;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
        if ($whole || $rows === []) return $rows;
        $group = $rows[0]['group_id'];
        return array_values(array_filter($rows, static fn(array $row): bool => $row['group_id'] === $group));
    }

    /** How many actions the running turn still has to undo. */
    public function actionCount(string $scene, string $turn): int
    {
        $statement = $this->pdo->prepare('SELECT COUNT(DISTINCT group_id) FROM vtt_undo_steps WHERE world_id = ? AND scene_id = ? AND turn_key = ? AND undone_at IS NULL');
        $statement->execute([$this->world, $scene, $turn]);
        return (int) $statement->fetchColumn();
    }

    public function markUndone(array $ids, string $actor, int $now): void
    {
        $ids = array_values(array_filter(array_map('intval', $ids)));
        if ($ids === []) return;
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $statement = $this->pdo->prepare("UPDATE vtt_undo_steps SET undone_at = ?, undone_by = ? WHERE world_id = ? AND id IN ($marks)");
        $statement->execute([$now, $actor, $this->world, ...$ids]);
    }

    /** Old turns are not kept: a few days is plenty for a fight. */
    public function prune(int $now): void
    {
        $statement = $this->pdo->prepare('DELETE FROM vtt_undo_steps WHERE world_id = ? AND created_at < ?');
        $statement->execute([$this->world, $now - 3 * 24 * 3600 * 1000]);
    }
}
