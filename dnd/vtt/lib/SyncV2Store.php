<?php
declare(strict_types=1);

/**
 * SQLite authority for Sync V2.
 *
 * Phase 1 only accepts shadow.observe commands. Nothing in this class reads
 * or writes the legacy board-state JSON, so no live VTT domain is dual-owned.
 */
final class SyncV2Store
{
    private PDO $pdo;
    private string $worldId;
    private int $eventRetention;
    private int $snapshotInterval;

    public function __construct(
        string $databasePath,
        string $worldId = 'default',
        int $eventRetention = 1000,
        int $snapshotInterval = 100
    ) {
        if (!extension_loaded('pdo_sqlite')) {
            throw new RuntimeException('Sync V2 requires the PDO SQLite extension.');
        }

        $worldId = trim($worldId);
        if ($worldId === '') {
            throw new InvalidArgumentException('A Sync V2 world ID is required.');
        }

        $directory = dirname($databasePath);
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to prepare Sync V2 storage.');
        }

        $this->pdo = new PDO('sqlite:' . $databasePath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $this->pdo->exec('PRAGMA journal_mode = WAL');
        $this->pdo->exec('PRAGMA synchronous = NORMAL');
        $this->pdo->exec('PRAGMA foreign_keys = ON');
        $this->pdo->exec('PRAGMA busy_timeout = 5000');

        $this->worldId = $worldId;
        $this->eventRetention = max(1, $eventRetention);
        $this->snapshotInterval = max(1, $snapshotInterval);
        $this->initializeSchema();
    }

