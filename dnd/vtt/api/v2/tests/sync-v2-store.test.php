<?php
declare(strict_types=1);

require_once __DIR__ . '/../../../lib/SyncV2Store.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$databasePath = sys_get_temp_dir()
    . DIRECTORY_SEPARATOR
    . 'vtt-sync-v2-'
    . bin2hex(random_bytes(8))
    . '.sqlite';

try {
    $store = new SyncV2Store($databasePath, 'test-world', 2, 2);
    $initial = $store->getSnapshot();
    expect($initial['revision'] === 0, 'Initial revision must be zero.');

    $commandOne = [
        'operationId' => 'operation-0001',
        'type' => 'shadow.observe',
        'baseRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'token-1',
        'payload' => ['column' => 2, 'row' => 3],
    ];
    $acceptedOne = $store->acceptShadowCommand($commandOne, 'GM');
    expect($acceptedOne['status'] === 'accepted', 'First command must be accepted.');
    expect($acceptedOne['event']['revision'] === 1, 'First event revision must be one.');
    expect($acceptedOne['idempotent'] === false, 'First command must not be idempotent.');

    $duplicate = $store->acceptShadowCommand($commandOne, 'GM');
    expect($duplicate['status'] === 'accepted', 'Duplicate command must return its accepted event.');
    expect($duplicate['idempotent'] === true, 'Duplicate operation ID must be idempotent.');
    expect($duplicate['event']['revision'] === 1, 'Duplicate must retain its original revision.');
    expect($store->getSnapshot()['revision'] === 1, 'Duplicate must not advance the revision.');

    $conflict = $store->acceptShadowCommand([
        'operationId' => 'operation-conflict',
        'type' => 'shadow.observe',
        'baseRevision' => 0,
        'payload' => ['ignored' => true],
    ], 'GM');
    expect($conflict['status'] === 'conflict', 'Stale base revision must conflict.');
    expect($store->getSnapshot()['revision'] === 1, 'Rejected command must not change state.');

    $acceptedTwo = $store->acceptShadowCommand([
        'operationId' => 'operation-0002',
        'type' => 'shadow.observe',
        'baseRevision' => 1,
        'payload' => ['step' => 2],
    ], 'GM');
    $acceptedThree = $store->acceptShadowCommand([
        'operationId' => 'operation-0003',
        'type' => 'shadow.observe',
        'baseRevision' => 2,
        'payload' => ['step' => 3],
    ], 'GM');
    expect($acceptedTwo['event']['revision'] === 2, 'Second accepted revision must be two.');
    expect($acceptedThree['event']['revision'] === 3, 'Third accepted revision must be three.');

    $events = $store->replayAfter(1);
    expect($events['mode'] === 'events', 'Retained gap must replay events.');
    expect(count($events['events']) === 2, 'Replay must contain revisions two and three.');
    expect($events['events'][0]['revision'] === 2, 'Replay events must be ordered.');
    expect($events['events'][1]['revision'] === 3, 'Replay events must be ordered.');

    $recovery = $store->replayAfter(0);
    expect($recovery['mode'] === 'snapshot', 'Expired event gap must return a snapshot.');
    expect($recovery['snapshot']['revision'] === 3, 'Recovery snapshot must be current.');
    expect(
        count($recovery['snapshot']['state']['shadow']['observations']) === 3,
        'Canonical state must include each accepted operation once.'
    );

    $lateDuplicate = $store->acceptShadowCommand($commandOne, 'GM');
    expect($lateDuplicate['idempotent'] === true, 'Pruned events must remain idempotent.');
    expect($lateDuplicate['event']['revision'] === 1, 'Idempotency ledger must retain original event.');
    expect($store->getSnapshot()['revision'] === 3, 'Late duplicate must not advance revision.');

    $invalidRejected = false;
    try {
        $store->acceptShadowCommand([
            'operationId' => 'operation-invalid',
            'type' => 'token.move',
            'baseRevision' => 3,
            'payload' => [],
        ], 'GM');
    } catch (InvalidArgumentException $error) {
        $invalidRejected = true;
    }
    expect($invalidRejected, 'Phase 1 must reject live-domain commands.');

    $moveOne = [
        'operationId' => 'movement-operation-0001',
        'type' => 'token.move',
        'baseRevision' => 3,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'token-1',
        'payload' => ['placementId' => 'token-1', 'column' => 8, 'row' => 5],
    ];
    $legacyToken = ['id' => 'token-1', 'column' => 1, 'row' => 1, 'width' => 1, 'height' => 1];
    $moveAccepted = $store->acceptTokenMove($moveOne, 'GM', $legacyToken);
    expect($moveAccepted['status'] === 'accepted', 'A valid token move must be accepted.');
    expect($moveAccepted['event']['revision'] === 4, 'Token move must advance world revision.');
    expect($moveAccepted['event']['entityRevision'] === 1, 'First token move must advance entity revision.');

    $sameTokenConflict = $store->acceptTokenMove([
        ...$moveOne,
        'operationId' => 'movement-operation-stale',
        'payload' => ['placementId' => 'token-1', 'column' => 9, 'row' => 5],
    ], 'GM', $legacyToken);
    expect($sameTokenConflict['status'] === 'conflict', 'A stale same-token move must conflict.');
    expect(
        $sameTokenConflict['error'] === 'entity_revision_mismatch',
        'Same-token conflict must identify the entity revision.'
    );

    $otherToken = ['id' => 'token-2', 'column' => 2, 'row' => 2, 'width' => 1, 'height' => 1];
    $unrelatedAccepted = $store->acceptTokenMove([
        'operationId' => 'movement-operation-0002',
        'type' => 'token.move',
        // Deliberately behind the world revision: unrelated entity revisions
        // are the concurrency boundary, not a global whole-board lock.
        'baseRevision' => 3,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'token-2',
        'payload' => ['placementId' => 'token-2', 'column' => 4, 'row' => 6],
    ], 'GM', $otherToken);
    expect($unrelatedAccepted['status'] === 'accepted', 'An unrelated token may move from a behind base revision.');
    expect($unrelatedAccepted['event']['revision'] === 5, 'Unrelated move must receive the next world revision.');
    expect(
        (float) $store->getSnapshot()['state']['placements']['scene-1']['token-1']['column'] === 8.0,
        'Rejected same-token move must not alter canonical coordinates.'
    );

    $moveDuplicate = $store->acceptTokenMove($moveOne, 'GM', $legacyToken);
    expect($moveDuplicate['idempotent'] === true, 'Duplicate token operation must apply once.');
    expect($store->getSnapshot()['revision'] === 5, 'Duplicate token move must not advance revision.');

    $store->migrateLegacyPlacements([
        'placements' => [
            'scene-1' => [
                ['id' => 'token-1', 'name' => 'Hero', 'column' => 1, 'row' => 1, 'stamina' => 20],
                ['id' => 'token-2', 'name' => 'Ally', 'column' => 2, 'row' => 2, 'stamina' => 15],
            ],
        ],
        'sceneState' => [
            'scene-1' => ['claimedTokens' => ['token-1' => 'player-a']],
        ],
    ]);
    $migrated = $store->getSnapshot();
    expect(
        (float) $migrated['state']['placements']['scene-1']['token-1']['column'] === 8.0,
        'Migration must preserve canonical Phase 3 coordinates.'
    );
    expect(
        $migrated['state']['placements']['scene-1']['token-1']['name'] === 'Hero',
        'Migration must enrich Phase 3 movement entities with full placement data.'
    );

    $batch = $store->acceptPlacementBatch([
        'operationId' => 'placement-batch-0001',
        'type' => 'placement.batch',
        'baseRevision' => 5,
        'payload' => [
            'actions' => [
                [
                    'kind' => 'patch',
                    'sceneId' => 'scene-1',
                    'placementId' => 'token-1',
                    'entityRevision' => 1,
                    'patch' => ['stamina' => 12],
                ],
                [
                    'kind' => 'patch',
                    'sceneId' => 'scene-1',
                    'placementId' => 'token-2',
                    'entityRevision' => 1,
                    'patch' => ['stamina' => 10],
                ],
            ],
        ],
    ], 'GM', true);
    expect($batch['status'] === 'accepted', 'A valid multi-token batch must be accepted.');
    expect($batch['event']['revision'] === 6, 'A whole batch must consume one world revision.');
    expect(
        $store->getSnapshot()['state']['placements']['scene-1']['token-1']['stamina'] === 12,
        'First atomic batch mutation must persist.'
    );
    expect(
        $store->getSnapshot()['state']['placements']['scene-1']['token-2']['stamina'] === 10,
        'Second atomic batch mutation must persist.'
    );

    $beforeRejectedBatch = $store->getSnapshot();
    $rejectedBatch = $store->acceptPlacementBatch([
        'operationId' => 'placement-batch-rejected',
        'type' => 'placement.batch',
        'baseRevision' => 6,
        'payload' => [
            'actions' => [
                [
                    'kind' => 'patch',
                    'sceneId' => 'scene-1',
                    'placementId' => 'token-1',
                    'entityRevision' => 2,
                    'patch' => ['stamina' => 1],
                ],
                [
                    'kind' => 'patch',
                    'sceneId' => 'scene-1',
                    'placementId' => 'token-2',
                    'entityRevision' => 0,
                    'patch' => ['stamina' => 1],
                ],
            ],
        ],
    ], 'GM', true);
    expect($rejectedBatch['status'] === 'conflict', 'One stale action must reject the whole batch.');
    expect(
        $store->getSnapshot() === $beforeRejectedBatch,
        'A rejected batch must leave every placement and revision unchanged.'
    );

    $playerPatch = $store->acceptPlacementBatch([
        'operationId' => 'placement-player-patch',
        'type' => 'placement.batch',
        'baseRevision' => 6,
        'payload' => [
            'actions' => [[
                'kind' => 'patch',
                'sceneId' => 'scene-1',
                'placementId' => 'token-1',
                'entityRevision' => 2,
                'patch' => ['stamina' => 9],
            ]],
        ],
    ], 'player-a', false);
    expect($playerPatch['status'] === 'accepted', 'The canonical owner may change gameplay fields.');

    $playerPrivilegedRejected = false;
    try {
        $store->acceptPlacementBatch([
            'operationId' => 'placement-player-hidden',
            'type' => 'placement.batch',
            'baseRevision' => 7,
            'payload' => [
                'actions' => [[
                    'kind' => 'patch',
                    'sceneId' => 'scene-1',
                    'placementId' => 'token-1',
                    'entityRevision' => 3,
                    'patch' => ['hidden' => true],
                ]],
            ],
        ], 'player-a', false);
    } catch (InvalidArgumentException $error) {
        $playerPrivilegedRejected = true;
    }
    expect($playerPrivilegedRejected, 'Players must not change GM-only placement fields.');

    $enemyTeamPatch = $store->acceptPlacementBatch([
        'operationId' => 'placement-enemy-team',
        'type' => 'placement.batch',
        'baseRevision' => 7,
        'payload' => [
            'actions' => [[
                'kind' => 'patch',
                'sceneId' => 'scene-1',
                'placementId' => 'token-2',
                'entityRevision' => 2,
                'patch' => ['team' => 'enemy'],
            ]],
        ],
    ], 'GM', true);
    expect($enemyTeamPatch['event']['revision'] === 8, 'Enemy team setup must advance revision.');

    $store->migrateLegacyCombat([
        'sceneState' => [
            'scene-1' => [
                'combat' => [
                    'active' => false,
                    'groups' => [],
                    'malice' => 99,
                ],
            ],
        ],
    ]);
    expect(
        $store->getSnapshot()['state']['combat']['scene-1']['active'] === false,
        'Legacy combat migration must establish a canonical inactive record.'
    );

    $combatStart = $store->acceptCombatCommand([
        'operationId' => 'combat-start-0001',
        'type' => 'combat.start',
        'baseRevision' => 8,
        'sceneId' => 'scene-1',
        'payload' => [
            'startingTeam' => 'ally',
            'encounterId' => 'encounter-test',
            'combat' => ['groups' => [], 'lastEffects' => []],
        ],
    ], 'GM', true);
    expect($combatStart['status'] === 'accepted', 'The GM must be able to start combat.');
    expect($combatStart['event']['revision'] === 9, 'Combat start must consume one revision.');
    expect(
        $combatStart['event']['payload']['combat']['currentTeam'] === 'ally',
        'The server must decide the first side from the accepted start command.'
    );

    $playerTurn = $store->acceptCombatCommand([
        'operationId' => 'combat-turn-player-a',
        'type' => 'turn.start',
        'baseRevision' => 9,
        'sceneId' => 'scene-1',
        'payload' => ['combatantId' => 'token-1', 'holderName' => 'Player A'],
    ], 'player-a', false);
    expect($playerTurn['status'] === 'accepted', 'A player may start a claimed ally turn.');
    expect(
        $playerTurn['event']['payload']['combat']['activeCombatantId'] === 'token-1',
        'The accepted event must contain the canonical active combatant.'
    );

    $racingTurn = $store->acceptCombatCommand([
        'operationId' => 'combat-racing-turn',
        'type' => 'turn.start',
        // This client observed combat start but not the accepted player turn.
        'baseRevision' => 9,
        'sceneId' => 'scene-1',
        'payload' => ['combatantId' => 'token-2'],
    ], 'GM', true);
    expect($racingTurn['status'] === 'conflict', 'A racing second turn must not replace the winner.');
    expect(
        $racingTurn['error'] === 'turn_already_active',
        'The race loser must receive the current-state reason.'
    );

    $unauthorizedComplete = false;
    try {
        $store->acceptCombatCommand([
            'operationId' => 'combat-wrong-player',
            'type' => 'turn.complete',
            'baseRevision' => 10,
            'sceneId' => 'scene-1',
            'payload' => ['combatantId' => 'token-1'],
        ], 'player-b', false);
    } catch (InvalidArgumentException $error) {
        $unauthorizedComplete = true;
    }
    expect($unauthorizedComplete, 'Another player must not complete a claimed combatant turn.');
    expect($store->getSnapshot()['revision'] === 10, 'Rejected races and permissions must not write.');

    $turnComplete = $store->acceptCombatCommand([
        'operationId' => 'combat-turn-complete',
        'type' => 'turn.complete',
        'baseRevision' => 10,
        'sceneId' => 'scene-1',
        'payload' => ['combatantId' => 'token-1'],
    ], 'player-a', false);
    expect($turnComplete['event']['revision'] === 11, 'Turn completion must write once.');
    expect(
        $turnComplete['event']['payload']['combat']['currentTeam'] === 'enemy',
        'Turn completion must atomically hand the pick to the other side.'
    );

    $enemyTurn = $store->acceptCombatCommand([
        'operationId' => 'combat-enemy-turn',
        'type' => 'turn.start',
        // Behind on unrelated world history is allowed; canonical combat state decides.
        'baseRevision' => 9,
        'sceneId' => 'scene-1',
        'payload' => ['combatantId' => 'token-2'],
    ], 'GM', true);
    expect($enemyTurn['event']['revision'] === 12, 'The GM may start the current enemy turn.');

    $roundAdvance = $store->acceptCombatCommand([
        'operationId' => 'combat-round-advance',
        'type' => 'round.advance',
        'baseRevision' => 12,
        'sceneId' => 'scene-1',
        'payload' => [],
    ], 'GM', true);
    expect($roundAdvance['event']['revision'] === 13, 'Round advance must be one atomic write.');
    expect(
        $roundAdvance['event']['payload']['combat']['round'] === 2
        && $roundAdvance['event']['payload']['combat']['activeCombatantId'] === null
        && $roundAdvance['event']['payload']['combat']['completedCombatantIds'] === [],
        'Round advance must finish the active turn and reset round picks atomically.'
    );

    $combatPatch = $store->acceptCombatCommand([
        'operationId' => 'combat-malice-patch',
        'type' => 'combat.patch',
        'baseRevision' => 13,
        'sceneId' => 'scene-1',
        'payload' => ['patch' => ['malice' => 7]],
    ], 'GM', true);
    expect(
        $combatPatch['event']['payload']['combat']['malice'] === 7,
        'Auxiliary combat fields must patch without replacing turn state.'
    );

    $combatEndCommand = [
        'operationId' => 'combat-end-0001',
        'type' => 'combat.end',
        'baseRevision' => 14,
        'sceneId' => 'scene-1',
        'payload' => ['encounterId' => 'encounter-test'],
    ];
    $combatEnd = $store->acceptCombatCommand($combatEndCommand, 'GM', true);
    expect($combatEnd['event']['revision'] === 15, 'Combat end must write once.');
    expect(
        $combatEnd['event']['payload']['combat']['active'] === false,
        'Combat end must publish the canonical inactive state.'
    );
    $combatEndDuplicate = $store->acceptCombatCommand($combatEndCommand, 'GM', true);
    expect($combatEndDuplicate['idempotent'] === true, 'A duplicate combat command must apply once.');
    expect($store->getSnapshot()['revision'] === 15, 'A duplicate combat command must not advance revision.');

    $automationClaimCommand = [
        'operationId' => 'combat-automation:combat-end-0001',
        'type' => 'combat.automation.claim',
        'baseRevision' => 15,
        'sceneId' => 'scene-1',
        'payload' => ['transitionOperationId' => 'combat-end-0001'],
    ];
    $automationClaim = $store->acceptCombatCommand($automationClaimCommand, 'GM', true);
    expect($automationClaim['event']['revision'] === 16, 'The first automation claim must write once.');
    expect(
        $automationClaim['event']['type'] === 'combat.automationClaimed',
        'Automation claims must publish a reducer-safe canonical event.'
    );
    $automationClaimDuplicate = $store->acceptCombatCommand($automationClaimCommand, 'GM', true);
    expect(
        $automationClaimDuplicate['idempotent'] === true,
        'Only one GM tab or device may win an automation claim.'
    );
    expect($store->getSnapshot()['revision'] === 16, 'Duplicate automation claims must not advance revision.');

    $store->migrateLegacyBoardDomains([
        'activeSceneId' => 'scene-1',
        'templates' => ['scene-1' => [['id' => 'template-1', 'shape' => 'circle']]],
        'drawings' => ['scene-1' => [['id' => 'drawing-1', 'points' => [[0, 0], [1, 1]]]]],
        'pings' => [],
        'sceneState' => [
            'scene-1' => [
                'grid' => ['size' => 64, 'visible' => true],
                'fogOfWar' => ['byLevel' => []],
                'mapLevels' => ['levels' => []],
                'userLevelState' => [],
            ],
        ],
    ]);
    $templateUpdate = $store->acceptBoardDomainCommand([
        'operationId' => 'template-update-0001',
        'type' => 'template.upsert',
        'baseRevision' => 16,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'template-1',
        'payload' => ['template' => ['id' => 'template-1', 'shape' => 'cone']],
    ], 'player-a', false);
    expect(
        $templateUpdate['event']['type'] === 'template.updated'
        && $templateUpdate['event']['entityRevision'] === 1,
        'Template upsert must emit one entity-revisioned canonical event.'
    );
    $staleTemplate = $store->acceptBoardDomainCommand([
        'operationId' => 'template-update-stale',
        'type' => 'template.upsert',
        'baseRevision' => 16,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'entityId' => 'template-1',
        'payload' => ['template' => ['id' => 'template-1', 'shape' => 'square']],
    ], 'player-b', false);
    expect($staleTemplate['status'] === 'conflict', 'A stale same-template write must conflict.');

    $playerLevel = $store->acceptBoardDomainCommand([
        'operationId' => 'level-user-player-a',
        'type' => 'level.user.set',
        'baseRevision' => 17,
        'entityRevision' => 0,
        'sceneId' => 'scene-1',
        'payload' => [
            'userId' => 'player-a',
            'entry' => ['levelId' => 'level-0', 'source' => 'manual'],
        ],
    ], 'player-a', false);
    expect($playerLevel['event']['type'] === 'level.userChanged', 'Players may route their own view.');
    $levelPermissionRejected = false;
    try {
        $store->acceptBoardDomainCommand([
            'operationId' => 'level-user-player-bad',
            'type' => 'level.user.set',
            'baseRevision' => 18,
            'entityRevision' => 1,
            'sceneId' => 'scene-1',
            'payload' => [
                'userId' => 'player-b',
                'entry' => ['levelId' => 'level-0'],
            ],
        ], 'player-a', false);
    } catch (InvalidArgumentException $error) {
        $levelPermissionRejected = true;
    }
    expect($levelPermissionRejected, 'Players must not route another user.');

    $gridUpdate = $store->acceptBoardDomainCommand([
        'operationId' => 'grid-update-0001',
        'type' => 'grid.set',
        'baseRevision' => 18,
        'entityRevision' => 1,
        'sceneId' => 'scene-1',
        'payload' => ['grid' => ['size' => 72, 'visible' => true]],
    ], 'GM', true);
    expect($gridUpdate['event']['type'] === 'grid.changed', 'Grid changes must be explicit events.');
    $routeUpdate = $store->acceptBoardDomainCommand([
        'operationId' => 'routing-update-0001',
        'type' => 'routing.set',
        'baseRevision' => 19,
        'entityRevision' => 0,
        'payload' => ['routing' => ['playerMapDisabled' => true]],
    ], 'GM', true);
    expect($routeUpdate['event']['type'] === 'routing.changed', 'Viewer routing must be canonical.');
    expect(
        $store->getSnapshot()['state']['sceneConfig']['scene-1']['grid']['size'] === 72,
        'Canonical grid state must retain the accepted update.'
    );

    echo json_encode([
        'success' => true,
        'revision' => $store->getSnapshot()['revision'],
    ], JSON_UNESCAPED_SLASHES);
} finally {
    unset($store);
    gc_collect_cycles();
    foreach ([$databasePath, $databasePath . '-shm', $databasePath . '-wal'] as $path) {
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
