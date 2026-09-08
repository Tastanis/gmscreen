<?php
declare(strict_types=1);
require_once __DIR__ . '/FloorGeometry.php';
require_once __DIR__ . '/MovementUndo.php';
require_once __DIR__ . '/PlayerRoster.php';
require_once __DIR__ . '/SceneCheckpointArchive.php';
require_once __DIR__ . '/SceneCheckpointRestore.php';
require_once __DIR__ . '/ScenePackage.php';
require_once __DIR__ . '/SceneImportValidation.php';

/**
 * SQLite authority for Sync V2.
 *
 * Phase 1 only accepts shadow.observe commands. Nothing in this class reads
 * or writes the legacy board-state JSON, so no live VTT domain is dual-owned.
 */
require_once __DIR__ . '/ZoneEntryReceipt.php';
require_once __DIR__ . '/ZoneEntryClaims.php';

final class SyncV2Store
{
    private array $playerCharacterUserIds;

    private PDO $pdo;
    private string $worldId;
    private int $eventRetention;
    private int $snapshotInterval;
    private int $snapshotRetention;

    public function __construct(
        string $databasePath,
        string $worldId = 'default',
        int $eventRetention = 1000,
        int $snapshotInterval = 100,
        int $snapshotRetention = 20
    ) {
        $this->playerCharacterUserIds = PlayerRoster::playerIds();
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
        $this->snapshotRetention = max(2, min(200, $snapshotRetention));
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

        $state = $this->decodeObject((string) $row['state_json']);
        // Token claims were removed in favor of the ally/enemy model. Ignore
        // any stale claim domain left by an older deployment; the next
        // canonical write permanently drops it.
        unset($state['claims']);
        return [
            'revision' => max(0, (int) $row['revision']),
            'state' => $state,
            'serverTime' => (int) $row['updated_at'],
        ];
    }

    public function touchPresence(string $actorId, bool $isGm): void
    {
        $actorId = strtolower(trim($actorId));
        if ($actorId === '') {
            return;
        }
        $statement = $this->pdo->prepare(
            'INSERT INTO vtt_presence (world_id, user_id, is_gm, last_seen)
             VALUES (:world_id, :user_id, :is_gm, :last_seen)
             ON CONFLICT(world_id, user_id) DO UPDATE SET
               is_gm = excluded.is_gm,
               last_seen = excluded.last_seen'
        );
        $statement->execute([
            'world_id' => $this->worldId,
            'user_id' => $actorId,
            'is_gm' => $isGm ? 1 : 0,
            'last_seen' => $this->nowMilliseconds(),
        ]);
    }