    public function getSnapshot(): array
    {
        $statement = $this->pdo->prepare(
            'SELECT revision, state_json, updated_at
             FROM vtt_world_state
             WHERE world_id = :world_id'
        );
        $statement->execute(['world_id' => $this->worldId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            throw new RuntimeException('Sync V2 world state is unavailable.');
        }

        return [
            'revision' => max(0, (int) $row['revision']),
            'state' => $this->decodeObject((string) $row['state_json']),
            'serverTime' => (int) $row['updated_at'],
        ];
    }

    /**
     * Accept a Phase 1 shadow command atomically.
     *
     * @return array{status:string,event?:array,snapshot?:array,idempotent?:bool,error?:string}
     */
    public function acceptShadowCommand(array $command, string $actorId): array
    {
        $normalized = $this->normalizeShadowCommand($command);
        $actorId = trim($actorId);
        if ($actorId === '') {
            throw new InvalidArgumentException('An authenticated actor ID is required.');
        }

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($normalized['operationId']);
            if ($existing !== null) {
                $this->pdo->exec('COMMIT');
                return [
                    'status' => 'accepted',
                    'event' => $existing,
                    'idempotent' => true,
                ];
            }

            $snapshot = $this->getSnapshot();
            if ($normalized['baseRevision'] !== $snapshot['revision']) {
                $this->pdo->exec('ROLLBACK');
                return [
                    'status' => 'conflict',
                    'error' => 'base_revision_mismatch',
                    'snapshot' => $snapshot,
                ];
            }

            $revision = $snapshot['revision'] + 1;
            $serverTime = $this->nowMilliseconds();
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => 'shadow.observed',
                'actorId' => $actorId,
                'sceneId' => $normalized['sceneId'],
                'entityId' => $normalized['entityId'],
                'entityRevision' => $normalized['entityRevision'],
                'payload' => $normalized['payload'],
                'serverTime' => $serverTime,
            ];

            $state = $snapshot['state'];
            $observations = $state['shadow']['observations'] ?? [];
            if (!is_array($observations)) {
                $observations = [];
            }
            $observations[] = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'actorId' => $actorId,
                'sceneId' => $normalized['sceneId'],
                'entityId' => $normalized['entityId'],
                'payload' => $normalized['payload'],
                'serverTime' => $serverTime,
            ];
            $state['shadow'] = [
                'mode' => 'shadow',
                'observations' => array_slice($observations, -200),
            ];

            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);

            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');

            return [
                'status' => 'accepted',
                'event' => $event,
                'idempotent' => false,
            ];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            } else {
                try {
                    $this->pdo->exec('ROLLBACK');
                } catch (Throwable $ignored) {
                    // Preserve the original failure.
                }
            }
            throw $error;
        }
    }

    /**
     * Atomically validate and accept one canonical token movement.
     *
     * The global base revision is an observation/recovery cursor, not a lock
     * on the whole world. A client may be behind because an unrelated token
     * moved; the per-entity revision is the conflict boundary that prevents
     * simultaneous moves of the same token from silently overwriting.
     *
     * @return array{status:string,event?:array,snapshot?:array,idempotent?:bool,error?:string}
     */
    public function acceptTokenMove(array $command, string $actorId, array $legacyPlacement): array
    {
        $normalized = $this->normalizeTokenMove($command);
        $actorId = trim($actorId);
        if ($actorId === '') {
            throw new InvalidArgumentException('An authenticated actor ID is required.');
        }

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($normalized['operationId']);
            if ($existing !== null) {
                $this->pdo->exec('COMMIT');
                return [
                    'status' => 'accepted',
                    'event' => $existing,
                    'idempotent' => true,
                ];
            }

            $snapshot = $this->getSnapshot();
            if ($normalized['baseRevision'] > $snapshot['revision']) {
                $this->pdo->exec('ROLLBACK');
                return [
                    'status' => 'conflict',
                    'error' => 'base_revision_ahead',
                    'snapshot' => $snapshot,
                ];
            }

            $state = $snapshot['state'];
            if (!isset($state['placements']) || !is_array($state['placements'])) {
                $state['placements'] = [];
            }
            if (!isset($state['placements'][$normalized['sceneId']])
                || !is_array($state['placements'][$normalized['sceneId']])) {
                $state['placements'][$normalized['sceneId']] = [];
            }
            $current = $state['placements'][$normalized['sceneId']][$normalized['entityId']] ?? [
                'id' => $normalized['entityId'],
                'column' => (float) ($legacyPlacement['column'] ?? 0),
                'row' => (float) ($legacyPlacement['row'] ?? 0),
                'width' => max(1, (float) ($legacyPlacement['width'] ?? 1)),
                'height' => max(1, (float) ($legacyPlacement['height'] ?? 1)),
                '_entityRevision' => 0,
            ];
            $currentEntityRevision = max(0, (int) ($current['_entityRevision'] ?? 0));
            if ($normalized['entityRevision'] !== $currentEntityRevision) {
                $this->pdo->exec('ROLLBACK');
                return [
                    'status' => 'conflict',
                    'error' => 'entity_revision_mismatch',
                    'snapshot' => $snapshot,
                ];
            }

            $revision = $snapshot['revision'] + 1;
            $entityRevision = $currentEntityRevision + 1;
            $serverTime = $this->nowMilliseconds();
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => 'token.moved',
                'actorId' => $actorId,
                'sceneId' => $normalized['sceneId'],
                'entityId' => $normalized['entityId'],
                'entityRevision' => $entityRevision,
                'payload' => [
                    'column' => $normalized['column'],
                    'row' => $normalized['row'],
                ],
                'serverTime' => $serverTime,
            ];
            $state['placements'][$normalized['sceneId']][$normalized['entityId']] = [
                ...$current,
                'id' => $normalized['entityId'],
                'column' => $normalized['column'],
                'row' => $normalized['row'],
                '_entityRevision' => $entityRevision,
            ];

            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);
            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');

            return [
                'status' => 'accepted',
                'event' => $event,
                'idempotent' => false,
            ];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            } else {
                try {
                    $this->pdo->exec('ROLLBACK');
                } catch (Throwable $ignored) {
                    // Preserve the original failure.
                }
            }
            throw $error;
        }
    }

    /**
     * Return ordered events after a revision, or a canonical snapshot when
     * the caller's gap predates retention or exceeds the response limit.
     */
    public function replayAfter(int $afterRevision, int $limit = 500): array
    {
        $afterRevision = max(0, $afterRevision);
        $limit = max(1, min(1000, $limit));
        $snapshot = $this->getSnapshot();

        if ($afterRevision >= $snapshot['revision']) {
            return [
                'mode' => 'events',
                'fromRevision' => $afterRevision,
                'revision' => $snapshot['revision'],
                'events' => [],
            ];
        }

        $minimum = $this->minimumRetainedRevision();
        if ($minimum !== null && $afterRevision < $minimum - 1) {
            return [
                'mode' => 'snapshot',
                'reason' => 'event_retention_gap',
                'snapshot' => $snapshot,
            ];
        }

        $statement = $this->pdo->prepare(
            'SELECT *
             FROM vtt_events
             WHERE world_id = :world_id AND revision > :after_revision
             ORDER BY revision ASC
             LIMIT :event_limit'
        );
        $statement->bindValue(':world_id', $this->worldId, PDO::PARAM_STR);
        $statement->bindValue(':after_revision', $afterRevision, PDO::PARAM_INT);
        $statement->bindValue(':event_limit', $limit + 1, PDO::PARAM_INT);
        $statement->execute();
        $rows = $statement->fetchAll();

        if (count($rows) > $limit) {
            return [
                'mode' => 'snapshot',
                'reason' => 'event_limit_exceeded',
                'snapshot' => $snapshot,
            ];
        }

        return [
            'mode' => 'events',
            'fromRevision' => $afterRevision,
            'revision' => $snapshot['revision'],
            'events' => array_map(fn (array $row): array => $this->decodeEventRow($row), $rows),
        ];
    }

    private function initializeSchema(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS vtt_world_state (
                world_id TEXT PRIMARY KEY,
                revision INTEGER NOT NULL CHECK (revision >= 0),
                state_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )'
        );
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS vtt_events (
                world_id TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK (revision > 0),
                operation_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                scene_id TEXT,
                entity_id TEXT,
                entity_revision INTEGER,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (world_id, revision),
                UNIQUE (world_id, operation_id)
            )'
        );
        $this->pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_vtt_events_world_created
             ON vtt_events (world_id, created_at)'
        );
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS vtt_operations (
                world_id TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                event_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (world_id, operation_id)
            )'
        );
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS vtt_snapshots (
                world_id TEXT NOT NULL,
                revision INTEGER NOT NULL,
                state_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (world_id, revision)
            )'
        );

        $now = $this->nowMilliseconds();
        $initialState = $this->encodeJson([
            'shadow' => [
                'mode' => 'shadow',
                'observations' => [],
            ],
        ]);
        $statement = $this->pdo->prepare(
            'INSERT OR IGNORE INTO vtt_world_state
             (world_id, revision, state_json, updated_at)
             VALUES (:world_id, 0, :state_json, :updated_at)'
        );
        $statement->execute([
            'world_id' => $this->worldId,
            'state_json' => $initialState,
            'updated_at' => $now,
        ]);
        $snapshot = $this->pdo->prepare(
            'INSERT OR IGNORE INTO vtt_snapshots
             (world_id, revision, state_json, created_at)
             VALUES (:world_id, 0, :state_json, :created_at)'
        );
        $snapshot->execute([
            'world_id' => $this->worldId,
            'state_json' => $initialState,
            'created_at' => $now,
        ]);
    }

    private function normalizeShadowCommand(array $command): array
    {
        $operationId = trim((string) ($command['operationId'] ?? ''));
        if (
            strlen($operationId) < 8
            || strlen($operationId) > 128
            || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1
        ) {
            throw new InvalidArgumentException('operationId is invalid.');
        }

        if (($command['type'] ?? null) !== 'shadow.observe') {
            throw new InvalidArgumentException('Phase 1 only accepts shadow.observe commands.');
        }

        $baseRevision = filter_var(
            $command['baseRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        if ($baseRevision === false) {
            throw new InvalidArgumentException('baseRevision must be a non-negative integer.');
        }

        $payload = $command['payload'] ?? [];
        if (!is_array($payload)) {
            throw new InvalidArgumentException('payload must be a JSON object.');
        }
        if (strlen($this->encodeJson($payload)) > 32768) {
            throw new InvalidArgumentException('payload exceeds the Phase 1 size limit.');
        }

        $entityRevision = null;
        if (array_key_exists('entityRevision', $command) && $command['entityRevision'] !== null) {
            $validated = filter_var(
                $command['entityRevision'],
                FILTER_VALIDATE_INT,
                ['options' => ['min_range' => 0]]
            );
            if ($validated === false) {
                throw new InvalidArgumentException('entityRevision must be a non-negative integer.');
            }
            $entityRevision = (int) $validated;
        }

        return [
            'operationId' => $operationId,
            'baseRevision' => (int) $baseRevision,
            'sceneId' => $this->normalizeOptionalId($command['sceneId'] ?? null),
            'entityId' => $this->normalizeOptionalId($command['entityId'] ?? null),
            'entityRevision' => $entityRevision,
            'payload' => $payload,
        ];
    }

    private function normalizeTokenMove(array $command): array
    {
        $operationId = trim((string) ($command['operationId'] ?? ''));
        if (
            strlen($operationId) < 8
            || strlen($operationId) > 128
            || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1
        ) {
            throw new InvalidArgumentException('operationId is invalid.');
        }
        if (($command['type'] ?? null) !== 'token.move') {
            throw new InvalidArgumentException('Expected token.move.');
        }
        $sceneId = $this->normalizeOptionalId($command['sceneId'] ?? null);
        $entityId = $this->normalizeOptionalId(
            $command['entityId'] ?? $command['payload']['placementId'] ?? null
        );
        if ($sceneId === null || $entityId === null) {
            throw new InvalidArgumentException('token.move requires sceneId and entityId.');
        }
        $baseRevision = filter_var(
            $command['baseRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        $entityRevision = filter_var(
            $command['entityRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        if ($baseRevision === false || $entityRevision === false) {
            throw new InvalidArgumentException('Revisions must be non-negative integers.');
        }
        $column = $command['payload']['column'] ?? null;
        $row = $command['payload']['row'] ?? null;
        if (!is_numeric($column) || !is_numeric($row)) {
            throw new InvalidArgumentException('token.move requires numeric column and row.');
        }
        $column = (float) $column;
        $row = (float) $row;
        if (!is_finite($column) || !is_finite($row) || $column < 0 || $row < 0
            || $column > 100000 || $row > 100000) {
            throw new InvalidArgumentException('token.move coordinates are out of range.');
        }
        return [
            'operationId' => $operationId,
            'baseRevision' => (int) $baseRevision,
            'entityRevision' => (int) $entityRevision,
            'sceneId' => $sceneId,
            'entityId' => $entityId,
            'column' => $column,
            'row' => $row,
        ];
    }

    private function normalizeOptionalId($value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $normalized = trim($value);
        if ($normalized === '') {
            return null;
        }
        if (strlen($normalized) > 128) {
            throw new InvalidArgumentException('Identifier exceeds 128 characters.');
        }
        return $normalized;
    }

    private function findEventByOperationId(string $operationId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT event_json
             FROM vtt_operations
             WHERE world_id = :world_id AND operation_id = :operation_id'
        );
        $statement->execute([
            'world_id' => $this->worldId,
            'operation_id' => $operationId,
        ]);
        $row = $statement->fetch();
        return is_array($row) ? $this->decodeObject((string) $row['event_json']) : null;
    }

    private function insertEvent(array $event): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO vtt_events (
                world_id, revision, operation_id, actor_id, scene_id,
                entity_id, entity_revision, event_type, payload_json, created_at
             ) VALUES (
                :world_id, :revision, :operation_id, :actor_id, :scene_id,
                :entity_id, :entity_revision, :event_type, :payload_json, :created_at
             )'
        );
        $statement->execute([
            'world_id' => $this->worldId,
            'revision' => $event['revision'],
            'operation_id' => $event['operationId'],
            'actor_id' => $event['actorId'],
            'scene_id' => $event['sceneId'],
            'entity_id' => $event['entityId'],
            'entity_revision' => $event['entityRevision'],
            'event_type' => $event['type'],
            'payload_json' => $this->encodeJson($event['payload']),
            'created_at' => $event['serverTime'],
        ]);

        $operation = $this->pdo->prepare(
            'INSERT INTO vtt_operations
             (world_id, operation_id, event_json, created_at)
             VALUES (:world_id, :operation_id, :event_json, :created_at)'
        );
        $operation->execute([
            'world_id' => $this->worldId,
            'operation_id' => $event['operationId'],
            'event_json' => $this->encodeJson($event),
            'created_at' => $event['serverTime'],
        ]);
    }

    private function updateWorldState(int $revision, array $state, int $serverTime): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE vtt_world_state
             SET revision = :revision, state_json = :state_json, updated_at = :updated_at
             WHERE world_id = :world_id'
        );
        $statement->execute([
            'revision' => $revision,
            'state_json' => $this->encodeJson($state),
            'updated_at' => $serverTime,
            'world_id' => $this->worldId,
        ]);
    }

    private function insertSnapshot(int $revision, array $state, int $serverTime): void
    {
        $statement = $this->pdo->prepare(
            'INSERT OR REPLACE INTO vtt_snapshots
             (world_id, revision, state_json, created_at)
             VALUES (:world_id, :revision, :state_json, :created_at)'
        );
        $statement->execute([
            'world_id' => $this->worldId,
            'revision' => $revision,
            'state_json' => $this->encodeJson($state),
            'created_at' => $serverTime,
        ]);
    }

    private function pruneEvents(int $currentRevision): void
    {
        $cutoff = $currentRevision - $this->eventRetention;
        if ($cutoff <= 0) {
            return;
        }
        $statement = $this->pdo->prepare(
            'DELETE FROM vtt_events
             WHERE world_id = :world_id AND revision <= :cutoff'
        );
        $statement->execute([
            'world_id' => $this->worldId,
            'cutoff' => $cutoff,
        ]);
    }

    private function minimumRetainedRevision(): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT MIN(revision) AS minimum_revision
             FROM vtt_events
             WHERE world_id = :world_id'
        );
        $statement->execute(['world_id' => $this->worldId]);
        $value = $statement->fetchColumn();
        return $value === false || $value === null ? null : (int) $value;
    }

    private function decodeEventRow(array $row): array
    {
        return [
            'revision' => (int) $row['revision'],
            'operationId' => (string) $row['operation_id'],
            'type' => (string) $row['event_type'],
            'actorId' => (string) $row['actor_id'],
            'sceneId' => $row['scene_id'] === null ? null : (string) $row['scene_id'],
            'entityId' => $row['entity_id'] === null ? null : (string) $row['entity_id'],
            'entityRevision' => $row['entity_revision'] === null
                ? null
                : (int) $row['entity_revision'],
            'payload' => $this->decodeObject((string) $row['payload_json']),
            'serverTime' => (int) $row['created_at'],
        ];
    }

    private function encodeJson(array $value): string
    {
        $encoded = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded)) {
            throw new InvalidArgumentException('Value is not JSON serializable.');
        }
        return $encoded;
    }

    private function decodeObject(string $json): array
    {
        $decoded = json_decode($json, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Stored Sync V2 JSON is invalid.');
        }
        return $decoded;
    }

    private function nowMilliseconds(): int
    {
        return (int) floor(microtime(true) * 1000);
    }
}
