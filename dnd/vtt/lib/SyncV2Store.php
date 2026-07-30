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
    private int $snapshotRetention;

    public function __construct(
        string $databasePath,
        string $worldId = 'default',
        int $eventRetention = 1000,
        int $snapshotInterval = 100,
        int $snapshotRetention = 20
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

    /**
     * Atomically remove every canonical record owned by a deleted scene.
     *
     * @return array{status:string,event:array}
     */
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
                $entityRevision = $currentRevision + 1;
                if (str_ends_with($type, '.remove')) {
                    if ($current === null) {
                        return $this->rollbackConflict('entity_missing', $snapshot);
                    }
                    unset($state[$domain][$sceneId][$entityId]);
                    $eventType = $domain === 'templates' ? 'template.removed' : 'drawing.removed';
                } else {
                    $entry = $payload[$payloadKey];
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
                'fog.set', 'levels.set', 'level.user.set',
                'level.activate', 'grid.set',
            ], true)) {
                $state['sceneConfig'] = is_array($state['sceneConfig'] ?? null)
                    ? $state['sceneConfig']
                    : [];
                $config = is_array($state['sceneConfig'][$sceneId] ?? null)
                    ? $state['sceneConfig'][$sceneId]
                    : [];
                $currentRevision = max(0, (int) ($config['_revision'] ?? 0));
                if ($normalized['entityRevision'] !== $currentRevision) {
                    return $this->rollbackConflict('entity_revision_mismatch', $snapshot);
                }
                $config['_revision'] = $currentRevision + 1;
                $entityRevision = $config['_revision'];
                if ($type === 'fog.set') {
                    $config['fogOfWar'] = $payload['fogOfWar'];
                    $eventType = 'fog.replaced';
                    $eventPayload = ['fogOfWar' => $config['fogOfWar']];
                } elseif ($type === 'levels.set') {
                    $config['mapLevels'] = $payload['mapLevels'];
                    $eventType = 'levels.replaced';
                    $eventPayload = ['mapLevels' => $config['mapLevels']];
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
                        $config['userLevelState'][$userId] = $payload['entry'];
                        $eventType = 'level.userChanged';
                        $eventPayload = ['userId' => $userId, 'entry' => $payload['entry']];
                    } else {
                        foreach ($payload['userIds'] as $userId) {
                            $config['userLevelState'][$userId] = [
                                'levelId' => $payload['levelId'],
                                'source' => 'activate',
                                'updatedAt' => $this->nowMilliseconds(),
                            ];
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
                if (in_array($combatantId, $combat['completedCombatantIds'], true)) {
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
        bool $isGm
    ): array {
        $normalized = $this->normalizePlacementBatch($command);
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

                $patch = $action['patch'];
                if (!$isGm) {
                    $this->assertPlayerPatchAllowed($patch);
                }
                unset($patch['id'], $patch['_entityRevision']);
                $next = [...$current, ...$patch];
                $next['id'] = $placementId;
                $next['_entityRevision'] = $nextRevision;
                $state['placements'][$sceneId][$placementId] = $next;
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

            $revision = $snapshot['revision'] + 1;
            $serverTime = $this->nowMilliseconds();
            $event = [
                'revision' => $revision,
                'operationId' => $normalized['operationId'],
                'type' => 'placement.batchApplied',
                'actorId' => $actorId,
                'sceneId' => null,
                'entityId' => null,
                'entityRevision' => null,
                'payload' => ['mutations' => $mutations],
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
            $this->rollbackTransactionSilently();
            throw $error;
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
            'ping.add', 'fog.set', 'levels.set',
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
            'template.upsert', 'drawing.upsert', 'drawing.remove', 'ping.add',
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

    private function normalizePlacementBatch(array $command): array
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
        if ($baseRevision === false || !is_array($actions) || $actions === [] || count($actions) > 100) {
            throw new InvalidArgumentException('placement.batch requires 1 to 100 actions.');
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

    private function placementIsHidden(array $placement): bool
    {
        return !empty($placement['hidden'])
            || !empty($placement['isHidden'])
            || !empty($placement['flags']['hidden']);
    }

    private function assertPlayerPatchAllowed(array $patch): void
    {
        $gmOnly = [
            'id', 'hidden', 'isHidden', 'flags', 'levelId', 'width', 'height',
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
