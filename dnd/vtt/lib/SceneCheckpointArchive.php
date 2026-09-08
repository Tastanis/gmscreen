<?php
declare(strict_types=1);

/** Immutable, GM-only API archive. Never writes canonical board state. */
final class SceneCheckpointArchive
{
    public function __construct(private PDO $pdo, private string $worldId)
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS vtt_scene_checkpoints (
            world_id TEXT NOT NULL, id TEXT NOT NULL, scene_id TEXT NOT NULL,
            name TEXT NOT NULL, actor_id TEXT NOT NULL, revision INTEGER NOT NULL,
            created_at INTEGER NOT NULL, data_json TEXT NOT NULL,
            PRIMARY KEY (world_id, id))');
    }

    public function capture(string $id, string $name, string $sceneId, array $snapshot, string $actorId): array
    {
        $name = trim($name); $sceneId = trim($sceneId);
        if (!preg_match('/^[A-Za-z0-9_-]{8,100}$/', $id)) throw new InvalidArgumentException('Invalid checkpoint ID.');
        if ($name === '' || strlen($name) > 160) throw new InvalidArgumentException('Use a checkpoint name of 1 to 160 bytes.');
        if ($sceneId === '' || strlen($sceneId) > 200) throw new InvalidArgumentException('A scene is required.');
        $existing = $this->get($id);
        if ($existing !== null) {
            if ($existing['sceneId'] !== $sceneId || $existing['name'] !== $name) throw new InvalidArgumentException('That checkpoint ID is already used by another checkpoint.');
            return $existing;
        }
        $state = $snapshot['state'] ?? [];
        if (!isset($state['sceneConfig'][$sceneId]) && !isset($state['placements'][$sceneId])) {
            throw new InvalidArgumentException('That scene has no saved board state.');
        }
        $domains = [];
        foreach (['placements', 'sceneConfig', 'drawings', 'templates'] as $domain) {
            $domains[$domain] = $state[$domain][$sceneId] ?? [];
        }
        $data = ['format'=>'vtt-scene-checkpoint/v1', 'sceneId'=>$sceneId, 'domains'=>$domains];
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (strlen($json) > 16777216) throw new InvalidArgumentException('This scene exceeds the 16 MB checkpoint limit.');
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->get($id);
            if ($existing !== null) {
                if ($existing['sceneId'] !== $sceneId || $existing['name'] !== $name) {
                    throw new InvalidArgumentException('That checkpoint ID is already used by another checkpoint.');
                }
                $this->pdo->exec('COMMIT');
                return $existing;
            }
            $count = $this->pdo->prepare('SELECT COUNT(*) FROM vtt_scene_checkpoints WHERE world_id = ?');
            $count->execute([$this->worldId]);
            if ((int) $count->fetchColumn() >= 100) throw new InvalidArgumentException('Checkpoint archive is full (100 checkpoints). Export and remove old checkpoints before saving more.');
            $insert = $this->pdo->prepare('INSERT INTO vtt_scene_checkpoints
                (world_id,id,scene_id,name,actor_id,revision,created_at,data_json) VALUES (?,?,?,?,?,?,?,?)');
            $insert->execute([$this->worldId, $id, $sceneId, $name, $actorId, (int) $snapshot['revision'],
                (int) floor(microtime(true) * 1000), $json]);
            $result = $this->get($id);
            $this->pdo->exec('COMMIT');
            return $result;
        } catch (Throwable $error) {
            $this->pdo->exec('ROLLBACK');
            throw $error;
        }
    }

    public function list(string $sceneId): array
    {
        $statement = $this->pdo->prepare('SELECT id,scene_id,name,actor_id,revision,created_at FROM vtt_scene_checkpoints
            WHERE world_id = ? AND scene_id = ? ORDER BY created_at DESC, id DESC');
        $statement->execute([$this->worldId, $sceneId]);
        return array_map([$this, 'metadata'], $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function get(string $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM vtt_scene_checkpoints WHERE world_id = ? AND id = ?');
        $statement->execute([$this->worldId, $id]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row ? [...$this->metadata($row), 'data'=>json_decode($row['data_json'], true, 512, JSON_THROW_ON_ERROR)] : null;
    }

    public function remove(string $id): bool
    {
        $statement = $this->pdo->prepare('DELETE FROM vtt_scene_checkpoints WHERE world_id = ? AND id = ?');
        $statement->execute([$this->worldId, $id]);
        return $statement->rowCount() > 0;
    }

    private function metadata(array $row): array
    {
        return ['id'=>$row['id'], 'sceneId'=>$row['scene_id'], 'name'=>$row['name'], 'actorId'=>$row['actor_id'],
            'revision'=>(int) $row['revision'], 'createdAt'=>(int) $row['created_at']];
    }
}
