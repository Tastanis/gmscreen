<?php
declare(strict_types=1);

require_once __DIR__ . '/../_common.php';

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
$overrideDatabasePath = sys_get_temp_dir()
    . DIRECTORY_SEPARATOR
    . 'vtt-sync-v2-override-'
    . bin2hex(random_bytes(8))
    . '.sqlite';
$gmOverrideDatabasePath = sys_get_temp_dir()
    . DIRECTORY_SEPARATOR
    . 'vtt-sync-v2-gm-override-'
    . bin2hex(random_bytes(8))
    . '.sqlite';
$requestedTestDatabasePath = sys_get_temp_dir()
    . DIRECTORY_SEPARATOR
    . 'vtt-sync-v2-requested-test-'
    . bin2hex(random_bytes(8))
    . '.sqlite';
$linkedLevelDatabasePath = sys_get_temp_dir()
    . DIRECTORY_SEPARATOR
    . 'vtt-sync-v2-linked-level-'
    . bin2hex(random_bytes(8))
    . '.sqlite';

try {
    $store = new SyncV2Store($databasePath, 'test-world', 2, 2, 3);
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
                ['id' => 'token-3', 'name' => 'Second Hero', 'column' => 3, 'row' => 2, 'stamina' => 18],
            ],
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
    expect($playerTurn['status'] === 'accepted', 'A player may start any ally turn.');
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

    $turnComplete = $store->acceptCombatCommand([
        'operationId' => 'combat-turn-complete',
        'type' => 'turn.complete',
        'baseRevision' => 10,
        'sceneId' => 'scene-1',
        'payload' => ['combatantId' => 'token-1'],
    ], 'player-b', false);
    expect($turnComplete['event']['revision'] === 11, 'Turn completion must write once.');
    expect(
        $turnComplete['event']['payload']['combat']['currentTeam'] === 'enemy',
        'Turn completion must atomically hand the pick to the other side.'
    );
    expect(
        $turnComplete['event']['payload']['transition']['turnEndInteractionOwnerId'] === 'player-b',
        'The user who ends an allied turn must own its end-of-turn questions.'
    );

    $playerEnemyTurn = false;
    try {
        $store->acceptCombatCommand([
            'operationId' => 'combat-player-enemy-turn',
            'type' => 'turn.start',
            'baseRevision' => 11,
            'sceneId' => 'scene-1',
            'payload' => ['combatantId' => 'token-2'],
        ], 'player-a', false);
    } catch (InvalidArgumentException $error) {
        $playerEnemyTurn = true;
    }
    expect($playerEnemyTurn, 'Players must not be able to start enemy turns.');
    expect($store->getSnapshot()['revision'] === 11, 'A rejected enemy turn must not write.');

    $enemyTurn = $store->acceptCombatCommand([
        'operationId' => 'combat-enemy-turn',
        'type' => 'turn.start',
        // Behind on unrelated world history is allowed; canonical combat state decides.
        'baseRevision' => 9,
        'sceneId' => 'scene-1',
        'payload' => ['combatantId' => 'token-2'],
    ], 'GM', true);
    expect($enemyTurn['event']['revision'] === 12, 'The GM may start the current enemy turn.');

    $playerOverride = $store->acceptCombatCommand([
        'operationId' => 'combat-player-override',
        'type' => 'turn.start',
        'baseRevision' => 12,
        'sceneId' => 'scene-1',
        'payload' => [
            'combatantId' => 'token-3',
            'holderName' => 'Player B',
            'override' => true,
        ],
    ], 'player-b', false);
    expect(
        $playerOverride['event']['revision'] === 13
            && $playerOverride['event']['payload']['combat']['activeCombatantId'] === 'token-3',
        'A player-confirmed override must canonically replace an active enemy turn.'
    );
    expect(
        $playerOverride['event']['payload']['transition']['interactionOwnerId'] === 'player-b'
            && $playerOverride['event']['payload']['transition']['turnEndInteractionOwnerId'] === 'player-b',
        'The overriding user must own both the replaced turn end and selected ally turn start.'
    );

    $roundAdvance = $store->acceptCombatCommand([
        'operationId' => 'combat-round-advance',
        'type' => 'round.advance',
        'baseRevision' => 12,
        'sceneId' => 'scene-1',
        'payload' => [],
    ], 'GM', true);
    expect($roundAdvance['event']['revision'] === 14, 'Round advance must be one atomic write.');
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
    expect($combatEnd['event']['revision'] === 16, 'Combat end must write once.');
    expect(
        $combatEnd['event']['payload']['combat']['active'] === false,
        'Combat end must publish the canonical inactive state.'
    );
    $combatEndDuplicate = $store->acceptCombatCommand($combatEndCommand, 'GM', true);
    expect($combatEndDuplicate['idempotent'] === true, 'A duplicate combat command must apply once.');
    expect($store->getSnapshot()['revision'] === 16, 'A duplicate combat command must not advance revision.');

    $automationClaimCommand = [
        'operationId' => 'combat-automation:combat-end-0001',
        'type' => 'combat.automation.claim',
        'baseRevision' => 15,
        'sceneId' => 'scene-1',
        'payload' => ['transitionOperationId' => 'combat-end-0001'],
    ];
    $automationClaim = $store->acceptCombatCommand($automationClaimCommand, 'GM', true);
    expect($automationClaim['event']['revision'] === 17, 'The first automation claim must write once.');
    expect(
        $automationClaim['event']['type'] === 'combat.automationClaimed',
        'Automation claims must publish a reducer-safe canonical event.'
    );
    $automationClaimDuplicate = $store->acceptCombatCommand($automationClaimCommand, 'GM', true);
    expect(
        $automationClaimDuplicate['idempotent'] === true,
        'Only one GM tab or device may win an automation claim.'
    );
    expect($store->getSnapshot()['revision'] === 17, 'Duplicate automation claims must not advance revision.');

    $wrongBoundaryOwner = false;
    try {
        $store->acceptCombatCommand([
            'operationId' => 'combat-automation:turn-start:wrong-user',
            'type' => 'combat.automation.claim',
            'baseRevision' => 17,
            'sceneId' => 'scene-1',
            'payload' => [
                'transitionOperationId' => 'combat-player-override',
                'boundary' => 'turn-start',
            ],
        ], 'player-a', false);
    } catch (InvalidArgumentException $error) {
        $wrongBoundaryOwner = true;
    }
    expect($wrongBoundaryOwner, 'A different user must not receive another initiator\'s turn prompts.');

    $turnStartClaim = $store->acceptCombatCommand([
        'operationId' => 'combat-automation:turn-start:combat-player-override',
        'type' => 'combat.automation.claim',
        'baseRevision' => 17,
        'sceneId' => 'scene-1',
        'payload' => [
            'transitionOperationId' => 'combat-player-override',
            'boundary' => 'turn-start',
        ],
    ], 'player-b', false);
    expect($turnStartClaim['event']['revision'] === 18, 'The ally turn initiator may claim start-of-turn prompts.');

    $turnEndClaim = $store->acceptCombatCommand([
        'operationId' => 'combat-automation:turn-end:combat-player-override',
        'type' => 'combat.automation.claim',
        'baseRevision' => 18,
        'sceneId' => 'scene-1',
        'payload' => [
            'transitionOperationId' => 'combat-player-override',
            'boundary' => 'turn-end',
        ],
    ], 'player-b', false);
    expect($turnEndClaim['event']['revision'] === 19, 'The overriding user may resolve the replaced turn end.');

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
    $operationalStatus = $store->getOperationalStatus();
    expect($operationalStatus['revision'] === 23, 'Operational status must report current revision.');
    expect($operationalStatus['retainedEvents'] <= 2, 'Event retention must remain bounded.');
    expect($operationalStatus['snapshots'] <= 3, 'Snapshot retention must remain bounded.');
    expect(
        $operationalStatus['operationLedgerEntries'] === 23,
        'Idempotency ledger must outlive event and snapshot retention.'
    );
    $hiddenAudienceEvent = [
        'revision' => 20,
        'operationId' => 'hidden-audience-event',
        'type' => 'placement.batchApplied',
        'actorId' => 'GM',
        'sceneId' => null,
        'entityId' => null,
        'entityRevision' => null,
        'payload' => [
            'mutations' => [[
                'kind' => 'upsert',
                'sceneId' => 'scene-1',
                'placementId' => 'hidden-token',
                'entityRevision' => 1,
                'placement' => ['id' => 'hidden-token', 'hidden' => true],
                'wasPlayerVisible' => false,
            ]],
            'userLevelMutations' => [[
                'sceneId' => 'scene-1',
                'userId' => 'zepha',
                'entry' => ['levelId' => 'level-0', 'source' => 'token'],
                'sceneConfigRevision' => 1,
            ]],
        ],
        'serverTime' => 1234,
    ];
    $playerAudienceEvent = vttSyncV2ProjectEventForUser(
        $hiddenAudienceEvent,
        ['isGM' => false]
    );
    expect(
        $playerAudienceEvent['payload']['mutations'] === [],
        'Player audience events must not contain hidden placement payloads.'
    );
    expect(
        ($playerAudienceEvent['payload']['userLevelMutations'][0]['userId'] ?? null) === 'zepha',
        'Player audience events must retain visible linked-PC viewer changes.'
    );
    expect(
        vttSyncV2ProjectEventForUser($hiddenAudienceEvent, ['isGM' => true])
            === $hiddenAudienceEvent,
        'GM audience events must retain the complete canonical payload.'
    );
    $hiddenLevelSnapshot = [
        'revision' => 20,
        'state' => [
            'placements' => [
                'scene-1' => [
                    'visible-token' => ['id' => 'visible-token', 'levelId' => 'ground'],
                    'hidden-level-token' => ['id' => 'hidden-level-token', 'levelId' => 'secret'],
                ],
            ],
            'claims' => [],
            'combat' => [],
            'routing' => [],
            'sceneConfig' => [
                'scene-1' => [
                    'mapLevels' => [
                        'levels' => [
                            ['id' => 'ground', 'defaultForPlayers' => true],
                            ['id' => 'secret', 'hidden' => true, 'mapUrl' => '/secret-map.webp'],
                        ],
                        'activeLevelId' => 'secret',
                        'baseStairs' => [
                            ['id' => 'secret-stair', 'linkedLevelId' => 'secret'],
                        ],
                    ],
                    'fogOfWar' => [
                        'byLevel' => [
                            'ground' => ['revealedCells' => []],
                            'secret' => ['revealedCells' => ['1,1' => true]],
                        ],
                    ],
                    'userLevelState' => [
                        'cal' => ['levelId' => 'secret'],
                    ],
                ],
            ],
        ],
    ];
    $projectedHiddenLevelSnapshot = vttSyncV2ProjectSnapshotForUser(
        $hiddenLevelSnapshot,
        ['isGM' => false]
    );
    expect(
        !isset($projectedHiddenLevelSnapshot['state']['placements']['scene-1']['hidden-level-token']),
        'Player snapshots must omit placements on GM-hidden map levels.'
    );
    expect(
        count($projectedHiddenLevelSnapshot['state']['sceneConfig']['scene-1']['mapLevels']['levels'])
            === 1,
        'Player snapshots must omit GM-hidden map definitions.'
    );
    expect(
        $projectedHiddenLevelSnapshot['state']['sceneConfig']['scene-1']['mapLevels']['activeLevelId']
            === 'ground',
        'Player snapshots must recover to a visible active map level.'
    );
    expect(
        !isset(
            $projectedHiddenLevelSnapshot['state']['sceneConfig']['scene-1']
                ['fogOfWar']['byLevel']['secret']
        ),
        'Player snapshots must omit fog data belonging to hidden map levels.'
    );
    $hiddenLevelsEvent = [
        'revision' => 21,
        'operationId' => 'hidden-level-event',
        'type' => 'levels.replaced',
        'actorId' => 'GM',
        'sceneId' => 'scene-1',
        'entityId' => 'scene-1',
        'entityRevision' => 2,
        'payload' => [
            'mapLevels' => $hiddenLevelSnapshot['state']['sceneConfig']['scene-1']['mapLevels'],
        ],
        'serverTime' => 1235,
    ];
    $projectedHiddenLevelsEvent = vttSyncV2ProjectEventForUser(
        $hiddenLevelsEvent,
        ['isGM' => false]
    );
    expect(
        count($projectedHiddenLevelsEvent['payload']['mapLevels']['levels']) === 1,
        'Player live events must omit GM-hidden map definitions.'
    );
    $pusherAuthorization = vttSyncV2BuildPusherAuthorization(
        '123.456',
        'private-vtt-sync-v2-players',
        'public-key',
        'server-secret'
    );
    expect(
        hash_equals(
            'public-key:' . hash_hmac(
                'sha256',
                '123.456:private-vtt-sync-v2-players',
                'server-secret'
            ),
            $pusherAuthorization['auth']
        ),
        'Private audience authorization must use the exact Pusher HMAC contract.'
    );

    $movementSnapshot = $store->getSnapshot();
    $allyPlacement = $movementSnapshot['state']['placements']['scene-1']['token-1'];
    $enemyPlacement = $movementSnapshot['state']['placements']['scene-1']['token-2'];
    expect(
        $store->playerMayMovePlacement($allyPlacement),
        'Players may move visible allied placements.'
    );
    expect(
        !$store->playerMayMovePlacement($enemyPlacement),
        'Players must not move enemy placements.'
    );
    expect(
        !$store->playerMayMovePlacement([...$allyPlacement, 'hidden' => true]),
        'Players must not move hidden allied placements.'
    );

    $allyMovement = $store->acceptPlacementBatch([
        'operationId' => 'placement-player-ally-move',
        'type' => 'placement.batch',
        'baseRevision' => $movementSnapshot['revision'],
        'payload' => [
            'actions' => [[
                'kind' => 'patch',
                'sceneId' => 'scene-1',
                'placementId' => 'token-1',
                'entityRevision' => $allyPlacement['_entityRevision'],
                'patch' => ['column' => 9, 'row' => 7],
            ]],
        ],
    ], 'player-b', false);
    expect(
        $allyMovement['status'] === 'accepted',
        'A player may move any allied token.'
    );

    $beforeAbilityEffect = $store->getSnapshot();
    $enemyBeforeAbility = $beforeAbilityEffect['state']['placements']['scene-1']['token-2'];
    $abilityEffect = $store->acceptPlacementBatch([
        'operationId' => 'placement-player-enemy-ability',
        'type' => 'placement.batch',
        'baseRevision' => $beforeAbilityEffect['revision'],
        'payload' => [
            'actions' => [[
                'kind' => 'patch',
                'sceneId' => 'scene-1',
                'placementId' => 'token-2',
                'entityRevision' => $enemyBeforeAbility['_entityRevision'],
                'patch' => [
                    'column' => 9,
                    'row' => 8,
                    'hp' => ['current' => '3', 'max' => '15'],
                ],
            ]],
        ],
    ], 'player-a', false);
    expect($abilityEffect['status'] === 'accepted', 'Player abilities may affect visible enemy tokens.');
    expect(
        (float) $store->getSnapshot()['state']['placements']['scene-1']['token-2']['column'] === 9.0
            && $store->getSnapshot()['state']['placements']['scene-1']['token-2']['hp']['current'] === '3',
        'Ability movement and damage must persist in the canonical enemy placement.'
    );

    $sceneDeletion = $store->deleteScene('scene-1', 'GM');
    expect(
        $sceneDeletion['event']['type'] === 'scene.deleted'
            && $sceneDeletion['event']['revision'] === 26,
        'Scene deletion must emit one canonical revisioned event.'
    );
    $afterSceneDeletion = $store->getSnapshot();
    foreach (['placements', 'combat', 'templates', 'drawings', 'sceneConfig'] as $domain) {
        expect(
            !isset($afterSceneDeletion['state'][$domain]['scene-1']),
            'Scene deletion must remove scene-owned ' . $domain . '.'
        );
    }
    expect(
        ($afterSceneDeletion['state']['routing']['activeSceneId'] ?? null) === null,
        'Deleting the active scene must clear canonical routing.'
    );

    $overrideStore = new SyncV2Store($overrideDatabasePath, 'override-world', 10, 10, 10);
    $overrideStore->migrateLegacyPlacements([
        'placements' => [
            'scene-override' => [[
                'id' => 'sharon-token',
                'name' => 'Sharon',
                'combatTeam' => 'ally',
            ]],
        ],
    ]);
    $overrideStore->migrateLegacyCombat([
        'sceneState' => [
            'scene-override' => ['combat' => ['active' => false, 'groups' => []]],
        ],
    ]);
    $overrideStore->acceptCombatCommand([
        'operationId' => 'override-combat-start',
        'type' => 'combat.start',
        'baseRevision' => 0,
        'sceneId' => 'scene-override',
        'payload' => ['startingTeam' => 'ally'],
    ], 'GM', true);
    $overrideStore->acceptCombatCommand([
        'operationId' => 'override-first-turn',
        'type' => 'turn.start',
        'baseRevision' => 1,
        'sceneId' => 'scene-override',
        'payload' => ['combatantId' => 'sharon-token'],
    ], 'sharon', false);
    $overrideStore->acceptCombatCommand([
        'operationId' => 'override-first-turn-complete',
        'type' => 'turn.complete',
        'baseRevision' => 2,
        'sceneId' => 'scene-override',
        'payload' => ['combatantId' => 'sharon-token'],
    ], 'sharon', false);
    $blockedRepeat = $overrideStore->acceptCombatCommand([
        'operationId' => 'override-repeat-blocked',
        'type' => 'turn.start',
        'baseRevision' => 3,
        'sceneId' => 'scene-override',
        'payload' => ['combatantId' => 'sharon-token'],
    ], 'sharon', false);
    expect(
        $blockedRepeat['status'] === 'conflict'
            && $blockedRepeat['error'] === 'combatant_already_completed',
        'A completed allied turn still requires an explicit confirmed override.'
    );
    $acceptedRepeat = $overrideStore->acceptCombatCommand([
        'operationId' => 'override-repeat-accepted',
        'type' => 'turn.start',
        'baseRevision' => 3,
        'sceneId' => 'scene-override',
        'payload' => ['combatantId' => 'sharon-token', 'override' => true],
    ], 'sharon', false);
    expect(
        $acceptedRepeat['status'] === 'accepted'
            && $acceptedRepeat['event']['payload']['combat']['activeCombatantId'] === 'sharon-token'
            && $acceptedRepeat['event']['payload']['combat']['completedCombatantIds'] === [],
        'A player-confirmed override may force-start a completed allied turn.'
    );

    $gmOverrideStore = new SyncV2Store($gmOverrideDatabasePath, 'gm-override-world', 10, 10, 10);
    $gmOverrideStore->migrateLegacyPlacements([
        'placements' => [
            'scene-gm-override' => [[
                'id' => 'sharon-gm-token',
                'name' => 'Sharon',
                'combatTeam' => 'ally',
            ]],
        ],
    ]);
    $gmOverrideStore->migrateLegacyCombat([
        'sceneState' => [
            'scene-gm-override' => ['combat' => ['active' => false, 'groups' => []]],
        ],
    ]);
    $gmOverrideStore->acceptCombatCommand([
        'operationId' => 'gm-override-combat-start',
        'type' => 'combat.start',
        'baseRevision' => 0,
        'sceneId' => 'scene-gm-override',
        'payload' => ['startingTeam' => 'enemy'],
    ], 'GM', true);
    $gmWrongSideStart = $gmOverrideStore->acceptCombatCommand([
        'operationId' => 'gm-wrong-side-start',
        'type' => 'turn.start',
        'baseRevision' => 1,
        'sceneId' => 'scene-gm-override',
        'payload' => ['combatantId' => 'sharon-gm-token', 'override' => true],
    ], 'GM', true);
    expect(
        $gmWrongSideStart['status'] === 'accepted'
            && $gmWrongSideStart['event']['payload']['combat']['activeCombatantId'] === 'sharon-gm-token',
        'A GM may explicitly override the current pick side and start an allied turn.'
    );

    $linkedLevelStore = new SyncV2Store($linkedLevelDatabasePath, 'linked-level-world', 10, 10, 10);
    $linkedLevelStore->migrateLegacyPlacements([
        'placements' => [
            'scene-levels' => [
                [
                    'id' => 'zepha-token',
                    'name' => 'Wind Speaker',
                    'metadata' => ['profileId' => 'Zepha'],
                    'levelId' => 'level-0',
                ],
                ['id' => 'crate', 'name' => 'Crate', 'levelId' => 'level-0'],
                ['id' => 'sharon-one', 'name' => 'Sharon', 'levelId' => 'level-0'],
                ['id' => 'sharon-two', 'name' => 'Sharon Illusion', 'levelId' => 'level-0'],
            ],
        ],
    ]);
    $linkedMove = $linkedLevelStore->acceptPlacementBatch([
        'operationId' => 'linked-level-zepha-up',
        'type' => 'placement.batch',
        'baseRevision' => 0,
        'payload' => ['actions' => [[
            'kind' => 'patch',
            'sceneId' => 'scene-levels',
            'placementId' => 'zepha-token',
            'entityRevision' => 0,
            'patch' => ['levelId' => 'upper'],
        ]]],
    ], 'GM', true);
    expect(
        ($linkedMove['event']['payload']['userLevelMutations'][0]['userId'] ?? null) === 'zepha',
        'A uniquely linked PC level move must include its player view in the same event.'
    );
    $linkedSnapshot = $linkedLevelStore->getSnapshot();
    expect(
        ($linkedSnapshot['state']['sceneConfig']['scene-levels']['userLevelState']['zepha']['levelId'] ?? null)
            === 'upper',
        'A uniquely linked PC level move must persist the player on the token level.'
    );
    expect(
        ($linkedSnapshot['state']['sceneConfig']['scene-levels']['userLevelState']['zepha']['source'] ?? null)
            === 'token',
        'Token-driven player routing must retain its source.'
    );
    $unlinkedMove = $linkedLevelStore->acceptPlacementBatch([
        'operationId' => 'linked-level-crate-up',
        'type' => 'placement.batch',
        'baseRevision' => 1,
        'payload' => ['actions' => [[
            'kind' => 'patch',
            'sceneId' => 'scene-levels',
            'placementId' => 'crate',
            'entityRevision' => 0,
            'patch' => ['levelId' => 'upper'],
        ]]],
    ], 'GM', true);
    expect(
        $unlinkedMove['event']['payload']['userLevelMutations'] === [],
        'An unlinked token must not move any player view.'
    );
    $ambiguousMove = $linkedLevelStore->acceptPlacementBatch([
        'operationId' => 'linked-level-duplicate-up',
        'type' => 'placement.batch',
        'baseRevision' => 2,
        'payload' => ['actions' => [[
            'kind' => 'patch',
            'sceneId' => 'scene-levels',
            'placementId' => 'sharon-one',
            'entityRevision' => 0,
            'patch' => ['levelId' => 'upper'],
        ]]],
    ], 'GM', true);
    expect(
        $ambiguousMove['event']['payload']['userLevelMutations'] === [],
        'Duplicate PC token links must not choose a player view arbitrarily.'
    );

    $requestedTestStore = new SyncV2Store($requestedTestDatabasePath, 'requested-test-world', 10, 10, 10);
    $requestedTestStore->touchPresence('alice', false);
    $createdTest = $requestedTestStore->acceptRequestedTestCommand([
        'operationId' => 'requested-test-create-0001',
        'type' => 'requestedTest.create',
        'baseRevision' => 0,
        'sceneId' => 'scene-requested-test',
        'entityId' => 'request-1',
        'payload' => ['request' => [
            'recipientId' => 'alice',
            'attribute' => 'Presence',
            'rollMode' => 'individual',
            'targetIds' => ['hero-token'],
            'targetNames' => ['Hero'],
            'test' => ['batchId' => 'batch-1'],
        ]],
    ], 'gm', true);
    expect($createdTest['event']['payload']['request']['recipientId'] === 'alice', 'An online linked owner receives the requested test.');
    $requestedTestStore->acceptRequestedTestCommand([
        'operationId' => 'requested-test-create-0002',
        'type' => 'requestedTest.create',
        'baseRevision' => 1,
        'sceneId' => 'scene-requested-test',
        'entityId' => 'request-2',
        'payload' => ['request' => [
            'recipientId' => 'alice', 'attribute' => 'Presence', 'rollMode' => 'individual',
            'targetIds' => ['second-token'], 'targetNames' => ['Second'],
            'test' => ['batchId' => 'batch-1'],
        ]],
    ], 'gm', true);
    $resolvedTest = $requestedTestStore->acceptRequestedTestCommand([
        'operationId' => 'requested-test-resolve-0001',
        'type' => 'requestedTest.resolve',
        'baseRevision' => 2,
        'sceneId' => 'scene-requested-test',
        'entityId' => 'request-1',
        'payload' => ['result' => ['tier' => 'tier2', 'total' => 14, 'dice' => [7, 5], 'targetIds' => ['hero-token']]],
    ], 'alice', false);
    expect($resolvedTest['event']['payload']['request']['status'] === 'resolved', 'The assigned owner can resolve the test.');
    $requestedTestStore->acceptRequestedTestCommand([
        'operationId' => 'requested-test-resolve-0002',
        'type' => 'requestedTest.resolve',
        'baseRevision' => 3,
        'sceneId' => 'scene-requested-test',
        'entityId' => 'request-2',
        'payload' => ['result' => ['tier' => 'tier3', 'total' => 18, 'dice' => [9, 9], 'targetIds' => ['second-token']]],
    ], 'alice', false);
    $claimedTest = $requestedTestStore->acceptRequestedTestCommand([
        'operationId' => 'requested-test-claim-0001',
        'type' => 'requestedTest.claim',
        'baseRevision' => 4,
        'sceneId' => 'scene-requested-test',
        'entityId' => 'request-1',
        'payload' => [],
    ], 'gm', true);
    expect($claimedTest['event']['payload']['request']['status'] === 'applying', 'The ability user atomically claims returned effects.');
    expect(count($claimedTest['event']['payload']['requests']) === 2, 'One claim atomically covers the complete requested-test batch.');
    $duplicateClaim = $requestedTestStore->acceptRequestedTestCommand([
        'operationId' => 'requested-test-claim-0002',
        'type' => 'requestedTest.claim',
        'baseRevision' => 5,
        'sceneId' => 'scene-requested-test',
        'entityId' => 'request-1',
        'payload' => [],
    ], 'gm', true);
    expect($duplicateClaim['status'] === 'conflict', 'A second tab cannot claim the same returned effects.');

    echo json_encode([
        'success' => true,
        'revision' => $store->getSnapshot()['revision'],
    ], JSON_UNESCAPED_SLASHES);
} finally {
    unset($store, $overrideStore, $gmOverrideStore, $linkedLevelStore, $requestedTestStore);
    gc_collect_cycles();
    foreach ([
        $databasePath,
        $databasePath . '-shm',
        $databasePath . '-wal',
        $overrideDatabasePath,
        $overrideDatabasePath . '-shm',
        $overrideDatabasePath . '-wal',
        $gmOverrideDatabasePath,
        $gmOverrideDatabasePath . '-shm',
        $gmOverrideDatabasePath . '-wal',
        $requestedTestDatabasePath,
        $requestedTestDatabasePath . '-shm',
        $requestedTestDatabasePath . '-wal',
        $linkedLevelDatabasePath,
        $linkedLevelDatabasePath . '-shm',
        $linkedLevelDatabasePath . '-wal',
    ] as $path) {
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