    /**
     * Server-authoritative remote ability-test request lifecycle. Requests are
     * stored in canonical world state so reload/replay can resume them, while
     * audience projection exposes each request only to its initiator,
     * recipient, and the GM.
     */
    public function acceptRequestedTestCommand(
        array $command,
        string $actorId,
        bool $isGm
    ): array {
        $normalized = $this->normalizeRequestedTestCommand($command);
        $actorId = strtolower(trim($actorId));
        if ($actorId === '') {
            throw new InvalidArgumentException('An authenticated actor ID is required.');
        }
        $this->touchPresence($actorId, $isGm);

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($normalized['operationId']);
            if ($existing !== null) {
                $this->pdo->exec('COMMIT');
                return ['status' => 'accepted', 'event' => $existing, 'idempotent' => true];
            }
            $snapshot = $this->getSnapshot();
            if ($normalized['baseRevision'] > $snapshot['revision']) {
                return $this->rollbackConflict('base_revision_ahead', $snapshot);
            }
            $state = $snapshot['state'];
            $state['requestedTests'] = is_array($state['requestedTests'] ?? null)
                ? $state['requestedTests']
                : [];
            $type = $normalized['type'];
            $payload = $normalized['payload'];
            $requestId = $normalized['requestId'];
            $before = is_array($state['requestedTests'][$requestId] ?? null)
                ? $state['requestedTests'][$requestId]
                : null;
            $request = $before;
            $removed = false;
            $batchRequests = null;

            if ($type === 'requestedTest.create') {
                if ($before !== null) {
                    return $this->rollbackConflict('requested_test_exists', $snapshot);
                }
                $requestInput = is_array($payload['request'] ?? null) ? $payload['request'] : [];
                $recipient = $this->resolveRequestedTestRecipient(
                    strtolower(trim((string) ($requestInput['recipientId'] ?? ''))),
                    $actorId
                );
                $request = $this->normalizeRequestedTestRecord([
                    ...$requestInput,
                    'id' => $requestId,
                    'sceneId' => $normalized['sceneId'],
                    'initiatorId' => $actorId,
                    'recipientId' => $recipient,
                    'originalRecipientId' => $recipient,
                    'status' => 'pending',
                    'createdAt' => $this->nowMilliseconds(),
                    'updatedAt' => $this->nowMilliseconds(),
                ]);
                $state['requestedTests'][$requestId] = $request;
            } else {
                if ($before === null) {
                    return $this->rollbackConflict('requested_test_not_found', $snapshot);
                }
                $initiatorId = strtolower((string) ($before['initiatorId'] ?? ''));
                $recipientId = strtolower((string) ($before['recipientId'] ?? ''));
                if ($type === 'requestedTest.reassign') {
                    if ($actorId !== $initiatorId) {
                        throw new InvalidArgumentException('Only the ability user may recall requested tests.');
                    }
                    if (($before['status'] ?? '') !== 'pending') {
                        return $this->rollbackConflict('requested_test_not_pending', $snapshot);
                    }
                    $request['recipientId'] = $actorId;
                    $request['updatedAt'] = $this->nowMilliseconds();
                    $state['requestedTests'][$requestId] = $request;
                } elseif ($type === 'requestedTest.resolve') {
                    if ($actorId !== $recipientId) {
                        throw new InvalidArgumentException('Only the assigned roller may submit this test.');
                    }
                    if (($before['status'] ?? '') !== 'pending') {
                        return $this->rollbackConflict('requested_test_already_finished', $snapshot);
                    }
                    $request['status'] = 'resolved';
                    $request['result'] = $this->normalizeRequestedTestResult($payload['result'] ?? null);
                    $request['resolvedBy'] = $actorId;
                    $request['updatedAt'] = $this->nowMilliseconds();
                    $state['requestedTests'][$requestId] = $request;
                } elseif ($type === 'requestedTest.claim') {
                    if ($actorId !== $initiatorId) {
                        throw new InvalidArgumentException('Only the ability user may claim requested-test effects.');
                    }
                    $batchId = trim((string) ($before['test']['batchId'] ?? $requestId));
                    $batchRequests = [];
                    foreach ($state['requestedTests'] as $candidateId => $candidate) {
                        if (!is_array($candidate)) continue;
                        $candidateBatchId = trim((string) ($candidate['test']['batchId'] ?? $candidateId));
                        if ($candidateBatchId !== $batchId || strtolower((string) ($candidate['initiatorId'] ?? '')) !== $actorId) continue;
                        if (($candidate['status'] ?? '') !== 'resolved') {
                            return $this->rollbackConflict('requested_test_batch_not_resolved', $snapshot);
                        }
                        $candidate['status'] = 'applying';
                        $candidate['claimedBy'] = $actorId;
                        $candidate['updatedAt'] = $this->nowMilliseconds();
                        $state['requestedTests'][$candidateId] = $candidate;
                        $batchRequests[$candidateId] = $candidate;
                    }
                    if ($batchRequests === []) {
                        return $this->rollbackConflict('requested_test_batch_not_found', $snapshot);
                    }
                    $request = $batchRequests[$requestId] ?? reset($batchRequests);
                } elseif ($type === 'requestedTest.cancel') {
                    if ($actorId !== $initiatorId && $actorId !== $recipientId && !$isGm) {
                        throw new InvalidArgumentException('Only a participant may cancel this requested test.');
                    }
                    if (($before['status'] ?? '') === 'completed') {
                        return $this->rollbackConflict('requested_test_already_finished', $snapshot);
                    }
                    $request['status'] = 'canceled';
                    $request['canceledBy'] = $actorId;
                    $request['updatedAt'] = $this->nowMilliseconds();
                    $state['requestedTests'][$requestId] = $request;
                } elseif ($type === 'requestedTest.complete') {
                    if ($actorId !== $initiatorId && !$isGm) {
                        throw new InvalidArgumentException('Only the ability user may complete this requested test.');
                    }
                    unset($state['requestedTests'][$requestId]);
                    $removed = true;
                }
            }

            $revision = $snapshot['revision'] + 1;
            $serverTime = $this->nowMilliseconds();
            $visibleTo = array_values(array_unique(array_filter([
                strtolower((string) ($before['initiatorId'] ?? '')),
                strtolower((string) ($before['recipientId'] ?? '')),
                strtolower((string) ($request['initiatorId'] ?? '')),
                strtolower((string) ($request['recipientId'] ?? '')),
            ])));
            if (is_array($batchRequests)) {
                foreach ($batchRequests as $batchRequest) {
                    $visibleTo[] = strtolower((string) ($batchRequest['initiatorId'] ?? ''));
                    $visibleTo[] = strtolower((string) ($batchRequest['recipientId'] ?? ''));
                }
                $visibleTo = array_values(array_unique(array_filter($visibleTo)));
            }
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => 'requestedTest.changed',
                'actorId' => $actorId,
                'sceneId' => $normalized['sceneId'],
                'entityId' => $requestId,
                'entityRevision' => null,
                'payload' => [
                    'requestId' => $requestId,
                    'request' => $removed ? null : $request,
                    'requests' => $batchRequests,
                    'removed' => $removed,
                    'visibleTo' => $visibleTo,
                ],
                'serverTime' => $serverTime,
            ];
            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);
            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');
            return ['status' => 'accepted', 'event' => $event, 'idempotent' => false];
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /**
     * Atomically remove every canonical record owned by a deleted scene.
     *
     * @return array{status:string,event:array}
     */
    /** Import authority. The HTTP installer holds the catalog lock; validation and
     * fresh-ID preparation run here before writes. No catalog or asset files are written here. */
    public function installScenePackage(array $package, string $operationId, string $actorId, bool $isGm): array
    {
        if (!$isGm || trim($actorId) === '') throw new InvalidArgumentException('Scene import is GM-only.');
        if (!preg_match('/^[A-Za-z0-9._:-]{8,128}$/', $operationId)) throw new InvalidArgumentException('Invalid import operation ID.');
        $requestHash = hash('sha256', $this->encodeJson($package));
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $query = $this->pdo->prepare('SELECT * FROM vtt_scene_imports WHERE world_id = ? AND operation_id = ?');
            $query->execute([$this->worldId, $operationId]);
            $receipt = $query->fetch();
            if ($receipt) {
                if ($receipt['actor_id'] !== $actorId || !hash_equals($receipt['request_hash'], $requestHash)) throw new InvalidArgumentException('Import operation ID already belongs to a different request.');
                $event = $this->findEventByOperationId($operationId);
                if ($event === null) throw new RuntimeException('Import receipt is missing its accepted event.');
                $this->pdo->exec('COMMIT');
                return ['status'=>'accepted','event'=>$event,'scene'=>json_decode($receipt['catalog_json'],true,128,JSON_THROW_ON_ERROR),'idempotent'=>true];
            }
            if ($this->findEventByOperationId($operationId) !== null) throw new InvalidArgumentException('Operation ID is already in use.');
            SceneImportValidation::validate($package);
            $sceneId = 'scn-' . substr(hash('sha256', $this->worldId . "\0" . $actorId . "\0" . $operationId), 0, 40);
            $prepared = ScenePackage::prepareForNewScene($package, $sceneId)['package'];
            $primaryProfiles = [];
            foreach ($prepared['domains']['placements'] as $placement) if (($placement['primaryPc'] ?? false) === true) {
                $profile = $this->linkedPlayerProfileForPlacement($placement);
                if ($profile === null || isset($primaryProfiles[$profile])) throw new InvalidArgumentException('Each imported primary token must have a distinct configured player profile.');
                $primaryProfiles[$profile] = true;
            }
            $snapshot = $this->getSnapshot(); $state = $snapshot['state'];
            foreach (['placements','sceneConfig','drawings','templates','combat'] as $domain) {
                if (array_key_exists($sceneId, $state[$domain] ?? [])) throw new InvalidArgumentException('The reserved scene already exists.');
            }
            $domains = $prepared['domains'];
            $domains['sceneConfig']['_revision'] = 1;
            foreach (['placements','drawings','templates'] as $domain) foreach ($domains[$domain] as &$entry) $entry['_entityRevision'] = 1;
            unset($entry);
            foreach ($domains as $domain=>$entries) $state[$domain][$sceneId] = $entries;
            $scene = array_intersect_key($prepared['scene'], array_flip(['id','name','mapUrl','thumbnailUrl','grid']));
            $scene['folderId'] = null;
            $scene['_importOperationId'] = $operationId;
            // Import visibility must be explicit in the eventual UI. This operation
            // creates a browsable scene; it never activates it for anyone.
            $scene['playerVisible'] = true;
            $scene['createdAt'] = gmdate('c');
            $revision = $snapshot['revision'] + 1; $serverTime = $this->nowMilliseconds();
            $event = ['revision'=>$revision,'operationId'=>$operationId,'type'=>'scene.installed','actorId'=>$actorId,
                'sceneId'=>$sceneId,'entityId'=>null,'entityRevision'=>1,'payload'=>['domains'=>$domains],'serverTime'=>$serverTime];
            $insert = $this->pdo->prepare('INSERT INTO vtt_scene_imports (world_id,operation_id,actor_id,scene_id,request_hash,catalog_json,pending_catalog) VALUES (?,?,?,?,?,?,1)');
            $insert->execute([$this->worldId,$operationId,$actorId,$sceneId,$requestHash,$this->encodeJson($scene)]);
            $this->insertEvent($event);
            $this->updateWorldState($revision,$state,$serverTime);
            if ($revision % $this->snapshotInterval === 0) $this->insertSnapshot($revision,$state,$serverTime);
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');
            return ['status'=>'accepted','event'=>$event,'scene'=>$scene,'idempotent'=>false];
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /** Durable catalog outbox. Only acknowledge after the locked atomic catalog save. */
    public function pendingSceneImports(): array
    {
        $query = $this->pdo->prepare('SELECT operation_id,catalog_json FROM vtt_scene_imports WHERE world_id = ? AND pending_catalog = 1 ORDER BY operation_id');
        $query->execute([$this->worldId]);
        return array_map(static fn($row)=>['operationId'=>$row['operation_id'],'scene'=>json_decode($row['catalog_json'],true,128,JSON_THROW_ON_ERROR)],$query->fetchAll());
    }

    public function acknowledgeSceneImportCatalog(string $operationId): void
    {
        $query = $this->pdo->prepare('UPDATE vtt_scene_imports SET pending_catalog = 0 WHERE world_id = ? AND operation_id = ?');
        $query->execute([$this->worldId,$operationId]);
    }

    public function deleteScene(string $sceneId, string $actorId): array
    {
        $sceneId = trim($sceneId);
        $actorId = trim($actorId);
        if ($sceneId === '' || $actorId === '') {
            throw new InvalidArgumentException('Scene deletion requires a scene ID and actor ID.');
        }

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $snapshot = $this->getSnapshot();
            $state = $snapshot['state'];
            $cancelImport = $this->pdo->prepare('UPDATE vtt_scene_imports SET pending_catalog = 0 WHERE world_id = ? AND scene_id = ?');
            $cancelImport->execute([$this->worldId, $sceneId]);
            foreach (['placements', 'combat', 'templates', 'drawings', 'sceneConfig'] as $domain) {
                if (is_array($state[$domain] ?? null)) {
                    unset($state[$domain][$sceneId]);
                }
            }
            if (is_array($state['pings'] ?? null)) {
                foreach ($state['pings'] as $pingId => $ping) {
                    if (is_array($ping) && trim((string) ($ping['sceneId'] ?? '')) === $sceneId) {
                        unset($state['pings'][$pingId]);
                    }
                }
            }
            if (is_array($state['requestedTests'] ?? null)) {
                foreach ($state['requestedTests'] as $requestId => $request) {
                    if (is_array($request) && trim((string) ($request['sceneId'] ?? '')) === $sceneId) {
                        unset($state['requestedTests'][$requestId]);
                    }
                }
            }
            $state['routing'] = is_array($state['routing'] ?? null) ? $state['routing'] : [];
            if (($state['routing']['activeSceneId'] ?? null) === $sceneId) {
                $state['routing']['activeSceneId'] = null;
                $state['routing']['mapUrl'] = null;
            }
            if (($state['routing']['playerActiveSceneId'] ?? null) === $sceneId) {
                $state['routing']['playerActiveSceneId'] = null;
                $state['routing']['playerMapUrl'] = null;
                $state['routing']['playerThumbnailUrl'] = null;
            }
            $state['routing']['_revision'] = max(0, (int) ($state['routing']['_revision'] ?? 0)) + 1;

            $revision = $snapshot['revision'] + 1;
            $serverTime = $this->nowMilliseconds();
            $event = [
                'revision' => $revision,
                'operationId' => 'scene-delete:' . $sceneId . ':' . $revision,
                'type' => 'scene.deleted',
                'actorId' => $actorId,
                'sceneId' => $sceneId,
                'entityId' => null,
                'entityRevision' => $state['routing']['_revision'],
                'payload' => ['routing' => $state['routing']],
                'serverTime' => $serverTime,
            ];
            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);
            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');
            return ['status' => 'accepted', 'event' => $event];
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /**
     * One-time Phase 4 import of legacy placements. Existing
     * Phase 3 movement coordinates and entity revisions win over legacy
     * values so enabling the broader placement domain cannot pop tokens back.
     */
    public function migrateLegacyPlacements(array $boardState): void
    {
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $snapshot = $this->getSnapshot();
            $state = $snapshot['state'];
            if (($state['placementMigration']['version'] ?? 0) >= 1) {
                $this->pdo->exec('COMMIT');
                return;
            }

            $canonical = isset($state['placements']) && is_array($state['placements'])
                ? $state['placements']
                : [];
            foreach (($boardState['placements'] ?? []) as $sceneId => $placements) {
                if (!is_string($sceneId) || !is_array($placements)) {
                    continue;
                }
                $canonical[$sceneId] = is_array($canonical[$sceneId] ?? null)
                    ? $canonical[$sceneId]
                    : [];
                foreach ($placements as $placement) {
                    if (!is_array($placement)) {
                        continue;
                    }
                    $placementId = $this->normalizeOptionalId($placement['id'] ?? null);
                    if ($placementId === null) {
                        continue;
                    }
                    $existing = is_array($canonical[$sceneId][$placementId] ?? null)
                        ? $canonical[$sceneId][$placementId]
                        : [];
                    $canonical[$sceneId][$placementId] = [
                        ...$placement,
                        ...$existing,
                        'id' => $placementId,
                        '_entityRevision' => max(0, (int) ($existing['_entityRevision'] ?? 0)),
                    ];
                }
            }

            $state['placements'] = $canonical;
            unset($state['claims']);
            $state['placementMigration'] = [
                'version' => 1,
                'migratedAt' => $this->nowMilliseconds(),
            ];
            $this->updateWorldState(
                $snapshot['revision'],
                $state,
                $this->nowMilliseconds()
            );
            $this->pdo->exec('COMMIT');
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /**
     * One-time Phase 5 import of the legacy per-scene combat records.
     */
    public function migrateLegacyCombat(array $boardState): void
    {
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $snapshot = $this->getSnapshot();
            $state = $snapshot['state'];
            if (($state['combatMigration']['version'] ?? 0) >= 1) {
                $this->pdo->exec('COMMIT');
                return;
            }
            $combatByScene = is_array($state['combat'] ?? null) ? $state['combat'] : [];
            foreach (($boardState['sceneState'] ?? []) as $sceneId => $sceneState) {
                if (!is_string($sceneId) || !is_array($sceneState) || !is_array($sceneState['combat'] ?? null)) {
                    continue;
                }
                $combatByScene[$sceneId] = $this->normalizeCombatState($sceneState['combat']);
            }
            $state['combat'] = $combatByScene;
            $state['combatMigration'] = [
                'version' => 1,
                'migratedAt' => $this->nowMilliseconds(),
            ];
            $this->updateWorldState($snapshot['revision'], $state, $this->nowMilliseconds());
            $this->pdo->exec('COMMIT');
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /**
     * One-time Phase 6 import of the remaining shared board domains.
     * Collections are converted to id-keyed canonical maps while scene
     * configuration and routing retain their established public shapes.
     */
    public function migrateLegacyBoardDomains(array $boardState): void
    {
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $snapshot = $this->getSnapshot();
            $state = $snapshot['state'];
            if (($state['boardDomainMigration']['version'] ?? 0) >= 1) {
                $this->pdo->exec('COMMIT');
                return;
            }

            foreach (['templates', 'drawings'] as $domain) {
                $canonical = is_array($state[$domain] ?? null) ? $state[$domain] : [];
                foreach (($boardState[$domain] ?? []) as $sceneId => $entries) {
                    if (!is_string($sceneId) || !is_array($entries)) {
                        continue;
                    }
                    $canonical[$sceneId] = is_array($canonical[$sceneId] ?? null)
                        ? $canonical[$sceneId]
                        : [];
                    foreach ($entries as $entry) {
                        if (!is_array($entry)) {
                            continue;
                        }
                        $id = $this->normalizeOptionalId($entry['id'] ?? null);
                        if ($id === null) {
                            continue;
                        }
                        $existing = is_array($canonical[$sceneId][$id] ?? null)
                            ? $canonical[$sceneId][$id]
                            : [];
                        $canonical[$sceneId][$id] = [
                            ...$entry,
                            ...$existing,
                            'id' => $id,
                            '_entityRevision' => max(0, (int) ($existing['_entityRevision'] ?? 0)),
                        ];
                    }
                }
                $state[$domain] = $canonical;
            }

            $pings = is_array($state['pings'] ?? null) ? $state['pings'] : [];
            foreach (($boardState['pings'] ?? []) as $ping) {
                if (!is_array($ping)) {
                    continue;
                }
                $id = $this->normalizeOptionalId($ping['id'] ?? null);
                if ($id !== null) {
                    $pings[$id] = [...$ping, 'id' => $id];
                }
            }
            $state['pings'] = $pings;

            $sceneConfig = is_array($state['sceneConfig'] ?? null) ? $state['sceneConfig'] : [];
            foreach (($boardState['sceneState'] ?? []) as $sceneId => $entry) {
                if (!is_string($sceneId) || !is_array($entry)) {
                    continue;
                }
                $existing = is_array($sceneConfig[$sceneId] ?? null)
                    ? $sceneConfig[$sceneId]
                    : [];
                foreach (['grid', 'fogOfWar', 'mapLevels', 'userLevelState'] as $field) {
                    if (array_key_exists($field, $entry)) {
                        $existing[$field] = $entry[$field];
                    }
                }
                $existing['_revision'] = max(0, (int) ($existing['_revision'] ?? 0));
                $sceneConfig[$sceneId] = $existing;
            }
            $state['sceneConfig'] = $sceneConfig;

            $routing = is_array($state['routing'] ?? null) ? $state['routing'] : [];
            foreach ([
                'activeSceneId', 'mapUrl', 'playerMapDisabled',
                'playerActiveSceneId', 'playerMapUrl', 'playerThumbnailUrl',
            ] as $field) {
                if (array_key_exists($field, $boardState)) {
                    $routing[$field] = $boardState[$field];
                }
            }
            $routing['_revision'] = max(0, (int) ($routing['_revision'] ?? 0));
            $state['routing'] = $routing;
            $state['boardDomainMigration'] = [
                'version' => 1,
                'migratedAt' => $this->nowMilliseconds(),
            ];
            $this->updateWorldState($snapshot['revision'], $state, $this->nowMilliseconds());
            $this->pdo->exec('COMMIT');
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /**
     * Accept one explicit Phase 6 board-domain command. The public command
     * catalog deliberately has no generic whole-board replacement command.
     *
     * @return array{status:string,event?:array,snapshot?:array,idempotent?:bool,error?:string}
     */
    public function acceptBoardDomainCommand(
        array $command,
        string $actorId,
        bool $isGm
    ): array {
        $normalized = $this->normalizeBoardDomainCommand($command);
        $actorId = trim($actorId);
        if ($actorId === '') {
            throw new InvalidArgumentException('An authenticated actor ID is required.');
        }

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($normalized['operationId']);
            if ($existing !== null) {
                $this->pdo->exec('COMMIT');
                return ['status' => 'accepted', 'event' => $existing, 'idempotent' => true];
            }
            $snapshot = $this->getSnapshot();
            if ($normalized['baseRevision'] > $snapshot['revision']) {
                return $this->rollbackConflict('base_revision_ahead', $snapshot);
            }

            $type = $normalized['type'];
            $sceneId = $normalized['sceneId'];
            $entityId = $normalized['entityId'];
            $payload = $normalized['payload'];
            $this->assertBoardDomainPermission($type, $payload, $actorId, $isGm);
            $state = $snapshot['state'];
            $eventType = '';
            $eventPayload = [];
            $entityRevision = null;

            if (str_starts_with($type, 'template.') || str_starts_with($type, 'drawing.')) {
                $domain = str_starts_with($type, 'template.') ? 'templates' : 'drawings';
                $payloadKey = $domain === 'templates' ? 'template' : 'drawing';
                $state[$domain] = is_array($state[$domain] ?? null) ? $state[$domain] : [];
                $state[$domain][$sceneId] = is_array($state[$domain][$sceneId] ?? null)
                    ? $state[$domain][$sceneId]
                    : [];
                $current = is_array($state[$domain][$sceneId][$entityId] ?? null)
                    ? $state[$domain][$sceneId][$entityId]
                    : null;
                $currentRevision = max(0, (int) ($current['_entityRevision'] ?? 0));
                if ($normalized['entityRevision'] !== $currentRevision) {
                    return $this->rollbackConflict('entity_revision_mismatch', $snapshot);
                }
                if (!$isGm && $current !== null
                    && strtolower(trim((string) ($current['authorId'] ?? ''))) !== strtolower($actorId)) {
                    throw new InvalidArgumentException('You may only edit or remove your own ' . $domain . '.');
                }
                if ($domain === 'templates' && !$isGm && ($current['persistent'] ?? false) === true) {
                    throw new InvalidArgumentException('Only the GM may edit or remove persistent structures.');
                }
                $entityRevision = $currentRevision + 1;
                if (str_ends_with($type, '.remove')) {
                    if ($current === null) {
                        return $this->rollbackConflict('entity_missing', $snapshot);
                    }
                    unset($state[$domain][$sceneId][$entityId]);
                    $eventType = $domain === 'templates' ? 'template.removed' : 'drawing.removed';
                } else {
                    $entry = $payload[$payloadKey];
                    // Authenticated ownership cannot be supplied or reassigned by a player.
                    $entry['authorId'] = $current['authorId']
                        ?? ($isGm ? ($entry['authorId'] ?? strtolower($actorId)) : strtolower($actorId));
                    $entry['id'] = $entityId;
                    $entry['_entityRevision'] = $entityRevision;
                    $state[$domain][$sceneId][$entityId] = $entry;
                    $eventType = $domain === 'templates' ? 'template.updated' : 'drawing.updated';
                    $eventPayload = [$payloadKey => $entry];
                }
            } elseif ($type === 'ping.add') {
                $state['pings'] = is_array($state['pings'] ?? null) ? $state['pings'] : [];
                if (isset($state['pings'][$entityId])) {
                    return $this->rollbackConflict('ping_exists', $snapshot);
                }
                $ping = $payload['ping'];
                $ping['id'] = $entityId;
                $ping['sceneId'] = $sceneId;
                $ping['authorId'] = $actorId;
                $ping['createdAt'] = $this->nowMilliseconds();
                $state['pings'][$entityId] = $ping;
                $cutoff = $this->nowMilliseconds() - 30000;
                foreach ($state['pings'] as $id => $entry) {
                    if (!is_array($entry) || (int) ($entry['createdAt'] ?? 0) < $cutoff) {
                        unset($state['pings'][$id]);
                    }
                }
                $eventType = 'ping.added';
                $eventPayload = ['ping' => $ping];
            } elseif (in_array($type, [
                'fog.set', 'levels.set', 'level.delete', 'level.user.set',
                'level.activate', 'grid.set',
            ], true)) {
                $state['sceneConfig'] = is_array($state['sceneConfig'] ?? null)
                    ? $state['sceneConfig']
                    : [];
                $config = is_array($state['sceneConfig'][$sceneId] ?? null)
                    ? $state['sceneConfig'][$sceneId]
                    : [];
                $currentRevision = max(0, (int) ($config['_revision'] ?? 0));
                if ($type === 'level.user.set' || $type === 'level.activate') {
                    $targetLevelId = $type === 'level.user.set' ? $payload['entry']['levelId'] : $payload['levelId'];
                    if ($targetLevelId !== 'level-0') {
                        $targetLevel = null;
                        foreach (($config['mapLevels']['levels'] ?? []) as $level) {
                            if (is_array($level) && ($level['id'] ?? null) === $targetLevelId) { $targetLevel = $level; break; }
                        }
                        if ($targetLevel === null) throw new InvalidArgumentException('That floor no longer exists.');
                        $gmOwnView = $isGm && $type === 'level.user.set'
                            && strtolower($payload['userId']) === strtolower(trim($actorId));
                        if (($targetLevel['hidden'] ?? false) === true && !$gmOwnView) {
                            throw new InvalidArgumentException('Hidden floors cannot be shown to players.');
                        }
                    }
                }
                if ($normalized['entityRevision'] !== $currentRevision) {
                    return $this->rollbackConflict('entity_revision_mismatch', $snapshot);
                }
                $config['_revision'] = $currentRevision + 1;
                $entityRevision = $config['_revision'];
                if ($type === 'fog.set') {
                    $config['fogOfWar'] = $payload['fogOfWar'];
                    $eventType = 'fog.replaced';
                    $eventPayload = ['fogOfWar' => $config['fogOfWar']];
                } elseif ($type === 'levels.set' || $type === 'level.delete') {
                    if ($type === 'level.delete') {
                        $payload['mapLevels'] = $config['mapLevels'] ?? [];
                        $oldLevels = $payload['mapLevels']['levels'] ?? [];
                        $payload['mapLevels']['levels'] = array_values(array_filter($oldLevels,
                            static fn($level) => ($level['id'] ?? null) !== $payload['levelId']));
                        if (count($oldLevels) === count($payload['mapLevels']['levels'])) throw new InvalidArgumentException('That floor no longer exists.');
                        if (($payload['mapLevels']['activeLevelId'] ?? null) === $payload['levelId']) $payload['mapLevels']['activeLevelId'] = null;
                    }
                    $removedContent = $this->cleanDeletedFloorContent($state, $sceneId, $config, $payload['mapLevels']);
                    $visibilityChanges = $this->floorVisibilityChanges($state, $sceneId, $config['mapLevels'] ?? [], $payload['mapLevels']);
                    $mutations = $this->relocateDeletedFloorPlacements($state, $sceneId, $config['mapLevels'] ?? [], $payload['mapLevels']);
                    $config['userLevelState'] = $this->reconcileFloorViews(
                        $config['userLevelState'] ?? [], $config['mapLevels'] ?? [], $payload['mapLevels']
                    );
                    $config['mapLevels'] = $payload['mapLevels'];
                    foreach ($mutations as $mutation) {
                        if (!in_array('levelId', $mutation['changedFields'], true)) continue;
                        $userId = $this->uniqueLinkedPlayerForPlacement($state['placements'][$sceneId], $mutation['placementId']);
                        if ($userId !== null && ($config['userLevelState'][$userId]['followToken'] ?? true) !== false) $config['userLevelState'][$userId] = $this->preserveFloorFollowPreference(['levelId'=>$mutation['placement']['levelId'],
                            'source'=>'token', 'tokenId'=>$mutation['placementId'], 'updatedAt'=>$this->nowMilliseconds()], $config['userLevelState'][$userId] ?? []);
                    }
                    $eventType = 'levels.replaced';
                    $eventPayload = ['mapLevels' => $config['mapLevels'], 'userLevelState' => $config['userLevelState'], 'mutations'=>$mutations];
                    if ($removedContent !== null) $eventPayload['removedContent'] = $removedContent;
                    if ($visibilityChanges !== []) $eventPayload['visibilityChanges'] = $visibilityChanges;
                    if ($removedContent !== null || $visibilityChanges !== []) {
                        $eventPayload['fogOfWar'] = $config['fogOfWar'] ?? [];
                    }
                } elseif ($type === 'grid.set') {
                    $config['grid'] = $payload['grid'];
                    $eventType = 'grid.changed';
                    $eventPayload = ['grid' => $config['grid']];
                } else {
                    $config['userLevelState'] = is_array($config['userLevelState'] ?? null)
                        ? $config['userLevelState']
                        : [];
                    if ($type === 'level.user.set') {
                        $userId = strtolower(trim((string) $payload['userId']));
                        $payload['entry'] = $this->preserveFloorFollowPreference($payload['entry'], $config['userLevelState'][$userId] ?? []);
                        $config['userLevelState'][$userId] = $payload['entry'];
                        $eventType = 'level.userChanged';
                        $eventPayload = ['userId' => $userId, 'entry' => $payload['entry']];
                    } else {
                        foreach ($payload['userIds'] as $userId) {
                            $config['userLevelState'][$userId] = $this->preserveFloorFollowPreference([
                                'levelId' => $payload['levelId'],
                                'source' => 'activate',
                                'updatedAt' => $this->nowMilliseconds(),
                            ], $config['userLevelState'][$userId] ?? []);
                        }
                        $eventType = 'level.activated';
                        $eventPayload = [
                            'levelId' => $payload['levelId'],
                            'userIds' => $payload['userIds'],
                            'userLevelState' => $config['userLevelState'],
                        ];
                    }
                }
                $state['sceneConfig'][$sceneId] = $config;
            } elseif ($type === 'scene.activate' || $type === 'routing.set') {
                $state['routing'] = is_array($state['routing'] ?? null) ? $state['routing'] : [];
                $currentRevision = max(0, (int) ($state['routing']['_revision'] ?? 0));
                if ($normalized['entityRevision'] !== $currentRevision) {
                    return $this->rollbackConflict('entity_revision_mismatch', $snapshot);
                }
                $state['routing']['_revision'] = $currentRevision + 1;
                $entityRevision = $state['routing']['_revision'];
                if ($type === 'scene.activate') {
                    $state['routing']['activeSceneId'] = $sceneId;
                    $eventType = 'scene.activated';
                    $eventPayload = ['routing' => $state['routing']];
                } else {
                    foreach ($payload['routing'] as $field => $value) {
                        $state['routing'][$field] = $value;
                    }
                    $eventType = 'routing.changed';
                    $eventPayload = ['routing' => $state['routing']];
                }
            }

            $revision = $snapshot['revision'] + 1;
            $serverTime = $this->nowMilliseconds();
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => $eventType,
                'actorId' => $actorId,
                'sceneId' => $sceneId,
                'entityId' => $entityId,
                'entityRevision' => $entityRevision,
                'payload' => $eventPayload,
                'serverTime' => $serverTime,
            ];
            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);
            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');
            return ['status' => 'accepted', 'event' => $event, 'idempotent' => false];
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /**
     * Decide one combat transition from canonical state under the same SQLite
     * write lock used to append its event. Advisory browser locks, timestamps,
     * and submitted full-board snapshots have no authority here.
     *
     * @return array{status:string,event?:array,snapshot?:array,idempotent?:bool,error?:string}
     */
    public function acceptCombatCommand(array $command, string $actorId, bool $isGm): array
    {
        $normalized = $this->normalizeCombatCommand($command);
        $actorId = trim($actorId);
        if ($actorId === '') {
            throw new InvalidArgumentException('An authenticated actor ID is required.');
        }

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($normalized['operationId']);
            if ($existing !== null) {
                $this->pdo->exec('COMMIT');
                return ['status' => 'accepted', 'event' => $existing, 'idempotent' => true];
            }
            $snapshot = $this->getSnapshot();
            if ($normalized['baseRevision'] > $snapshot['revision']) {
                return $this->rollbackConflict('base_revision_ahead', $snapshot);
            }

            $state = $snapshot['state'];
            $state['combat'] = is_array($state['combat'] ?? null) ? $state['combat'] : [];
            $state['placements'] = is_array($state['placements'] ?? null) ? $state['placements'] : [];
            $sceneId = $normalized['sceneId'];
            $type = $normalized['type'];
            $payload = $normalized['payload'];
            if ($type === 'combat.automation.claim') {
                $transitionOperationId = trim((string) ($payload['transitionOperationId'] ?? ''));
                $boundary = trim((string) ($payload['boundary'] ?? 'transition'));
                $transitionEvent = $this->findEventByOperationId($transitionOperationId);
                if (
                    $transitionOperationId === ''
                    || !is_array($transitionEvent)
                    || ($transitionEvent['type'] ?? '') !== 'combat.transitioned'
                    || ($transitionEvent['sceneId'] ?? null) !== $sceneId
                ) {
                    throw new InvalidArgumentException('Combat automation claim references an unknown transition.');
                }
                $transitionPayload = is_array($transitionEvent['payload']['transition'] ?? null)
                    ? $transitionEvent['payload']['transition']
                    : [];
                $ownerId = null;
                if ($boundary === 'turn-start') {
                    $ownerId = $this->normalizeOptionalId($transitionPayload['interactionOwnerId'] ?? null);
                } elseif ($boundary === 'turn-end') {
                    $ownerId = $this->normalizeOptionalId(
                        $transitionPayload['turnEndInteractionOwnerId']
                            ?? $transitionPayload['interactionOwnerId']
                            ?? $transitionPayload['previousInteractionOwnerId']
                            ?? null
                    );
                } elseif ($boundary !== 'transition') {
                    throw new InvalidArgumentException('Unknown combat automation boundary.');
                }
                if (
                    !$isGm
                    && ($ownerId === null || strtolower($ownerId) !== strtolower($actorId))
                ) {
                    throw new InvalidArgumentException('Only the turn initiator may claim this automation boundary.');
                }
                $revision = $snapshot['revision'] + 1;
                $serverTime = $this->nowMilliseconds();
                $event = [
                    'revision' => $revision,
                    'operationId' => $normalized['operationId'],
                    'type' => 'combat.automationClaimed',
                    'actorId' => $actorId,
                    'sceneId' => $sceneId,
                    'entityId' => null,
                    'entityRevision' => null,
                    'payload' => [
                        'transitionOperationId' => $transitionOperationId,
                        'boundary' => $boundary,
                    ],
                    'serverTime' => $serverTime,
                ];
                $this->insertEvent($event);
                $this->updateWorldState($revision, $state, $serverTime);
                if ($revision % $this->snapshotInterval === 0) {
                    $this->insertSnapshot($revision, $state, $serverTime);
                }
                $this->pruneEvents($revision);
                $this->pdo->exec('COMMIT');
                return ['status' => 'accepted', 'event' => $event, 'idempotent' => false];
            }
            $combat = $this->normalizeCombatState($state['combat'][$sceneId] ?? []);
            $before = $combat;
            $transition = [
                'type' => $type,
                'combatantId' => null,
                'previousCombatantId' => $combat['activeCombatantId'],
                'previousRound' => $combat['round'],
                'interactionOwnerId' => null,
                'previousInteractionOwnerId' => $this->normalizeOptionalId(
                    $combat['turnLock']['holderId'] ?? null
                ),
                'turnEndInteractionOwnerId' => null,
            ];

            if ($type === 'combat.start') {
                if (!$isGm) {
                    throw new InvalidArgumentException('Only the GM may start combat.');
                }
                if ($combat['active']) {
                    return $this->rollbackConflict('combat_already_active', $snapshot);
                }
                $startingTeam = $this->normalizeCombatTeam($payload['startingTeam'] ?? null) ?? 'enemy';
                $combat = $this->normalizeCombatState($payload['combat'] ?? []);
                $combat['active'] = true;
                $combat['isActive'] = true;
                $combat['round'] = 1;
                $combat['activeCombatantId'] = null;
                $combat['completedCombatantIds'] = [];
                $combat['startingTeam'] = $startingTeam;
                $combat['currentTeam'] = $startingTeam;
                $combat['lastTeam'] = null;
                $combat['turnPhase'] = 'pick';
                $combat['roundTurnCount'] = 0;
                $combat['turnLock'] = null;
                $combat['encounterId'] = $this->normalizeOptionalId($payload['encounterId'] ?? null)
                    ?? ('enc-server-' . bin2hex(random_bytes(10)));
                foreach ($state['combat'] as $otherSceneId => $otherCombat) {
                    if ($otherSceneId === $sceneId || !is_array($otherCombat)) {
                        continue;
                    }
                    $other = $this->normalizeCombatState($otherCombat);
                    if ($other['active']) {
                        $state['combat'][$otherSceneId] = $this->endCombatState($other);
                    }
                }
            } elseif ($type === 'turn.start') {
                if (!$combat['active']) {
                    return $this->rollbackConflict('combat_not_active', $snapshot);
                }
                $requestedId = $this->normalizeOptionalId($payload['combatantId'] ?? null);
                $combatantId = $this->resolveCombatRepresentative($combat, $requestedId);
                if ($combatantId === null) {
                    return $this->rollbackConflict('combatant_not_found', $snapshot);
                }
                $placement = $state['placements'][$sceneId][$combatantId] ?? null;
                if (!is_array($placement)) {
                    return $this->rollbackConflict('combatant_not_found', $snapshot);
                }
                $team = $this->combatantTeam($placement);
                if (!$isGm && $team !== 'ally') {
                    throw new InvalidArgumentException('Players cannot control enemy turns.');
                }
                $override = !empty($payload['override'])
                    && ($isGm || $team === 'ally');
                if (in_array($combatantId, $combat['completedCombatantIds'], true) && !$override) {
                    return $this->rollbackConflict('combatant_already_completed', $snapshot);
                }
                $activeId = $combat['activeCombatantId'];
                if ($activeId === $combatantId) {
                    return $this->rollbackConflict('combatant_already_active', $snapshot);
                }
                if ($activeId !== null && !$override) {
                    return $this->rollbackConflict('turn_already_active', $snapshot);
                }
                if ($activeId === null && $team !== $combat['currentTeam'] && !$override) {
                    return $this->rollbackConflict('wrong_side_for_current_pick', $snapshot);
                }
                if ($activeId !== null) {
                    $previousId = $this->resolveCombatRepresentative($combat, $activeId);
                    if ($previousId !== null && !in_array($previousId, $combat['completedCombatantIds'], true)) {
                        $combat['completedCombatantIds'][] = $previousId;
                    }
                    $previousPlacement = $state['placements'][$sceneId][$previousId] ?? [];
                    $combat['lastTeam'] = $this->combatantTeam(is_array($previousPlacement) ? $previousPlacement : []);
                    $combat['roundTurnCount']++;
                }
                $combat['completedCombatantIds'] = array_values(array_filter(
                    $combat['completedCombatantIds'],
                    static fn ($id): bool => $id !== $combatantId
                ));
                $combat['activeCombatantId'] = $combatantId;
                $combat['turnPhase'] = 'active';
                $now = $this->nowMilliseconds();
                $combat['turnLock'] = [
                    'holderId' => $actorId,
                    'holderName' => trim((string) ($payload['holderName'] ?? '')) ?: ($isGm ? 'GM' : $actorId),
                    'combatantId' => $combatantId,
                    'acquiredAt' => $now,
                    'lockedAt' => $now,
                ];
                $transition['combatantId'] = $combatantId;
                $transition['interactionOwnerId'] = $actorId;
                if ($activeId !== null) {
                    $transition['turnEndInteractionOwnerId'] = $actorId;
                }
            } elseif ($type === 'turn.complete' || $type === 'turn.cancel') {
                if (!$combat['active'] || $combat['activeCombatantId'] === null) {
                    return $this->rollbackConflict('no_active_turn', $snapshot);
                }
                $activeId = $this->resolveCombatRepresentative($combat, $combat['activeCombatantId']);
                $requestedId = $this->resolveCombatRepresentative(
                    $combat,
                    $this->normalizeOptionalId($payload['combatantId'] ?? null) ?? $activeId
                );
                if ($activeId === null || $requestedId !== $activeId) {
                    return $this->rollbackConflict('active_combatant_mismatch', $snapshot);
                }
                $activePlacement = $state['placements'][$sceneId][$activeId] ?? [];
                $finishedTeam = $this->combatantTeam(is_array($activePlacement) ? $activePlacement : []);
                if (!$isGm && $finishedTeam !== 'ally') {
                    throw new InvalidArgumentException('Players cannot control enemy turns.');
                }
                $transition['interactionOwnerId'] = $actorId;
                $transition['turnEndInteractionOwnerId'] = $actorId;
                if ($type === 'turn.complete') {
                    if (!in_array($activeId, $combat['completedCombatantIds'], true)) {
                        $combat['completedCombatantIds'][] = $activeId;
                    }
                    $combat['lastTeam'] = $finishedTeam;
                    $combat['currentTeam'] = $finishedTeam === 'ally' ? 'enemy' : 'ally';
                    $combat['roundTurnCount']++;
                } else {
                    $combat['currentTeam'] = $finishedTeam;
                }
                $combat['activeCombatantId'] = null;
                $combat['turnPhase'] = 'pick';
                $combat['turnLock'] = null;
                $transition['combatantId'] = $activeId;
            } elseif ($type === 'combat.uncomplete') {
                if (!$isGm) {
                    throw new InvalidArgumentException('Only the GM may reopen a completed combatant.');
                }
                $combatantId = $this->resolveCombatRepresentative(
                    $combat,
                    $this->normalizeOptionalId($payload['combatantId'] ?? null)
                );
                if ($combatantId === null) {
                    throw new InvalidArgumentException('combat.uncomplete requires combatantId.');
                }
                $combat['completedCombatantIds'] = array_values(array_filter(
                    $combat['completedCombatantIds'],
                    static fn ($id): bool => $id !== $combatantId
                ));
                if ($combat['activeCombatantId'] === $combatantId) {
                    $combat['activeCombatantId'] = null;
                    $combat['turnLock'] = null;
                    $combat['turnPhase'] = 'pick';
                }
                $transition['combatantId'] = $combatantId;
            } elseif ($type === 'round.advance') {
                if (!$isGm) {
                    throw new InvalidArgumentException('Only the GM may advance the round.');
                }
                if (!$combat['active']) {
                    return $this->rollbackConflict('combat_not_active', $snapshot);
                }
                if ($combat['activeCombatantId'] !== null) {
                    $finishedId = $this->resolveCombatRepresentative($combat, $combat['activeCombatantId']);
                    if ($finishedId !== null && !in_array($finishedId, $combat['completedCombatantIds'], true)) {
                        $combat['completedCombatantIds'][] = $finishedId;
                    }
                    $transition['combatantId'] = $finishedId;
                }
                $combat['round'] = max(1, $combat['round'] + 1);
                $combat['activeCombatantId'] = null;
                $combat['completedCombatantIds'] = [];
                $combat['roundTurnCount'] = 0;
                $combat['turnPhase'] = 'pick';
                $combat['turnLock'] = null;
                $combat['currentTeam'] = $combat['startingTeam'] ?? $combat['currentTeam'] ?? 'ally';
            } elseif ($type === 'combat.end') {
                if (!$isGm) {
                    throw new InvalidArgumentException('Only the GM may end combat.');
                }
                if (!$combat['active']) {
                    return $this->rollbackConflict('combat_not_active', $snapshot);
                }
                $requestedEncounter = $this->normalizeOptionalId($payload['encounterId'] ?? null);
                if ($requestedEncounter !== null && $combat['encounterId'] !== null
                    && $requestedEncounter !== $combat['encounterId']) {
                    return $this->rollbackConflict('encounter_mismatch', $snapshot);
                }
                $combat = $this->endCombatState($combat);
            } else {
                $allowed = ['malice', 'groups', 'lastEffect', 'lastEffects', 'intentHistory'];
                $patch = is_array($payload['patch'] ?? null) ? $payload['patch'] : [];
                if (!$isGm) {
                    $allowed = ['lastEffect', 'lastEffects'];
                }
                foreach ($patch as $field => $value) {
                    if (!in_array((string) $field, $allowed, true)) {
                        throw new InvalidArgumentException('Combat patch field is not permitted: ' . $field);
                    }
                    $combat[$field] = $value;
                }
                $combat = $this->normalizeCombatState($combat);
            }

            $combat['sequence'] = $before['sequence'] + 1;
            $combat['updatedAt'] = $this->nowMilliseconds();
            $state['combat'][$sceneId] = $combat;
            $revision = $snapshot['revision'] + 1;
            $serverTime = $this->nowMilliseconds();
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => 'combat.transitioned',
                'actorId' => $actorId,
                'sceneId' => $sceneId,
                'entityId' => null,
                'entityRevision' => null,
                'payload' => [
                    'combat' => $combat,
                    'transition' => $transition,
                ],
                'serverTime' => $serverTime,
            ];
            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);
            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');
            return ['status' => 'accepted', 'event' => $event, 'idempotent' => false];
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    /** Restore every member of the accepted move identified by an anchor receipt. */
    public function undoMovementGroup(array $command,string $actorId,bool $isGm): array
    {
        $actorId=trim($actorId);
        $sceneId=trim((string)($command['sceneId'] ?? ''));
        $anchorId=trim((string)($command['entityId'] ?? ''));
        $operationId=trim((string)($command['operationId'] ?? ''));
        if ($actorId==='' || $sceneId==='' || $anchorId==='') throw new InvalidArgumentException('A group undo requires an authenticated actor and anchor token.');
        if (strlen($operationId)<8 || strlen($operationId)>128 || preg_match('/^[A-Za-z0-9._:-]+$/',$operationId)!==1) throw new InvalidArgumentException('operationId is invalid.');
        $existing=$this->findEventByOperationId($operationId);
        if ($existing!==null) {
            if (($existing['actorId'] ?? '')!==$actorId || ($existing['payload']['groupUndoAnchor'] ?? '')!==$sceneId.'::'.$anchorId) throw new InvalidArgumentException('Operation ID is already in use.');
            return ['status'=>'accepted','event'=>$existing,'idempotent'=>true];
        }
        $snapshot=$this->getSnapshot();
        $anchor=$snapshot['state']['placements'][$sceneId][$anchorId] ?? null;
        if (!$anchor || (!$isGm && ($this->placementIsHidden($anchor) || !$this->playerMayMovePlacement($anchor)))) throw new InvalidArgumentException('The group move is unavailable.');
        $revision=$this->normalizeEntityRevision($command);
        if ($revision!==($anchor['_entityRevision'] ?? 0)) return ['status'=>'conflict','error'=>'entity_revision_mismatch','snapshot'=>$snapshot];
        $history=$anchor['_movementUndo']['history'] ?? [];
        $sourceId=end($history)['operationId'] ?? null;
        $source=is_string($sourceId)?$this->findEventByOperationId($sourceId):null;
        if (!$source || ($source['actorId'] ?? '')!==$actorId) throw new InvalidArgumentException('This group move has no usable receipt for the current user.');
        $actions=[];$restores=[];
        foreach ($source['payload']['mutations'] ?? [] as $mutation) {
            $record=$mutation['placement'] ?? [];
            $entries=$record['_movementUndo']['history'] ?? [];
            if ((end($entries)['operationId'] ?? null)!==$sourceId) continue;
            $memberScene=$mutation['sceneId'];$id=$mutation['placementId'];
            $current=$snapshot['state']['placements'][$memberScene][$id] ?? null;
            if (!$current || (!$isGm && ($this->placementIsHidden($current) || !$this->playerMayMovePlacement($current)))) throw new InvalidArgumentException('A member of this group move is no longer available.');
            $latest=$current['_movementUndo']['history'] ?? [];
            if ((end($latest)['operationId'] ?? null)!==$sourceId) throw new InvalidArgumentException('A member moved again after this group move.');
            $restore=MovementUndo::restore($current,$actorId,(int)$current['_entityRevision'],$snapshot['state']['sceneConfig'][$memberScene]['mapLevels'] ?? []);
            $restores[$memberScene.'::'.$id]=$restore;
            $actions[]=['kind'=>'patch','sceneId'=>$memberScene,'placementId'=>$id,'entityRevision'=>$current['_entityRevision'],
                'patch'=>['column'=>$restore['column'],'row'=>$restore['row']]];
        }
        if (count($actions)<2 || !isset($restores[$sceneId.'::'.$anchorId])) throw new InvalidArgumentException('This receipt does not identify a group movement.');
        return $this->acceptPlacementBatch([...$command,'type'=>'placement.batch','baseRevision'=>$snapshot['revision'],'payload'=>['actions'=>$actions]],
            $actorId,$isGm,$snapshot['revision'],$restores,$sceneId.'::'.$anchorId);
    }

    /**
     * Apply all placement and ownership mutations under one SQLite write
     * lock. Validation is performed against a working copy and no state or
     * event is written unless every action succeeds.
     *
     * @return array{status:string,event?:array,snapshot?:array,idempotent?:bool,error?:string}
     */
    public function acceptPlacementBatch(
        array $command,
        string $actorId,
        bool $isGm,
        ?int $expectedWorldRevision = null,
        ?array $movementRestores = null,
        ?string $groupUndoAnchor = null
    ): array {
        $normalized = $this->normalizePlacementBatch($command, $expectedWorldRevision === null ? 100 : 5000);
        $actorId = trim($actorId);
        if ($actorId === '') {
            throw new InvalidArgumentException('An authenticated actor ID is required.');
        }

        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($normalized['operationId']);
            if ($existing !== null) {
                if ($groupUndoAnchor !== null && (($existing['actorId'] ?? '') !== $actorId || ($existing['payload']['groupUndoAnchor'] ?? '') !== $groupUndoAnchor)) throw new InvalidArgumentException('Operation ID is already in use.');
                $this->pdo->exec('COMMIT');
                return ['status' => 'accepted', 'event' => $existing, 'idempotent' => true];
            }
            $snapshot = $this->getSnapshot();
            if ($expectedWorldRevision !== null && $snapshot['revision'] !== $expectedWorldRevision) {
                return $this->rollbackConflict($groupUndoAnchor !== null ? 'group_undo_stale' : 'checkpoint_preview_stale', $snapshot);
            }
            if ($normalized['baseRevision'] > $snapshot['revision']) {
                $this->pdo->exec('ROLLBACK');
                return [
                    'status' => 'conflict',
                    'error' => 'base_revision_ahead',
                    'snapshot' => $snapshot,
                ];
            }

            $state = $snapshot['state'];
            $state['placements'] = is_array($state['placements'] ?? null)
                ? $state['placements']
                : [];
            $mutations = [];
            $zoneEntryReceipts = [];
            $levelChangedPlacements = [];

            foreach ($normalized['actions'] as $action) {
                $sceneId = $action['sceneId'];
                $placementId = $action['placementId'];
                $state['placements'][$sceneId] = is_array($state['placements'][$sceneId] ?? null)
                    ? $state['placements'][$sceneId]
                    : [];
                $current = $state['placements'][$sceneId][$placementId] ?? null;

                if ($action['kind'] === 'add') {
                    if ($current !== null) {
                        return $this->rollbackConflict('placement_exists', $snapshot);
                    }
                    $placement = $action['placement'];
                    if (isset($placement['primaryPc']) && !is_bool($placement['primaryPc'])) throw new InvalidArgumentException('Primary token flag must be boolean.');
                    if (!$isGm && !empty($placement['primaryPc'])) throw new InvalidArgumentException('Only the GM may select a primary token.');
                    if (($placement['primaryPc'] ?? false) === true && $this->linkedPlayerProfileForPlacement($placement) === null) throw new InvalidArgumentException('A primary token must link to a configured player profile.');
                    if (isset($placement['movementMode']) && !in_array($placement['movementMode'], ['ground','fly','hover'], true)) throw new InvalidArgumentException('Unknown movement mode.');
                    if (($placement['movementMode'] ?? '') === 'fly' && FloorGeometry::flightInterrupted($placement)) throw new InvalidArgumentException('Prone or speed-zero conditions prevent ordinary flight.');
                    unset($placement['_movementUndo'], $placement['_floorTraversal']);
                    if (!$isGm && $this->placementIsHidden($placement)) {
                        throw new InvalidArgumentException('Players cannot add hidden placements.');
                    }
                    $placement['id'] = $placementId;
                    $placement['_entityRevision'] = 1;
                    $state['placements'][$sceneId][$placementId] = $placement;
                    $mutations[] = [
                        'kind' => 'upsert',
                        'sceneId' => $sceneId,
                        'placementId' => $placementId,
                        'placement' => $placement,
                        'entityRevision' => 1,
                        'changedFields' => ['*'],
                        'wasPlayerVisible' => false,
                    ];
                    continue;
                }

                if (!is_array($current)) {
                    return $this->rollbackConflict('placement_missing', $snapshot);
                }
                $currentRevision = max(0, (int) ($current['_entityRevision'] ?? 0));
                if ($action['entityRevision'] !== $currentRevision) {
                    return $this->rollbackConflict('entity_revision_mismatch', $snapshot);
                }
                if (!$isGm && $this->placementIsHidden($current)) {
                    throw new InvalidArgumentException('You cannot change this placement.');
                }
                if (!$isGm && $action['kind'] === 'remove') {
                    throw new InvalidArgumentException('Only the GM may remove placements.');
                }
                $nextRevision = $currentRevision + 1;

                if ($action['kind'] === 'remove') {
                    unset($state['placements'][$sceneId][$placementId]);
                    $mutations[] = [
                        'kind' => 'remove',
                        'sceneId' => $sceneId,
                        'placementId' => $placementId,
                        'entityRevision' => $nextRevision,
                        'playerVisible' => !$this->placementIsHidden($current),
                    ];
                    continue;
                }

                $restore = $movementRestores[$sceneId.'::'.$placementId] ?? null;
                $patch = $restore ?? $action['patch'];
                if (array_key_exists('movementMode', $patch)) {
                    if (!in_array($patch['movementMode'], ['ground', 'fly', 'hover'], true)) throw new InvalidArgumentException('Unknown movement mode.');
                    if (!$isGm && !$this->playerMayMovePlacement($current)) throw new InvalidArgumentException('You cannot change this token movement mode.');
                    if (!$isGm) foreach (($state['sceneConfig'][$sceneId]['mapLevels']['levels'] ?? []) as $level) {
                        if (($level['id'] ?? '') === ($current['levelId'] ?? 'level-0') && ($level['hidden'] ?? false) === true) throw new InvalidArgumentException('You cannot change a token on a hidden floor.');
                    }
                }
                if (!$isGm && $restore === null) {
                    $this->assertPlayerPatchAllowed($patch);
                }
                unset($patch['id'], $patch['_entityRevision'], $patch['_movementUndo'], $patch['_floorTraversal']);
                $next = [...$current, ...$patch];
                if (isset($next['primaryPc']) && !is_bool($next['primaryPc'])) throw new InvalidArgumentException('Primary token flag must be boolean.');
                if (($next['primaryPc'] ?? false) === true
                    && array_intersect(array_keys($patch), ['primaryPc','profileId','profile','playerId','player','owner','controller','metadata','meta','name'])
                    && $this->linkedPlayerProfileForPlacement($next) === null) {
                    throw new InvalidArgumentException('A primary token must link to a configured player profile. Clear its primary choice before unlinking it.');
                }
                if (($next['movementMode'] ?? 'ground') === 'fly' && FloorGeometry::flightInterrupted($next)) {
                    if (($patch['movementMode'] ?? '') === 'fly') throw new InvalidArgumentException('Prone or speed-zero conditions prevent ordinary flight. Use Hover only when an effect grants it.');
                    $patch['movementMode'] = 'ground'; $next['movementMode'] = 'ground';
                }
                if (array_key_exists('movementMode', $patch)) {
                    $floor = FloorGeometry::move($next, $next, $state['sceneConfig'][$sceneId]['mapLevels'] ?? [], 'forced');
                    $patch['levelId'] = $floor['levelId']; $patch['_floorTraversal'] = null;
                    $patch['_movementUndo'] = [];
                    $next = [...$next, ...$patch];
                }
                if (!array_key_exists('levelId', $patch)
                    && (array_key_exists('column', $patch) || array_key_exists('row', $patch))) {
                    $floor = FloorGeometry::move($current, $next, $state['sceneConfig'][$sceneId]['mapLevels'] ?? [], $action['movementKind'], $action['path']);
                    $patch['levelId'] = $floor['levelId'];
                    $patch['_floorTraversal'] = $floor['traversal'];
                    $next = [...$next, ...$patch];
                } elseif (array_key_exists('levelId', $patch)) {
                    $next['_floorTraversal'] = null;
                }
                $next['id'] = $placementId;
                $next['_entityRevision'] = $nextRevision;
                if ($restore !== null) { $next = [...$next, ...$restore]; $patch = [...$patch, ...$restore]; }
                if ($restore === null && (array_key_exists('column', $patch) || array_key_exists('row', $patch))) {
                    $next['_movementUndo'] = MovementUndo::record($current, $next, $actorId, $state['sceneConfig'][$sceneId]['mapLevels'] ?? [], $normalized['operationId']);
                    $patch['_movementUndo'] = $next['_movementUndo'];
                }
                if ($restore === null && (array_key_exists('column', $patch) || array_key_exists('row', $patch) || array_key_exists('levelId', $patch))) {
                    $zoneEntryReceipts[] = ZoneEntryReceipt::create($sceneId, $placementId, $current, $next, $state['combat'][$sceneId] ?? [], $action['movementKind']);
                }
                $state['placements'][$sceneId][$placementId] = $next;
                if (
                    $this->placementLevelId($current)
                    !== $this->placementLevelId($next)
                ) {
                    $levelChangedPlacements[$sceneId . "\0" . $placementId] = [
                        'sceneId' => $sceneId,
                        'placementId' => $placementId,
                    ];
                }
                $mutations[] = [
                    'kind' => 'upsert',
                    'sceneId' => $sceneId,
                    'placementId' => $placementId,
                    'placement' => $next,
                    'entityRevision' => $nextRevision,
                    'changedFields' => array_values(array_keys($patch)),
                    'wasPlayerVisible' => !$this->placementIsHidden($current),
                ];
            }

            foreach (array_unique(array_column($mutations, 'sceneId')) as $changedSceneId) {
                $primaryProfiles = [];
                foreach ($state['placements'][$changedSceneId] ?? [] as $placement) {
                    if (($placement['primaryPc'] ?? false) !== true) continue;
                    $profile = $this->linkedPlayerProfileForPlacement($placement);
                    // A removed roster member can leave historical flags. They
                    // do not participate in following or block unrelated edits.
                    if ($profile === null) continue;
                    if (isset($primaryProfiles[$profile])) throw new InvalidArgumentException('Select only one primary token per player in a scene.');
                    $primaryProfiles[$profile] = true;
                }
            }
            $serverTime = $this->nowMilliseconds();
            $userLevelMutations = [];
            $linkedUpdatesByScene = [];
            foreach ($levelChangedPlacements as $candidate) {
                $sceneId = $candidate['sceneId'];
                $placementId = $candidate['placementId'];
                $placements = $state['placements'][$sceneId] ?? [];
                if (!is_array($placements) || !is_array($placements[$placementId] ?? null)) {
                    continue;
                }
                $userId = $this->uniqueLinkedPlayerForPlacement($placements, $placementId);
                if ($userId === null || ($state['sceneConfig'][$sceneId]['userLevelState'][$userId]['followToken'] ?? true) === false) {
                    continue;
                }
                $linkedUpdatesByScene[$sceneId][$userId] = [
                    'placementId' => $placementId,
                    'levelId' => $this->placementLevelId($placements[$placementId]),
                ];
            }
            $state['sceneConfig'] = is_array($state['sceneConfig'] ?? null)
                ? $state['sceneConfig']
                : [];
            foreach ($linkedUpdatesByScene as $sceneId => $updatesByUser) {
                $config = is_array($state['sceneConfig'][$sceneId] ?? null)
                    ? $state['sceneConfig'][$sceneId]
                    : [];
                $config['userLevelState'] = is_array($config['userLevelState'] ?? null)
                    ? $config['userLevelState']
                    : [];
                $config['_revision'] = max(0, (int) ($config['_revision'] ?? 0)) + 1;
                foreach ($updatesByUser as $userId => $update) {
                    $entry = [
                        'levelId' => $update['levelId'],
                        'source' => 'token',
                        'tokenId' => $update['placementId'],
                        'updatedAt' => $serverTime,
                    ];
                    $entry = $this->preserveFloorFollowPreference($entry, $config['userLevelState'][$userId] ?? []);
                    $config['userLevelState'][$userId] = $entry;
                    $userLevelMutations[] = [
                        'sceneId' => $sceneId,
                        'userId' => $userId,
                        'entry' => $entry,
                        'sceneConfigRevision' => $config['_revision'],
                    ];
                }
                $state['sceneConfig'][$sceneId] = $config;
            }

            $revision = $snapshot['revision'] + 1;
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => 'placement.batchApplied',
                'actorId' => $actorId,
                'sceneId' => null,
                'entityId' => null,
                'entityRevision' => null,
                'payload' => [
                    'mutations' => $mutations,
                    'userLevelMutations' => $userLevelMutations,
                ],
                'serverTime' => $serverTime,
            ];
            if ($groupUndoAnchor !== null) {
                $event['payload']['groupUndoAnchor'] = $groupUndoAnchor;
                $event['payload']['movementKind'] = 'undo';
            }
            if ($zoneEntryReceipts !== []) $event['payload']['zoneEntryReceipts'] = $zoneEntryReceipts;
            $this->insertEvent($event);
            $this->updateWorldState($revision, $state, $serverTime);
            if ($revision % $this->snapshotInterval === 0) {
                $this->insertSnapshot($revision, $state, $serverTime);
            }
            $this->pruneEvents($revision);
            $this->pdo->exec('COMMIT');
            return ['status' => 'accepted', 'event' => $event, 'idempotent' => false];
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();
            throw $error;
        }
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
            $this->rollbackTransactionSilently();
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
    public function acceptTokenMove(array $command, string $actorId, bool $isGm = false): array
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
            $current = $state['placements'][$normalized['sceneId']][$normalized['entityId']] ?? null;
            if (!is_array($current)) return $this->rollbackConflict('placement_missing', $snapshot);
            if (!$isGm) {
                if (!$this->playerMayMovePlacement($current)) throw new InvalidArgumentException('You cannot move this token.');
                foreach (($state['sceneConfig'][$normalized['sceneId']]['mapLevels']['levels'] ?? []) as $level) {
                    if (($level['id'] ?? null) === $this->placementLevelId($current) && ($level['hidden'] ?? false) === true) {
                        throw new InvalidArgumentException('You cannot move a token on a hidden floor.');
                    }
                }
            }
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
            $sceneId = $normalized['sceneId'];
            $placementId = $normalized['entityId'];
            $next = $state['placements'][$sceneId][$placementId];
            $mapLevels = $state['sceneConfig'][$sceneId]['mapLevels'] ?? [];
            $restore = $normalized['undoRevision'] !== null
                ? MovementUndo::restore($current, $actorId, $normalized['undoRevision'], $mapLevels) : null;
            $floor = $restore !== null
                ? ['levelId'=>$restore['levelId'], 'traversal'=>$restore['_floorTraversal'], 'cause'=>'undo']
                : FloorGeometry::move($current, $next, $mapLevels, $normalized['movementKind'], $normalized['path']);
            if ($restore !== null) $next = [...$next, ...$restore];
            $next['levelId'] = $floor['levelId'];
            $next['_floorTraversal'] = $floor['traversal'];
            if ($restore === null) $next['_movementUndo'] = MovementUndo::record($current, $next, $actorId, $mapLevels, $normalized['operationId']);
            $state['placements'][$sceneId][$placementId] = $next;
            $event['payload']['column'] = $next['column'];
            $event['payload']['row'] = $next['row'];
            $event['payload']['_movementUndo'] = $next['_movementUndo'];
            $event['payload']['movementKind'] = $restore !== null ? 'undo' : $normalized['movementKind'];
            $event['payload']['_floorTraversal'] = $floor['traversal'];
            $event['payload']['levelId'] = $floor['levelId'];
            if ($this->placementLevelId($current) !== $floor['levelId']) {
                $userLevelMutations = [];
                $userId = $this->uniqueLinkedPlayerForPlacement($state['placements'][$sceneId], $placementId);
                if ($userId !== null && ($state['sceneConfig'][$sceneId]['userLevelState'][$userId]['followToken'] ?? true) !== false) {
                    $config = $state['sceneConfig'][$sceneId] ?? [];
                    $config['_revision'] = max(0, (int) ($config['_revision'] ?? 0)) + 1;
                    $entry = ['levelId'=>$floor['levelId'], 'source'=>'token', 'tokenId'=>$placementId, 'updatedAt'=>$serverTime];
                    $entry = $this->preserveFloorFollowPreference($entry, $config['userLevelState'][$userId] ?? []);
                    $config['userLevelState'][$userId] = $entry;
                    $state['sceneConfig'][$sceneId] = $config;
                    $userLevelMutations[] = ['sceneId'=>$sceneId, 'userId'=>$userId, 'entry'=>$entry, 'sceneConfigRevision'=>$config['_revision']];
                }
                // Reuse the existing atomic placement + linked-view reducer and
                // player projection for structural floor transitions.
                $event['type'] = 'placement.batchApplied';
                $event['payload'] = [
                    'mutations'=>[['kind'=>'upsert','sceneId'=>$sceneId,'placementId'=>$placementId,
                        'placement'=>$next,'entityRevision'=>$entityRevision,
                        'changedFields'=>['column','row','levelId','_floorTraversal'],
                        'wasPlayerVisible'=>!$this->placementIsHidden($current)]],
                    'userLevelMutations'=>$userLevelMutations,
                    'movementKind'=>$restore !== null ? 'undo' : $normalized['movementKind'],
                    'movementTransition'=>['kind'=>$floor['cause'],'fromLevelId'=>$this->placementLevelId($current),'toLevelId'=>$floor['levelId']],
                ];
            }

            if ($restore === null) {
                $event['payload']['zoneEntryReceipt'] = ZoneEntryReceipt::create(
                    $sceneId, $placementId, $current, $next, $state['combat'][$sceneId] ?? [], $normalized['movementKind']
                );
            }

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
            $this->rollbackTransactionSilently();
            throw $error;
        }
    }

    public function unresolvedZoneEntries(string $actorId,bool $isGm): array
    {
        if (trim($actorId)==='') throw new InvalidArgumentException('Authentication required.');
        return (new ZoneEntryClaims($this->pdo,$this->worldId))->unresolved($actorId,$isGm);
    }

    public function finishZoneEntry(array $request,string $actorId,bool $isGm): array
    {
        if (trim($actorId)==='' || !is_string($request['claimId'] ?? null) || !is_string($request['status'] ?? null)) throw new InvalidArgumentException('Invalid claim outcome.');
        $reason=$request['reason'] ?? '';
        if (!is_string($reason)) throw new InvalidArgumentException('Invalid claim review reason.');
        $ledger=new ZoneEntryClaims($this->pdo,$this->worldId);
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $result=$ledger->finish($request['claimId'],$request['status'],$actorId,$isGm,$reason);
            $this->pdo->exec('COMMIT');return $result;
        } catch (Throwable $error) {$this->rollbackTransactionSilently();throw $error;}
    }

    /** Reserve one entry from trusted accepted movement; no gameplay effects run here. */
    public function claimZoneEntry(array $request, string $actorId, bool $isGm): array
    {
        $ids=[];
        foreach (['sceneId','placementId','zoneId','movementOperationId'] as $key) {
            $value=$request[$key] ?? null;
            if (!is_string($value) || trim($value)==='' || strlen($value)>200) throw new InvalidArgumentException('Invalid zone entry request.');
            $ids[$key]=trim($value);
        }
        if (trim($actorId)==='') throw new InvalidArgumentException('Authentication required.');
        $ledger=new ZoneEntryClaims($this->pdo,$this->worldId);
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $event=$this->findEventByOperationId($ids['movementOperationId']);
            if (!$event || strtolower((string)($event['actorId'] ?? ''))!==strtolower(trim($actorId))) throw new InvalidArgumentException('Entry must reference your accepted movement.');
            $receipts=$event['payload']['zoneEntryReceipts'] ?? [];
            if (isset($event['payload']['zoneEntryReceipt'])) $receipts[]=$event['payload']['zoneEntryReceipt'];
            $receipt=null;
            foreach ($receipts as $candidate) if (($candidate['sceneId'] ?? null)===$ids['sceneId'] && ($candidate['placementId'] ?? null)===$ids['placementId']) {$receipt=$candidate;break;}
            if (!$receipt) throw new InvalidArgumentException('Accepted movement evidence is unavailable.');
            $snapshot=$this->getSnapshot();$state=$snapshot['state'];$sceneId=$ids['sceneId'];
            $placements=$state['placements'][$sceneId] ?? [];
            $mover=$placements[$ids['placementId']] ?? null;
            if (!is_array($mover) || (!$isGm && !$this->playerMayMovePlacement($mover))) throw new InvalidArgumentException('Token is unavailable for entry claims.');
            $combat=$state['combat'][$sceneId] ?? [];
            if (($receipt['boundary'] ?? null)!==ZoneEntryReceipt::boundary($combat)) throw new InvalidArgumentException('That movement belongs to an earlier combat round.');
            $current=ZoneEntryReceipt::create($sceneId,$ids['placementId'],$mover,$mover,$combat);
            if ($current['to'] != $receipt['to']) throw new InvalidArgumentException('Token moved again before the entry was claimed.');
            $zone=null;$owner=null;
            foreach ($placements as $placement) foreach ((is_array($placement['persistentZones'] ?? null) ? $placement['persistentZones'] : []) as $candidate) {
                if (is_array($candidate) && ($candidate['id'] ?? null)===$ids['zoneId']) {$zone=$candidate;$owner=$placement;break 2;}
            }
            if (!$zone || !is_array($zone['triggers'] ?? null) || !in_array('onEnter',$zone['triggers'],true)) throw new InvalidArgumentException('Zone is unavailable for entry claims.');
            $levels=array_column(FloorGeometry::orderedLevels($state['sceneConfig'][$sceneId]['mapLevels'] ?? []),null,'id');
            foreach ([$mover,$owner,$zone] as $item) {
                $floor=ZoneEntryClaims::level($item);
                if (!isset($levels[$floor]) || (!$isGm && (($levels[$floor]['hidden'] ?? false)===true || $this->placementIsHidden($item)))) throw new InvalidArgumentException('Zone or token floor is unavailable.');
            }
            if (($zone['createdAt'] ?? 0)>($event['serverTime'] ?? 0)) throw new InvalidArgumentException('Zone was created after that movement.');
            $filter=strtolower(trim((string)($zone['affects'] ?? 'creature')));$team=$this->combatantTeam($mover);
            if (($filter==='enemy' && $team!=='enemy') || (in_array($filter,['ally','selforally','self or ally','selfandally','self and ally'],true) && $team!=='ally')) throw new InvalidArgumentException('Zone does not affect this creature.');
            if (!ZoneEntryClaims::enters($zone,$receipt['from'],$receipt['to'],$receipt['movementKind'] ?? 'walk')) throw new InvalidArgumentException('Movement does not enter this zone.');
            $result=$ledger->reserve($receipt,$zone,$ids['movementOperationId'],trim($actorId));
            $this->pdo->exec('COMMIT');
            return $result;
        } catch (Throwable $error) {
            $this->rollbackTransactionSilently();throw $error;
        }
    }

    public function playerMayMovePlacement(array $placement): bool
    {
        return !$this->placementIsHidden($placement)
            && $this->combatantTeam($placement) === 'ally';
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

    public function getOperationalStatus(): array
    {
        $snapshot = $this->getSnapshot();
        $counts = [];
        foreach (['vtt_events', 'vtt_operations', 'vtt_snapshots'] as $table) {
            $statement = $this->pdo->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE world_id = :world_id"
            );
            $statement->execute(['world_id' => $this->worldId]);
            $counts[$table] = (int) $statement->fetchColumn();
        }
        return [
            'worldId' => $this->worldId,
            'revision' => $snapshot['revision'],
            'updatedAt' => $snapshot['serverTime'],
            'minimumRetainedRevision' => $this->minimumRetainedRevision(),
            'retainedEvents' => $counts['vtt_events'],
            'operationLedgerEntries' => $counts['vtt_operations'],
            'snapshots' => $counts['vtt_snapshots'],
            'eventRetention' => $this->eventRetention,
            'snapshotInterval' => $this->snapshotInterval,
            'snapshotRetention' => $this->snapshotRetention,
        ];
    }

    private function initializeSchema(): void
    {
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS vtt_scene_imports (
            world_id TEXT NOT NULL, operation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
            scene_id TEXT NOT NULL, request_hash TEXT NOT NULL, catalog_json TEXT NOT NULL,
            pending_catalog INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (world_id, operation_id), UNIQUE (world_id, scene_id))');
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
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS vtt_presence (
                world_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                is_gm INTEGER NOT NULL DEFAULT 0,
                last_seen INTEGER NOT NULL,
                PRIMARY KEY (world_id, user_id)
            )'
        );
        $this->pdo->exec(
            'CREATE INDEX IF NOT EXISTS idx_vtt_presence_world_seen
             ON vtt_presence (world_id, last_seen)'
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
            'movementKind' => $this->normalizeMovementKind($command['payload']['movementKind'] ?? 'walk'),
            'path' => $this->normalizeMovementPath($command['payload']['path'] ?? []),
            'undoRevision' => isset($command['payload']['undoRevision']) ? (int) $command['payload']['undoRevision'] : null,
        ];
    }

    public function sceneCheckpoints(): SceneCheckpointArchive
    {
        return new SceneCheckpointArchive($this->pdo, $this->worldId);
    }

    private function reconcileFloorViews(array $views, array $before, array $after): array
    {
        $available = ['level-0'=>true];
        $visible = ['level-0'=>true];
        foreach (($after['levels'] ?? []) as $level) {
            if (!is_array($level) || !is_string($level['id'] ?? null)) continue;
            $available[$level['id']] = true;
            if (($level['hidden'] ?? false) !== true) $visible[$level['id']] = true;
        }
        $ordered = array_values(array_filter($before['levels'] ?? [], 'is_array'));
        usort($ordered, static fn($a, $b) => ((float) ($a['zIndex'] ?? 0)) <=> ((float) ($b['zIndex'] ?? 0)));
        foreach ($views as $userId => $entry) {
            if (!is_array($entry)) continue;
            $levelId = (string) ($entry['levelId'] ?? 'level-0');
            $allowed = strtolower((string) $userId) === 'gm' ? $available : $visible;
            if (isset($allowed[$levelId])) continue;
            $fallback = 'level-0';
            foreach ($ordered as $level) {
                if (($level['id'] ?? null) === $levelId) break;
                if (isset($visible[$level['id'] ?? ''])) $fallback = $level['id'];
            }
            // Unknown old IDs have no meaningful place in the stack.
            if (!in_array($levelId, array_column($ordered, 'id'), true)) $fallback = 'level-0';
            $views[$userId] = [...$entry, 'levelId'=>$fallback, 'source'=>'manual', 'updatedAt'=>$this->nowMilliseconds()];
            unset($views[$userId]['tokenId']);
        }
        return $views;
    }

    private function preserveFloorFollowPreference(array $entry, array $previous): array
    {
        if (!array_key_exists('followToken', $entry) && isset($previous['followToken']) && is_bool($previous['followToken'])) $entry['followToken'] = $previous['followToken'];
        return $entry;
    }

    private function relocateDeletedFloorPlacements(array &$state, string $sceneId, array $before, array $after): array
    {
        $old = FloorGeometry::orderedLevels($before);
        $remaining = array_column(FloorGeometry::orderedLevels($after), null, 'id');
        $oldIds = array_column($old, 'id');
        $removed = array_fill_keys(array_values(array_diff($oldIds, array_keys($remaining))), true);
        $mutations = [];
        foreach (($state['placements'][$sceneId] ?? []) as $id => $placement) {
            $next = $placement;
            $changedFields = [];
            if (is_array($placement['persistentZones'] ?? null)) {
                $zones = array_values(array_filter($placement['persistentZones'], static function ($zone) use ($removed): bool {
                    if (!is_array($zone)) return true;
                    $zoneLevel = $zone['levelId'] ?? $zone['template']['levelId'] ?? FloorGeometry::BASE;
                    return !is_string($zoneLevel) || !isset($removed[trim($zoneLevel)]);
                }));
                if (count($zones) !== count($placement['persistentZones'])) {
                    $next['persistentZones'] = $zones === [] ? null : $zones;
                    $changedFields[] = 'persistentZones';
                }
            }
            $levelId = $placement['levelId'] ?? FloorGeometry::BASE;
            $index = array_search($levelId, $oldIds, true);
            if ($index !== false && !isset($remaining[$levelId])) {
                $destination = FloorGeometry::BASE;
                for ($i = $index - 1; $i > 0; $i--) {
                    $candidate = $remaining[$old[$i]['id']] ?? null;
                    if ($candidate && ($candidate['hidden'] ?? false) !== true && !FloorGeometry::fullyUnsupported($placement, $candidate)) {
                        $destination = $candidate['id']; break;
                    }
                }
                $next['levelId'] = $destination;
                $next['_floorTraversal'] = null;
                $next['_movementUndo'] = [];
                array_push($changedFields, 'levelId', '_floorTraversal', '_movementUndo');
            }
            if ($changedFields === []) continue;
            $next['_entityRevision'] = max(0, (int) ($placement['_entityRevision'] ?? 0)) + 1;
            $state['placements'][$sceneId][$id] = $next;
            $mutations[] = ['kind'=>'upsert', 'sceneId'=>$sceneId, 'placementId'=>(string) $id, 'placement'=>$next,
                'entityRevision'=>$next['_entityRevision'], 'changedFields'=>$changedFields,
                'wasPlayerVisible'=>!$this->placementIsHidden($placement)];
        }
        return $mutations;
    }

    private function cleanDeletedFloorContent(array &$state, string $sceneId, array &$config, array &$after): ?array
    {
        $before = array_column(FloorGeometry::orderedLevels($config['mapLevels'] ?? []), null, 'id');
        $remaining = array_column(FloorGeometry::orderedLevels($after), null, 'id');
        $removed = array_diff_key($before, $remaining);
        if ($removed === []) return null;
        $content = [];
        foreach (['drawings', 'templates'] as $domain) {
            foreach (($state[$domain][$sceneId] ?? []) as $id => $entry) {
                $levelId = $entry['levelId'] ?? FloorGeometry::BASE;
                if (!isset($removed[$levelId])) continue;
                unset($state[$domain][$sceneId][$id]);
                $content[] = ['domain'=>$domain, 'id'=>(string) $id, 'playerVisible'=>($removed[$levelId]['hidden'] ?? false) !== true];
            }
        }
        foreach ($removed as $levelId => $level) unset($config['fogOfWar']['byLevel'][$levelId]);
        $disconnect = static function (array $stairs) use ($removed): array {
            foreach ($stairs as &$stair) {
                if (is_array($stair) && isset($removed[$stair['linkedLevelId'] ?? ''])) $stair['linkedLevelId'] = null;
            }
            unset($stair);
            return $stairs;
        };
        if (is_array($after['baseStairs'] ?? null)) $after['baseStairs'] = $disconnect($after['baseStairs']);
        foreach ($after['levels'] ?? [] as $index => $level) {
            if (is_array($level['stairs'] ?? null)) $after['levels'][$index]['stairs'] = $disconnect($level['stairs']);
        }
        if (isset($removed[$after['activeLevelId'] ?? ''])) $after['activeLevelId'] = null;
        return $content;
    }

    private function floorVisibilityChanges(array $state, string $sceneId, array $before, array $after): array
    {
        $old = array_column(FloorGeometry::orderedLevels($before), null, 'id');
        $changed = [];
        foreach (FloorGeometry::orderedLevels($after) as $level) {
            $id = $level['id'];
            if (!isset($old[$id]) || (($old[$id]['hidden'] ?? false) === true) === (($level['hidden'] ?? false) === true)) continue;
            $entry = ['hidden'=>($level['hidden'] ?? false) === true, 'placements'=>[], 'drawings'=>[], 'templates'=>[]];
            foreach (['placements', 'drawings', 'templates'] as $domain) {
                foreach (($state[$domain][$sceneId] ?? []) as $entityId => $entity) {
                    if (($entity['levelId'] ?? FloorGeometry::BASE) === $id) $entry[$domain][(string) $entityId] = $entity;
                }
            }
            $changed[] = $entry;
        }
        return $changed;
    }

    private function checkpointLayoutPlan(array $checkpoint, array $snapshot): array
    {
        $placements = $snapshot['state']['placements'][$checkpoint['sceneId']] ?? [];
        $links = [];
        foreach ($this->playerCharacterUserIds as $userId) $links[$userId] = $this->resolvePcPlacementIdForUser($placements, $userId);
        return SceneCheckpointRestore::planLayout($checkpoint,$snapshot,$links);
    }

    public function previewCheckpointLayout(array $checkpoint): array
    {
        return $this->checkpointLayoutPlan($checkpoint,$this->getSnapshot())['preview'];
    }

    public function restoreCheckpointLayout(array $command, string $actorId, bool $isGm): array
    {
        if (!$isGm || trim($actorId) === '') throw new InvalidArgumentException('Checkpoint layout restore is GM-only.');
        $operationId = $command['operationId'] ?? '';
        if (!is_string($operationId) || !preg_match('/^[A-Za-z0-9._:-]{8,128}$/',$operationId)) throw new InvalidArgumentException('Invalid operation ID.');
        if (($command['type'] ?? '') !== 'checkpoint.restoreLayout') throw new InvalidArgumentException('Expected checkpoint.restoreLayout.');
        $reviewed = $command['payload']['reviewedRevision'] ?? null;
        if (!is_int($reviewed) || $reviewed < 0) throw new InvalidArgumentException('A reviewed revision is required.');
        $this->pdo->exec('BEGIN IMMEDIATE');
        try {
            $existing = $this->findEventByOperationId($operationId);
            if ($existing !== null) {
                if ($existing['actorId'] !== $actorId || $existing['type'] !== 'scene.layoutRestored') throw new InvalidArgumentException('Operation ID is already in use.');
                $this->pdo->exec('COMMIT');
                return ['status'=>'accepted','event'=>$existing,'idempotent'=>true];
            }
            $snapshot = $this->getSnapshot();
            if ($snapshot['revision'] !== $reviewed) return $this->rollbackConflict('checkpoint_preview_stale',$snapshot);
            $checkpoint = $this->sceneCheckpoints()->get((string)($command['payload']['checkpointId'] ?? ''));
            if ($checkpoint === null) throw new InvalidArgumentException('Checkpoint no longer exists.');
            $plan = $this->checkpointLayoutPlan($checkpoint,$snapshot);
            if (!$plan['preview']['hasChanges']) throw new InvalidArgumentException('The scene layout already matches this checkpoint.');
            $sceneId = $checkpoint['sceneId']; $revision = $snapshot['revision']+1;
            $domains = $plan['domains']; $state = $snapshot['state']; $now = $this->nowMilliseconds();
            $domains['sceneConfig']['_revision'] = max($revision,(int)($state['sceneConfig'][$sceneId]['_revision'] ?? 0)+1);
            foreach ($plan['preview']['viewerChanges'] as $change) $domains['sceneConfig']['userLevelState'][$change['userId']]['updatedAt']=$now;
            foreach (['placements','drawings','templates'] as $domain) foreach ($domains[$domain] as $id=>&$entry) {
                $entry['_entityRevision']=max($revision,(int)($entry['_entityRevision'] ?? 0)+1,(int)($state[$domain][$sceneId][$id]['_entityRevision'] ?? 0)+1);
                unset($entry['_revision']);
            }
            unset($entry);
            foreach ($domains as $domain=>$entries) $state[$domain][$sceneId]=$entries;
            $event=['revision'=>$revision,'operationId'=>$operationId,'actorId'=>$actorId,'type'=>'scene.layoutRestored',
                'sceneId'=>$sceneId,'entityId'=>null,'entityRevision'=>$domains['sceneConfig']['_revision'],
                'payload'=>['domains'=>$domains,'checkpointId'=>$checkpoint['id']],'serverTime'=>$now];
            $this->insertEvent($event); $this->updateWorldState($revision,$state,$now);
            if ($revision % $this->snapshotInterval === 0) $this->insertSnapshot($revision,$state,$now);
            $this->pruneEvents($revision); $this->pdo->exec('COMMIT');
            return ['status'=>'accepted','event'=>$event,'idempotent'=>false];
        } catch (Throwable $error) { $this->rollbackTransactionSilently(); throw $error; }
    }

    public function restoreCheckpointPositions(array $command, string $actorId, bool $isGm): array
    {
        if (!$isGm) throw new InvalidArgumentException('Checkpoint restore is GM-only.');
        if (trim($actorId) === '') throw new InvalidArgumentException('An authenticated actor ID is required.');
        $operationId = $command['operationId'] ?? '';
        if (!is_string($operationId) || preg_match('/^[A-Za-z0-9._:-]{8,128}$/', $operationId) !== 1) {
            throw new InvalidArgumentException('operationId is invalid.');
        }
        if (($command['type'] ?? '') !== 'checkpoint.restorePositions') throw new InvalidArgumentException('Expected checkpoint.restorePositions.');
        $reviewedRevision = $command['payload']['reviewedRevision'] ?? null;
        if (!is_int($reviewedRevision) || $reviewedRevision < 0) throw new InvalidArgumentException('A reviewed revision is required.');
        // Retrying an accepted command returns its original event, even if the
        // checkpoint was subsequently deleted or the board has moved on.
        $existing = $this->findEventByOperationId($operationId);
        if ($existing !== null) return ['status'=>'accepted', 'event'=>$existing, 'idempotent'=>true];
        $checkpoint = $this->sceneCheckpoints()->get((string) ($command['payload']['checkpointId'] ?? ''));
        if ($checkpoint === null) throw new InvalidArgumentException('Checkpoint no longer exists.');
        $snapshot = $this->getSnapshot();
        if ($snapshot['revision'] !== $reviewedRevision) {
            return ['status'=>'conflict', 'error'=>'checkpoint_preview_stale', 'snapshot'=>$snapshot];
        }
        $preview = SceneCheckpointRestore::previewPositions($checkpoint, $snapshot);
        $actions = [];
        foreach ($preview['changes'] as $change) {
            $actions[] = ['kind'=>'patch', 'sceneId'=>$preview['sceneId'], 'placementId'=>$change['id'],
                'entityRevision'=>$change['entityRevision'], 'patch'=>$change['to']];
        }
        if ($actions === []) throw new InvalidArgumentException('No positions differ. Refresh the preview.');
        // The reviewed revision is checked again inside the write transaction.
        return $this->acceptPlacementBatch(['type'=>'placement.batch', 'operationId'=>$operationId,
            'baseRevision'=>$reviewedRevision, 'payload'=>['actions'=>$actions]], $actorId, true, $reviewedRevision);
    }

    private function normalizeMovementKind($kind): string
    {
        if (!in_array($kind, ['walk','forced','teleport'], true)) throw new InvalidArgumentException('Unknown movement kind.');
        return $kind;
    }

    private function normalizeMovementPath($path): array
    {
        if (!is_array($path) || count($path) > 256) throw new InvalidArgumentException('Movement path requires at most 256 waypoints.');
        foreach ($path as $point) if (!is_array($point)) throw new InvalidArgumentException('Movement waypoints must be objects.');
        return array_values($path);
    }

    private function normalizeBoardDomainCommand(array $command): array
    {
        $operationId = trim((string) ($command['operationId'] ?? ''));
        if (
            strlen($operationId) < 8
            || strlen($operationId) > 128
            || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1
        ) {
            throw new InvalidArgumentException('operationId is invalid.');
        }
        $type = (string) ($command['type'] ?? '');
        $allowed = [
            'template.upsert', 'template.remove',
            'drawing.upsert', 'drawing.remove',
            'ping.add', 'fog.set', 'levels.set', 'level.delete',
            'level.user.set', 'level.activate', 'grid.set',
            'scene.activate', 'routing.set',
        ];
        if (!in_array($type, $allowed, true)) {
            throw new InvalidArgumentException('Unsupported board-domain command.');
        }
        $baseRevision = filter_var(
            $command['baseRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        $entityRevision = filter_var(
            $command['entityRevision'] ?? 0,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        $payload = $command['payload'] ?? [];
        if ($baseRevision === false || $entityRevision === false || !is_array($payload)) {
            throw new InvalidArgumentException('Board-domain command revisions and payload are invalid.');
        }
        if (strlen($this->encodeJson($payload)) > 1048576) {
            throw new InvalidArgumentException('Board-domain command payload is too large.');
        }
        $sceneId = $this->normalizeOptionalId($command['sceneId'] ?? null);
        $entityId = $this->normalizeOptionalId($command['entityId'] ?? null);
        if ($type !== 'routing.set' && $sceneId === null) {
            throw new InvalidArgumentException('Board-domain command requires sceneId.');
        }
        if (in_array($type, [
            'template.upsert', 'template.remove',
            'drawing.upsert', 'drawing.remove', 'ping.add',
        ], true) && $entityId === null) {
            throw new InvalidArgumentException('Board-domain command requires entityId.');
        }
        if ($type === 'template.upsert' && !is_array($payload['template'] ?? null)) {
            throw new InvalidArgumentException('template.upsert requires template.');
        }
        if ($type === 'drawing.upsert' && !is_array($payload['drawing'] ?? null)) {
            throw new InvalidArgumentException('drawing.upsert requires drawing.');
        }
        if ($type === 'ping.add' && !is_array($payload['ping'] ?? null)) {
            throw new InvalidArgumentException('ping.add requires ping.');
        }
        if ($type === 'ping.add') {
            $x = $payload['ping']['x'] ?? null;
            $y = $payload['ping']['y'] ?? null;
            if (
                !is_numeric($x) || !is_numeric($y)
                || !is_finite((float) $x) || !is_finite((float) $y)
                || (float) $x < 0 || (float) $x > 1
                || (float) $y < 0 || (float) $y > 1
            ) {
                throw new InvalidArgumentException('ping.add coordinates must be between zero and one.');
            }
            $payload['ping'] = [
                'id' => $entityId,
                'sceneId' => $sceneId,
                'x' => (float) $x,
                'y' => (float) $y,
                'type' => ($payload['ping']['type'] ?? '') === 'focus' ? 'focus' : 'ping',
            ];
        }
        if ($type === 'fog.set' && !is_array($payload['fogOfWar'] ?? null)) {
            throw new InvalidArgumentException('fog.set requires fogOfWar.');
        }
        if ($type === 'levels.set' && !is_array($payload['mapLevels'] ?? null)) {
            throw new InvalidArgumentException('levels.set requires mapLevels.');
        }
        if ($type === 'level.delete' && (!is_string($payload['levelId'] ?? null) || trim($payload['levelId']) === '' || $payload['levelId'] === 'level-0')) {
            throw new InvalidArgumentException('Only a stored floor can be deleted.');
        }
        if ($type === 'grid.set' && !is_array($payload['grid'] ?? null)) {
            throw new InvalidArgumentException('grid.set requires grid.');
        }
        if ($type === 'level.user.set') {
            $userId = strtolower(trim((string) ($payload['userId'] ?? '')));
            $levelId = trim((string) ($payload['entry']['levelId'] ?? ''));
            if ($userId === '' || $levelId === '') {
                throw new InvalidArgumentException('level.user.set requires userId and levelId.');
            }
            $payload['userId'] = $userId;
            $payload['entry'] = [
                'levelId' => $levelId,
                'source' => trim((string) ($payload['entry']['source'] ?? 'manual')) ?: 'manual',
                'updatedAt' => $this->nowMilliseconds(),
            ];
            $tokenId = $this->normalizeOptionalId($command['payload']['entry']['tokenId'] ?? null);
            if (array_key_exists('followToken', $command['payload']['entry'] ?? [])) {
                $follow = $command['payload']['entry']['followToken'];
                if (!is_bool($follow)) throw new InvalidArgumentException('Floor following preference must be boolean.');
                $payload['entry']['followToken'] = $follow;
            }
            if ($tokenId !== null) {
                $payload['entry']['tokenId'] = $tokenId;
            }
        }
        if ($type === 'level.activate') {
            $levelId = trim((string) ($payload['levelId'] ?? ''));
            $userIds = [];
            foreach (($payload['userIds'] ?? []) as $userId) {
                $id = strtolower(trim((string) $userId));
                if ($id !== '' && !in_array($id, $userIds, true)) {
                    $userIds[] = $id;
                }
            }
            if ($levelId === '' || $userIds === []) {
                throw new InvalidArgumentException('level.activate requires levelId and userIds.');
            }
            $payload = compact('levelId', 'userIds');
        }
        if ($type === 'routing.set') {
            $routing = is_array($payload['routing'] ?? null) ? $payload['routing'] : [];
            $allowedRouting = [
                'activeSceneId', 'mapUrl', 'playerMapDisabled', 'playerActiveSceneId',
                'playerMapUrl', 'playerThumbnailUrl',
            ];
            $routing = array_intersect_key($routing, array_flip($allowedRouting));
            if ($routing === []) {
                throw new InvalidArgumentException('routing.set requires supported routing fields.');
            }
            $payload = ['routing' => $routing];
        }
        return [
            'operationId' => $operationId,
            'type' => $type,
            'baseRevision' => (int) $baseRevision,
            'entityRevision' => (int) $entityRevision,
            'sceneId' => $sceneId,
            'entityId' => $entityId,
            'payload' => $payload,
        ];
    }

    private function assertBoardDomainPermission(
        string $type,
        array $payload,
        string $actorId,
        bool $isGm
    ): void {
        if ($isGm) {
            return;
        }
        if (in_array($type, [
            'template.upsert', 'template.remove', 'drawing.upsert', 'drawing.remove', 'ping.add',
        ], true)) {
            return;
        }
        if ($type === 'level.user.set') {
            $target = strtolower(trim((string) ($payload['userId'] ?? '')));
            if ($target !== strtolower(trim($actorId))) {
                throw new InvalidArgumentException('Players may only change their own viewer level.');
            }
            return;
        }
        throw new InvalidArgumentException('This board-domain command is GM-only.');
    }

    private function normalizePlacementBatch(array $command, int $maxActions = 100): array
    {
        $operationId = trim((string) ($command['operationId'] ?? ''));
        if (
            strlen($operationId) < 8
            || strlen($operationId) > 128
            || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1
        ) {
            throw new InvalidArgumentException('operationId is invalid.');
        }
        if (($command['type'] ?? null) !== 'placement.batch') {
            throw new InvalidArgumentException('Expected placement.batch.');
        }
        $baseRevision = filter_var(
            $command['baseRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        $actions = $command['payload']['actions'] ?? null;
        if ($baseRevision === false || !is_array($actions) || $actions === [] || count($actions) > $maxActions) {
            throw new InvalidArgumentException("placement.batch requires 1 to {$maxActions} actions.");
        }
        if (strlen($this->encodeJson(['actions' => $actions])) > 1048576) {
            throw new InvalidArgumentException('placement.batch payload is too large.');
        }
        $normalized = [];
        foreach ($actions as $action) {
            if (!is_array($action)) {
                throw new InvalidArgumentException('Each placement action must be an object.');
            }
            $kind = (string) ($action['kind'] ?? '');
            if (!in_array($kind, ['add', 'patch', 'remove'], true)) {
                throw new InvalidArgumentException('Unsupported placement action.');
            }
            $sceneId = $this->normalizeOptionalId($action['sceneId'] ?? null);
            $placementId = $this->normalizeOptionalId($action['placementId'] ?? null);
            if ($sceneId === null || $placementId === null) {
                throw new InvalidArgumentException('Placement actions require sceneId and placementId.');
            }
            $entry = compact('kind', 'sceneId', 'placementId');
            if ($kind === 'add') {
                if (!is_array($action['placement'] ?? null)) {
                    throw new InvalidArgumentException('add requires placement.');
                }
                $entry['placement'] = $action['placement'];
            } elseif ($kind === 'patch') {
                if (!is_array($action['patch'] ?? null)) {
                    throw new InvalidArgumentException('patch requires a patch object.');
                }
                $entry['patch'] = $action['patch'];
                $entry['movementKind'] = $this->normalizeMovementKind($action['movementKind'] ?? 'forced');
                $entry['path'] = $this->normalizeMovementPath($action['path'] ?? []);
                $entry['entityRevision'] = $this->normalizeEntityRevision($action);
            } elseif ($kind === 'remove') {
                $entry['entityRevision'] = $this->normalizeEntityRevision($action);
            }
            $normalized[] = $entry;
        }
        return [
            'operationId' => $operationId,
            'baseRevision' => (int) $baseRevision,
            'actions' => $normalized,
        ];
    }

    private function normalizeCombatCommand(array $command): array
    {
        $operationId = trim((string) ($command['operationId'] ?? ''));
        if (
            strlen($operationId) < 8
            || strlen($operationId) > 128
            || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1
        ) {
            throw new InvalidArgumentException('operationId is invalid.');
        }
        $type = (string) ($command['type'] ?? '');
        if (!in_array($type, [
            'combat.start', 'turn.start', 'turn.complete', 'turn.cancel',
            'combat.uncomplete', 'round.advance', 'combat.end', 'combat.patch',
            'combat.automation.claim',
        ], true)) {
            throw new InvalidArgumentException('Unsupported combat command.');
        }
        $sceneId = $this->normalizeOptionalId($command['sceneId'] ?? null);
        $baseRevision = filter_var(
            $command['baseRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        $payload = $command['payload'] ?? [];
        if ($sceneId === null || $baseRevision === false || !is_array($payload)) {
            throw new InvalidArgumentException('Combat commands require sceneId, baseRevision, and payload.');
        }
        if (strlen($this->encodeJson($payload)) > 262144) {
            throw new InvalidArgumentException('Combat command payload is too large.');
        }
        return [
            'operationId' => $operationId,
            'type' => $type,
            'sceneId' => $sceneId,
            'baseRevision' => (int) $baseRevision,
            'payload' => $payload,
        ];
    }

    private function normalizeRequestedTestCommand(array $command): array
    {
        $operationId = trim((string) ($command['operationId'] ?? ''));
        if (
            strlen($operationId) < 8
            || strlen($operationId) > 128
            || preg_match('/^[A-Za-z0-9._:-]+$/', $operationId) !== 1
        ) {
            throw new InvalidArgumentException('operationId is invalid.');
        }
        $type = (string) ($command['type'] ?? '');
        if (!in_array($type, [
            'requestedTest.create', 'requestedTest.reassign',
            'requestedTest.resolve', 'requestedTest.claim', 'requestedTest.cancel',
            'requestedTest.complete',
        ], true)) {
            throw new InvalidArgumentException('Unsupported requested-test command.');
        }
        $sceneId = $this->normalizeOptionalId($command['sceneId'] ?? null);
        $baseRevision = filter_var(
            $command['baseRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        $payload = is_array($command['payload'] ?? null) ? $command['payload'] : [];
        $requestId = $this->normalizeOptionalId(
            $command['entityId'] ?? $payload['requestId'] ?? $payload['request']['id'] ?? null
        );
        if ($sceneId === null || $baseRevision === false || $requestId === null) {
            throw new InvalidArgumentException('Requested-test commands require sceneId, baseRevision, and requestId.');
        }
        if (strlen($this->encodeJson($payload)) > 524288) {
            throw new InvalidArgumentException('Requested-test command payload is too large.');
        }
        return [
            'operationId' => $operationId,
            'type' => $type,
            'sceneId' => $sceneId,
            'baseRevision' => (int) $baseRevision,
            'requestId' => $requestId,
            'payload' => $payload,
        ];
    }

    private function normalizeRequestedTestRecord(array $raw): array
    {
        $id = $this->normalizeOptionalId($raw['id'] ?? null);
        $sceneId = $this->normalizeOptionalId($raw['sceneId'] ?? null);
        $initiatorId = strtolower(trim((string) ($raw['initiatorId'] ?? '')));
        $recipientId = strtolower(trim((string) ($raw['recipientId'] ?? '')));
        if ($id === null || $sceneId === null || $initiatorId === '' || $recipientId === '') {
            throw new InvalidArgumentException('Requested-test record is missing routing fields.');
        }
        $attribute = trim((string) ($raw['attribute'] ?? ''));
        $validAttributes = ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'];
        $matchedAttribute = null;
        foreach ($validAttributes as $candidate) {
            if (strtolower($candidate) === strtolower($attribute)) {
                $matchedAttribute = $candidate;
                break;
            }
        }
        if ($matchedAttribute === null) {
            throw new InvalidArgumentException('Requested tests require a standard ability score.');
        }
        $rollMode = (string) ($raw['rollMode'] ?? 'individual');
        if (!in_array($rollMode, ['individual', 'singleHighest', 'groupByAttribute'], true)) {
            throw new InvalidArgumentException('Unknown requested-test roll mode.');
        }
        $targetIds = [];
        foreach (($raw['targetIds'] ?? []) as $targetId) {
            $normalized = $this->normalizeOptionalId($targetId);
            if ($normalized !== null && !in_array($normalized, $targetIds, true)) {
                $targetIds[] = $normalized;
            }
        }
        if ($targetIds === [] || count($targetIds) > 100) {
            throw new InvalidArgumentException('Requested tests require 1 to 100 targets.');
        }
        $record = [
            'id' => $id,
            'sceneId' => $sceneId,
            'initiatorId' => $initiatorId,
            'recipientId' => $recipientId,
            'originalRecipientId' => strtolower(trim((string) ($raw['originalRecipientId'] ?? $recipientId))) ?: $recipientId,
            'status' => 'pending',
            'abilityName' => substr(trim((string) ($raw['abilityName'] ?? 'Ability')), 0, 160),
            'sourcePlacementId' => $this->normalizeOptionalId($raw['sourcePlacementId'] ?? null),
            'attribute' => $matchedAttribute,
            'rollMode' => $rollMode,
            'targetIds' => $targetIds,
            'targetNames' => array_slice(array_values(array_map(
                static fn ($value): string => substr(trim((string) $value), 0, 120),
                is_array($raw['targetNames'] ?? null) ? $raw['targetNames'] : []
            )), 0, count($targetIds)),
            'test' => is_array($raw['test'] ?? null) ? $raw['test'] : [],
            'continuation' => is_array($raw['continuation'] ?? null) ? $raw['continuation'] : [],
            'resourceReservation' => is_array($raw['resourceReservation'] ?? null) ? $raw['resourceReservation'] : null,
            'createdAt' => max(0, (int) ($raw['createdAt'] ?? $this->nowMilliseconds())),
            'updatedAt' => max(0, (int) ($raw['updatedAt'] ?? $this->nowMilliseconds())),
        ];
        return $record;
    }

    private function normalizeRequestedTestResult($raw): array
    {
        if (!is_array($raw)) {
            throw new InvalidArgumentException('Requested-test result must be an object.');
        }
        $tier = strtolower(trim((string) ($raw['tier'] ?? '')));
        if (!in_array($tier, ['tier1', 'tier2', 'tier3'], true)) {
            throw new InvalidArgumentException('Requested-test result requires tier1, tier2, or tier3.');
        }
        $result = [
            'tier' => $tier,
            'total' => (int) ($raw['total'] ?? 0),
            'dice' => array_slice(array_values(array_map('intval', is_array($raw['dice'] ?? null) ? $raw['dice'] : [])), 0, 10),
            'bonus' => (int) ($raw['bonus'] ?? 0),
            'edgeCount' => max(0, min(2, (int) ($raw['edgeCount'] ?? 0))),
            'baneCount' => max(0, min(2, (int) ($raw['baneCount'] ?? 0))),
            'rollerTokenId' => $this->normalizeOptionalId($raw['rollerTokenId'] ?? null),
            'rollerTokenName' => substr(trim((string) ($raw['rollerTokenName'] ?? '')), 0, 120),
            'targetIds' => [],
        ];
        foreach (($raw['targetIds'] ?? []) as $targetId) {
            $normalized = $this->normalizeOptionalId($targetId);
            if ($normalized !== null && !in_array($normalized, $result['targetIds'], true)) {
                $result['targetIds'][] = $normalized;
            }
        }
        return $result;
    }

    private function resolveRequestedTestRecipient(string $desiredRecipient, string $actorId): string
    {
        $cutoff = $this->nowMilliseconds() - 5000;
        if ($desiredRecipient !== '' && $desiredRecipient !== '__gm__') {
            $statement = $this->pdo->prepare(
                'SELECT 1 FROM vtt_presence
                 WHERE world_id = :world_id AND user_id = :user_id AND last_seen >= :cutoff'
            );
            $statement->execute([
                'world_id' => $this->worldId,
                'user_id' => $desiredRecipient,
                'cutoff' => $cutoff,
            ]);
            if ($statement->fetchColumn() !== false) {
                return $desiredRecipient;
            }
        }
        $gm = $this->pdo->prepare(
            'SELECT user_id FROM vtt_presence
             WHERE world_id = :world_id AND is_gm = 1 AND last_seen >= :cutoff
             ORDER BY last_seen DESC LIMIT 1'
        );
        $gm->execute(['world_id' => $this->worldId, 'cutoff' => $cutoff]);
        $gmId = $gm->fetchColumn();
        return is_string($gmId) && trim($gmId) !== '' ? strtolower(trim($gmId)) : $actorId;
    }

    private function normalizeCombatState($raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $active = !empty($raw['active']) || !empty($raw['isActive']);
        $round = isset($raw['round']) && is_numeric($raw['round'])
            ? max(0, (int) $raw['round'])
            : 0;
        $activeId = $this->normalizeOptionalId($raw['activeCombatantId'] ?? null);
        $completed = [];
        $rawCompleted = is_array($raw['completedCombatantIds'] ?? null)
            ? $raw['completedCombatantIds']
            : [];
        foreach ($rawCompleted as $id) {
            $normalized = $this->normalizeOptionalId($id);
            if ($normalized !== null && !in_array($normalized, $completed, true)) {
                $completed[] = $normalized;
            }
        }
        $groups = [];
        $rawGroups = is_array($raw['groups'] ?? null) ? $raw['groups'] : [];
        foreach ($rawGroups as $group) {
            if (!is_array($group)) {
                continue;
            }
            $representativeId = $this->normalizeOptionalId($group['representativeId'] ?? null);
            $memberIds = [];
            $rawMemberIds = is_array($group['memberIds'] ?? null)
                ? $group['memberIds']
                : [];
            foreach ($rawMemberIds as $memberId) {
                $member = $this->normalizeOptionalId($memberId);
                if ($member !== null && !in_array($member, $memberIds, true)) {
                    $memberIds[] = $member;
                }
            }
            if ($representativeId !== null && !in_array($representativeId, $memberIds, true)) {
                array_unshift($memberIds, $representativeId);
            }
            if ($representativeId !== null && $memberIds !== []) {
                $groups[] = [
                    ...$group,
                    'representativeId' => $representativeId,
                    'memberIds' => $memberIds,
                ];
            }
        }
        $startingTeam = $this->normalizeCombatTeam($raw['startingTeam'] ?? null);
        $currentTeam = $this->normalizeCombatTeam($raw['currentTeam'] ?? null);
        $lastTeam = $this->normalizeCombatTeam($raw['lastTeam'] ?? null);
        return [
            ...$raw,
            'active' => $active,
            'isActive' => $active,
            'round' => $active ? max(1, $round) : 0,
            'activeCombatantId' => $active ? $activeId : null,
            'completedCombatantIds' => $active ? $completed : [],
            'startingTeam' => $active ? $startingTeam : null,
            'currentTeam' => $active ? $currentTeam : null,
            'lastTeam' => $active ? $lastTeam : null,
            'turnPhase' => !$active ? 'idle' : ($activeId !== null ? 'active' : 'pick'),
            'roundTurnCount' => $active && is_numeric($raw['roundTurnCount'] ?? null)
                ? max(0, (int) $raw['roundTurnCount'])
                : 0,
            'malice' => $active && is_numeric($raw['malice'] ?? null)
                ? max(0, (int) $raw['malice'])
                : 0,
            'encounterId' => $this->normalizeOptionalId($raw['encounterId'] ?? null),
            'sequence' => is_numeric($raw['sequence'] ?? null)
                ? max(0, (int) $raw['sequence'])
                : 0,
            'updatedAt' => is_numeric($raw['updatedAt'] ?? null)
                ? max(0, (int) $raw['updatedAt'])
                : 0,
            'turnLock' => $activeId !== null && is_array($raw['turnLock'] ?? null)
                ? $raw['turnLock']
                : null,
            'intentHistory' => is_array($raw['intentHistory'] ?? null)
                ? array_values($raw['intentHistory'])
                : [],
            'lastEffect' => is_array($raw['lastEffect'] ?? null) ? $raw['lastEffect'] : null,
            'lastEffects' => is_array($raw['lastEffects'] ?? null)
                ? array_values($raw['lastEffects'])
                : [],
            'groups' => $groups,
        ];
    }

    private function normalizeCombatTeam($value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $team = strtolower(trim($value));
        if (in_array($team, ['ally', 'allies', 'player', 'players', 'hero', 'heroes'], true)) {
            return 'ally';
        }
        if (in_array($team, ['enemy', 'enemies', 'monster', 'monsters', 'foe'], true)) {
            return 'enemy';
        }
        return null;
    }

    private function resolveCombatRepresentative(array $combat, ?string $combatantId): ?string
    {
        if ($combatantId === null) {
            return null;
        }
        foreach (($combat['groups'] ?? []) as $group) {
            if (!is_array($group)) {
                continue;
            }
            $representative = $this->normalizeOptionalId($group['representativeId'] ?? null);
            $members = is_array($group['memberIds'] ?? null) ? $group['memberIds'] : [];
            if ($representative !== null && ($combatantId === $representative || in_array($combatantId, $members, true))) {
                return $representative;
            }
        }
        return $combatantId;
    }

    private function combatantTeam(array $placement): ?string
    {
        $metadata = is_array($placement['metadata'] ?? null) ? $placement['metadata'] : [];
        $team = $this->normalizeCombatTeam(
            $placement['team']
                ?? $placement['combatTeam']
                ?? $metadata['team']
                ?? $metadata['combatTeam']
                ?? null
        );
        if ($team !== null) {
            return $team;
        }
        return !empty($placement['monster'])
            || !empty($placement['monsterId'])
            || !empty($metadata['monster'])
            || !empty($metadata['monsterId'])
            ? 'enemy'
            : 'ally';
    }

    private function endCombatState(array $combat): array
    {
        return [
            ...$combat,
            'active' => false,
            'isActive' => false,
            'round' => 0,
            'activeCombatantId' => null,
            'completedCombatantIds' => [],
            'startingTeam' => null,
            'currentTeam' => null,
            'lastTeam' => null,
            'turnPhase' => 'idle',
            'roundTurnCount' => 0,
            'malice' => 0,
            'turnLock' => null,
        ];
    }

    private function normalizeEntityRevision(array $action): int
    {
        $revision = filter_var(
            $action['entityRevision'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 0]]
        );
        if ($revision === false) {
            throw new InvalidArgumentException('Placement entityRevision must be non-negative.');
        }
        return (int) $revision;
    }

    private function rollbackConflict(string $error, array $snapshot): array
    {
        $this->pdo->exec('ROLLBACK');
        return ['status' => 'conflict', 'error' => $error, 'snapshot' => $snapshot];
    }

    private function rollbackTransactionSilently(): void
    {
        try {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
                return;
            }
            // BEGIN IMMEDIATE issued through exec() is not reported by
            // PDO::inTransaction() on every Windows SQLite build.
            $this->pdo->exec('ROLLBACK');
        } catch (Throwable $ignored) {
            // Preserve the original validation or persistence failure.
        }
    }

    private function placementLevelId(array $placement): string
    {
        $levelId = trim((string) ($placement['levelId'] ?? ''));
        return $levelId !== '' ? $levelId : 'level-0';
    }

    private function linkedPlayerProfileForPlacement(array $placement): ?string
    {
        $metadata = is_array($placement['metadata'] ?? null)
            ? $placement['metadata']
            : (is_array($placement['meta'] ?? null) ? $placement['meta'] : []);
        $keys = ['profileId', 'profile', 'playerId', 'player', 'owner', 'controller'];
        foreach ([$placement, $metadata] as $source) {
            foreach ($keys as $key) {
                if (!is_string($source[$key] ?? null) || trim($source[$key]) === '') {
                    continue;
                }
                $profileId = strtolower(trim($source[$key]));
                return in_array($profileId, $this->playerCharacterUserIds, true)
                    ? $profileId
                    : null;
            }
        }

        $name = strtolower(trim((string) ($placement['name'] ?? '')));
        $normalizedName = trim((string) preg_replace('/[^a-z0-9]+/', ' ', $name));
        if ($normalizedName === '') {
            return null;
        }
        $matches = [];
        foreach ($this->playerCharacterUserIds as $profileId) {
            $alias = preg_replace('/[^a-z0-9]+/', ' ', $profileId);
            if (preg_match('/(^|\s)' . preg_quote($alias, '/') . '(\s|$)/', $normalizedName) === 1) {
                $matches[] = $profileId;
            }
        }
        return count($matches) === 1 ? $matches[0] : null;
    }

    /**
     * A profile follows only when exactly one placement in this scene links
     * to it. This avoids making an arbitrary choice when duplicate PC tokens
     * exist.
     *
     * @param array<string,array> $placements
     */
    private function uniqueLinkedPlayerForPlacement(array $placements, string $placementId): ?string
    {
        $target = $placements[$placementId] ?? null;
        if (!is_array($target) || $this->placementIsHidden($target)) {
            return null;
        }
        $profileId = $this->linkedPlayerProfileForPlacement($target);
        if ($profileId === null) {
            return null;
        }
        $primaryIds = [];
        foreach ($placements as $id => $placement) {
            if (($placement['primaryPc'] ?? false) === true && $this->linkedPlayerProfileForPlacement($placement) === $profileId) $primaryIds[] = $id;
        }
        if ($primaryIds !== []) return count($primaryIds) === 1 && $primaryIds[0] === $placementId ? $profileId : null;
        $matchCount = 0;
        foreach ($placements as $placement) {
            if (
                is_array($placement)
                && $this->linkedPlayerProfileForPlacement($placement) === $profileId
            ) {
                $matchCount += 1;
                if ($matchCount > 1) {
                    return null;
                }
            }
        }
        return $matchCount === 1 ? $profileId : null;
    }

    public function resolvePcPlacementIdForUser(array $placements, string $userId): ?string
    {
        $userId = strtolower(trim($userId));
        $matches = []; $primary = [];
        foreach ($placements as $id => $placement) {
            if (!is_array($placement) || $this->linkedPlayerProfileForPlacement($placement) !== $userId) continue;
            $matches[] = (string) $id;
            if (($placement['primaryPc'] ?? false) === true) $primary[] = (string) $id;
        }
        $candidates = $primary !== [] ? $primary : $matches;
        return count($candidates) === 1 && !$this->placementIsHidden($placements[$candidates[0]]) ? $candidates[0] : null;
    }

    private function placementIsHidden(array $placement): bool
    {
        return !empty($placement['hidden'])
            || !empty($placement['isHidden'])
            || !empty($placement['flags']['hidden']);
    }

    private function assertPlayerPatchAllowed(array $patch): void
    {
        $gmOnly = [
            'primaryPc', 'profileId', 'profile', 'playerId', 'player', 'owner', 'controller', 'meta',
            'id', 'hidden', 'isHidden', 'flags', 'levelId', '_floorTraversal', '_movementUndo', 'width', 'height',
            'size', 'stackOrder', 'monster', 'monsterId', 'monsterRef',
            'team', 'name', 'label', 'image', 'imageUrl', 'tokenId',
            'metadata', 'authorId', 'authorRole', 'authorIsGm',
        ];
        foreach (array_keys($patch) as $field) {
            if (in_array((string) $field, $gmOnly, true)) {
                throw new InvalidArgumentException('Only the GM may change placement field: ' . $field);
            }
        }
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
        $prune = $this->pdo->prepare(
            'DELETE FROM vtt_snapshots
             WHERE world_id = :world_id
               AND revision NOT IN (
                   SELECT revision FROM vtt_snapshots
                   WHERE world_id = :sub_world_id
                   ORDER BY revision DESC
                   LIMIT :snapshot_limit
               )'
        );
        $prune->bindValue(':world_id', $this->worldId, PDO::PARAM_STR);
        $prune->bindValue(':sub_world_id', $this->worldId, PDO::PARAM_STR);
        $prune->bindValue(':snapshot_limit', $this->snapshotRetention, PDO::PARAM_INT);
        $prune->execute();
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
