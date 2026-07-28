<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    define('VTT_STATE_API_INCLUDE_ONLY', true);
}

require_once __DIR__ . '/../dnd/vtt/api/state.php';

final class StatePostIntegrationTest extends TestCase
{
    private string $boardStatePath;

    /** @var string|null */
    private $originalBoardState;

    /** @var array<int,string> */
    private array $originalBackups = [];

    protected function setUp(): void
    {
        $this->boardStatePath = __DIR__ . '/../dnd/vtt/storage/board-state.json';
        $this->originalBoardState = is_file($this->boardStatePath)
            ? (string) file_get_contents($this->boardStatePath)
            : null;

        $backupPattern = __DIR__ . '/../dnd/vtt/storage/backups/board-state-*.json';
        $existingBackups = glob($backupPattern);
        $this->originalBackups = is_array($existingBackups) ? $existingBackups : [];
    }

    protected function tearDown(): void
    {
        if ($this->originalBoardState === null) {
            if (file_exists($this->boardStatePath)) {
                @unlink($this->boardStatePath);
            }
        } else {
            file_put_contents($this->boardStatePath, $this->originalBoardState);
        }

        $backupPattern = __DIR__ . '/../dnd/vtt/storage/backups/board-state-*.json';
        $currentBackups = glob($backupPattern);
        if (is_array($currentBackups)) {
            foreach ($currentBackups as $backup) {
                if (!in_array($backup, $this->originalBackups, true)) {
                    @unlink($backup);
                }
            }
        }
    }

    public function testPlayerMovementUpdatesGmTokenAndPersistsToBoardState(): void
    {
        $initialState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'gm-token',
                        'name' => 'Goblin',
                        'metadata' => ['authorRole' => 'gm'],
                        'flags' => ['gmAuthored' => true],
                        'position' => ['x' => 2, 'y' => 3],
                        'hp' => 12,
                    ],
                ],
            ],
        ];

        $this->assertTrue(saveVttJson('board-state.json', $initialState));

        $playerPayload = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'gm-token',
                        'position' => ['x' => 8, 'y' => 5],
                        'hp' => 9,
                    ],
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($playerPayload);
        $existingState = loadVttJson('board-state.json');
        $nextState = normalizeBoardState($existingState);

        $placementUpdates = $updates['placements'] ?? [];
        foreach ($placementUpdates as $sceneId => $placements) {
            $currentPlacements = isset($nextState['placements'][$sceneId]) && is_array($nextState['placements'][$sceneId])
                ? $nextState['placements'][$sceneId]
                : [];
            $nextState['placements'][$sceneId] = mergeSceneEntriesPreservingGmAuthored(
                $currentPlacements,
                $placements
            );
        }

        $this->assertTrue(saveVttJson('board-state.json', $nextState));

        $stored = loadVttJson('board-state.json');
        $this->assertSame(8, $stored['placements']['scene-1'][0]['position']['x']);
        $this->assertSame(5, $stored['placements']['scene-1'][0]['position']['y']);
        $this->assertSame(9, $stored['placements']['scene-1'][0]['hp']);
        $this->assertSame('gm', $stored['placements']['scene-1'][0]['metadata']['authorRole']);
        $this->assertTrue($stored['placements']['scene-1'][0]['flags']['gmAuthored']);

        $playerView = filterPlacementsForPlayerView($stored);
        $this->assertArrayHasKey('scene-1', $playerView['placements']);
        $this->assertCount(1, $playerView['placements']['scene-1']);
        $this->assertSame(8, $playerView['placements']['scene-1'][0]['position']['x']);
        $this->assertSame(5, $playerView['placements']['scene-1'][0]['position']['y']);
    }

    public function testGmCombatSetOpEndsCombatAndPreservesSceneFields(): void
    {
        $state = [
            'sceneState' => [
                'scene-1' => [
                    'grid' => ['size' => 64],
                    'fogOfWar' => ['byLevel' => new stdClass()],
                    'combat' => [
                        'active' => true,
                        'round' => 3,
                        'activeCombatantId' => 'goblin',
                        'completedCombatantIds' => ['hero'],
                        'turnPhase' => 'active',
                        'sequence' => 7,
                        'updatedAt' => 1000,
                    ],
                ],
            ],
        ];

        $next = applyBoardStateOp($state, [
            'type' => 'combat.set',
            'sceneId' => 'scene-1',
            'combat' => [
                'active' => false,
                'round' => 0,
                'activeCombatantId' => null,
                'completedCombatantIds' => [],
                'turnPhase' => 'idle',
                'malice' => 0,
                'sequence' => 8,
                'updatedAt' => 2000,
                'monster' => ['name' => 'Hidden Monster'],
            ],
        ], ['isGm' => true]);

        $this->assertSame(['size' => 64], $next['sceneState']['scene-1']['grid']);
        $this->assertArrayHasKey('fogOfWar', $next['sceneState']['scene-1']);
        $this->assertFalse($next['sceneState']['scene-1']['combat']['active']);
        $this->assertSame(0, $next['sceneState']['scene-1']['combat']['round']);
        $this->assertSame('idle', $next['sceneState']['scene-1']['combat']['turnPhase']);
        $this->assertSame(8, $next['sceneState']['scene-1']['combat']['sequence']);
        $this->assertArrayNotHasKey('monster', $next['sceneState']['scene-1']['combat']);
    }

    public function testNonGmCombatSetOpCannotEndCombat(): void
    {
        $state = [
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => true,
                        'round' => 2,
                        'turnPhase' => 'active',
                        'sequence' => 5,
                        'updatedAt' => 1000,
                    ],
                ],
            ],
        ];

        $next = applyBoardStateOp($state, [
            'type' => 'combat.set',
            'sceneId' => 'scene-1',
            'combat' => [
                'active' => false,
                'round' => 0,
                'turnPhase' => 'idle',
                'sequence' => 6,
                'updatedAt' => 2000,
            ],
        ], ['isGm' => false]);

        $this->assertTrue($next['sceneState']['scene-1']['combat']['active']);
        $this->assertSame(2, $next['sceneState']['scene-1']['combat']['round']);
        $this->assertSame(5, $next['sceneState']['scene-1']['combat']['sequence']);
    }

    public function testCombatSetOpIgnoresOlderCombatSequence(): void
    {
        $state = [
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => false,
                        'round' => 0,
                        'turnPhase' => 'idle',
                        'sequence' => 10,
                        'updatedAt' => 3000,
                    ],
                ],
            ],
        ];

        $next = applyBoardStateOp($state, [
            'type' => 'combat.set',
            'sceneId' => 'scene-1',
            'combat' => [
                'active' => true,
                'round' => 4,
                'turnPhase' => 'active',
                'sequence' => 9,
                'updatedAt' => 4000,
            ],
        ], ['isGm' => true]);

        $this->assertFalse($next['sceneState']['scene-1']['combat']['active']);
        $this->assertSame(10, $next['sceneState']['scene-1']['combat']['sequence']);
    }

    public function testGmCombatSetOpCanEndCombatWithStaleSequence(): void
    {
        $state = [
            'sceneState' => [
                'scene-1' => [
                    'grid' => ['size' => 64],
                    'combat' => [
                        'active' => true,
                        'round' => 4,
                        'activeCombatantId' => 'goblin',
                        'completedCombatantIds' => ['hero'],
                        'turnPhase' => 'active',
                        'sequence' => 12,
                        'updatedAt' => 5000,
                    ],
                ],
            ],
        ];

        $next = applyBoardStateOp($state, [
            'type' => 'combat.set',
            'sceneId' => 'scene-1',
            'combat' => [
                'active' => false,
                'round' => 0,
                'activeCombatantId' => null,
                'completedCombatantIds' => [],
                'turnPhase' => 'idle',
                'sequence' => 9,
                'updatedAt' => 4000,
            ],
        ], ['isGm' => true]);

        $combat = $next['sceneState']['scene-1']['combat'];
        $this->assertFalse($combat['active']);
        $this->assertSame(0, $combat['round']);
        $this->assertSame('idle', $combat['turnPhase']);
        $this->assertSame(13, $combat['sequence']);
        $this->assertSame(5001, $combat['updatedAt']);
        $this->assertSame(['size' => 64], $next['sceneState']['scene-1']['grid']);
    }

    public function testGmCombatSetOpMissingActiveDoesNotBypassFreshness(): void
    {
        $state = [
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => true,
                        'round' => 4,
                        'turnPhase' => 'active',
                        'sequence' => 12,
                        'updatedAt' => 5000,
                    ],
                ],
            ],
        ];

        $next = applyBoardStateOp($state, [
            'type' => 'combat.set',
            'sceneId' => 'scene-1',
            'combat' => [
                'round' => 0,
                'turnPhase' => 'idle',
                'sequence' => 9,
                'updatedAt' => 4000,
            ],
        ], ['isGm' => true]);

        $this->assertTrue($next['sceneState']['scene-1']['combat']['active']);
        $this->assertSame(12, $next['sceneState']['scene-1']['combat']['sequence']);
    }

    public function testAppliedPlacementOpBroadcastUsesCanonicalStoredEntry(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero', 'column' => 8, 'row' => 4, '_lastModified' => 9000],
                ],
            ],
        ];

        $op = buildAppliedBoardStateOp([
            'type' => 'placement.move',
            'sceneId' => 'scene-1',
            'placementId' => 'hero',
            'x' => 8,
            'y' => 4,
        ], $state);

        $this->assertSame('placement.move', $op['type']);
        $this->assertSame(8, $op['x']);
        $this->assertSame(4, $op['y']);
        $this->assertTrue($op['publicVisible']);
        $this->assertArrayNotHasKey('placement', $op);
    }

    public function testVisibleMonsterMovementBroadcastDoesNotCarryLargeStatBlock(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [[
                    'id' => 'monster-1',
                    'hidden' => false,
                    'column' => 12,
                    'row' => 7,
                    'monster' => [
                        'abilities' => array_fill(0, 80, str_repeat('ability text ', 20)),
                    ],
                ]],
            ],
        ];

        $applied = buildAppliedBoardStateOp([
            'type' => 'placement.move',
            'sceneId' => 'scene-1',
            'placementId' => 'monster-1',
            'x' => 999,
            'y' => 999,
        ], $state);
        $safe = sanitizeBoardStateBroadcastOpsForPlayers([$applied], $state);
        $broadcast = buildPlayerSafeOpsBroadcast($safe, 10, 123456, 'gm', 'gm', 1);

        $this->assertSame('ops', $broadcast['type']);
        $this->assertSame('placement.move', $broadcast['ops'][0]['type']);
        $this->assertSame(12, $broadcast['ops'][0]['x']);
        $this->assertSame(7, $broadcast['ops'][0]['y']);
        $this->assertLessThan(1000, strlen((string) json_encode($broadcast)));
        $this->assertStringNotContainsString('ability text', (string) json_encode($broadcast));
    }

    public function testHiddenMonsterMovementIsNotBroadcastToPlayers(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [[
                    'id' => 'hidden-monster',
                    'hidden' => true,
                    'column' => 12,
                    'row' => 7,
                ]],
            ],
        ];

        $applied = buildAppliedBoardStateOp([
            'type' => 'placement.move',
            'sceneId' => 'scene-1',
            'placementId' => 'hidden-monster',
            'x' => 12,
            'y' => 7,
        ], $state);
        $safe = sanitizeBoardStateBroadcastOpsForPlayers([$applied], $state);

        $this->assertSame([], $safe);
    }

    public function testVisiblePlacementUpdateBroadcastStaysCompactAndCanonical(): void
    {
        $largeMonster = [
            'name' => 'Large Monster',
            'abilities' => array_fill(0, 80, str_repeat('ability text ', 20)),
        ];
        $before = [
            'placements' => [
                'scene-1' => [[
                    'id' => 'monster-1',
                    'hidden' => false,
                    'hp' => ['current' => '30', 'max' => '30'],
                    'monster' => $largeMonster,
                ]],
            ],
        ];
        $after = $before;
        $after['placements']['scene-1'][0]['hp']['current'] = '20';
        $after['placements']['scene-1'][0]['_lastModified'] = 9001;

        $applied = buildAppliedBoardStateOp([
            'type' => 'placement.update',
            'sceneId' => 'scene-1',
            'placementId' => 'monster-1',
            'patch' => [
                // Deliberately stale input proves the broadcast is sourced
                // from canonical post-write state, not the submitted patch.
                'hp' => ['current' => '999', 'max' => '30'],
            ],
        ], $after, $before);

        $this->assertSame('placement.update', $applied['type']);
        $this->assertSame('monster-1', $applied['placementId']);
        $this->assertSame(
            ['hp' => ['current' => '20', 'max' => '30']],
            $applied['patch']
        );
        $this->assertArrayNotHasKey('placement', $applied);

        $safe = sanitizeBoardStateBroadcastOpsForPlayers([$applied], $after);
        $broadcast = buildPlayerSafeOpsBroadcast($safe, 11, 123456, 'gm', 'gm', 1);
        $this->assertSame('ops', $broadcast['type']);
        $this->assertSame('placement.update', $broadcast['ops'][0]['type']);
        $this->assertLessThan(1000, strlen((string) json_encode($broadcast)));
        $this->assertStringNotContainsString('ability text', (string) json_encode($broadcast));
    }

    public function testPlacementUpdateVisibilityTransitionsUseStructuralBroadcastOps(): void
    {
        $visible = [
            'placements' => [
                'scene-1' => [[
                    'id' => 'monster-1',
                    'hidden' => false,
                    'hp' => ['current' => '20', 'max' => '30'],
                ]],
            ],
        ];
        $hidden = $visible;
        $hidden['placements']['scene-1'][0]['hidden'] = true;

        $hideOp = buildAppliedBoardStateOp([
            'type' => 'placement.update',
            'sceneId' => 'scene-1',
            'placementId' => 'monster-1',
            'patch' => ['hidden' => true],
        ], $hidden, $visible);
        $this->assertSame('placement.remove', $hideOp['type']);
        $this->assertTrue($hideOp['publicVisible']);

        $showOp = buildAppliedBoardStateOp([
            'type' => 'placement.update',
            'sceneId' => 'scene-1',
            'placementId' => 'monster-1',
            'patch' => ['hidden' => false],
        ], $visible, $hidden);
        $this->assertSame('placement.add', $showOp['type']);
        $this->assertSame('monster-1', $showOp['placement']['id']);
    }

    public function testSharedBroadcastOmitsHiddenPlacementsAndMonsterData(): void
    {
        $updates = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'hidden-monster',
                        'hidden' => true,
                        'column' => 9,
                        'row' => 7,
                        'monster' => ['name' => 'Secret'],
                    ],
                    [
                        'id' => 'visible-monster',
                        'hidden' => false,
                        'column' => 2,
                        'row' => 3,
                        'monster' => ['name' => 'Visible Enemy'],
                    ],
                ],
            ],
        ];

        $safe = sanitizeBoardStateBroadcastUpdatesForPlayers($updates);

        $this->assertCount(1, $safe['placements']['scene-1']);
        $this->assertSame('visible-monster', $safe['placements']['scene-1'][0]['id']);
        $this->assertArrayNotHasKey('monster', $safe['placements']['scene-1'][0]);
    }

    public function testSharedBroadcastOmitsHiddenRemovalAndSanitizesCombatIds(): void
    {
        $stateBefore = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hidden-boss', 'hidden' => true],
                    ['id' => 'hero', 'hidden' => false],
                ],
            ],
        ];
        $stateAfter = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero', 'hidden' => false],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => true,
                        'activeCombatantId' => 'hidden-boss',
                        'turnPhase' => 'active',
                    ],
                ],
            ],
        ];

        $hiddenRemove = buildAppliedBoardStateOp([
            'type' => 'placement.remove',
            'sceneId' => 'scene-1',
            'placementId' => 'hidden-boss',
        ], $stateAfter, $stateBefore);
        $safeRemove = sanitizeBoardStateBroadcastOpsForPlayers([$hiddenRemove], $stateAfter);
        $this->assertSame([], $safeRemove);
        $privateOnlyMarker = buildPlayerSafeOpsBroadcast(
            $safeRemove,
            12,
            123456,
            'gm',
            'gm',
            1
        );
        $this->assertSame('ops-overflow', $privateOnlyMarker['type']);
        $this->assertSame(12, $privateOnlyMarker['version']);
        $this->assertTrue($privateOnlyMarker['publicView']);
        $this->assertArrayNotHasKey('ops', $privateOnlyMarker);

        $safeCombat = sanitizeBoardStateBroadcastOpsForPlayers([[
            'type' => 'combat.set',
            'sceneId' => 'scene-1',
            'combat' => $stateAfter['sceneState']['scene-1']['combat'],
        ]], [
            ...$stateAfter,
            'placements' => $stateBefore['placements'],
        ]);
        $this->assertSame('__hidden_enemy__', $safeCombat[0]['combat']['activeCombatantId']);
        $this->assertStringNotContainsString('hidden-boss', json_encode($safeCombat));
    }

    public function testPlayerGetProjectionOmitsHiddenPlacementCoordinates(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hidden-monster', 'hidden' => true, 'column' => 9, 'row' => 7],
                    ['id' => 'visible-hero', 'hidden' => false, 'column' => 1, 'row' => 2],
                ],
            ],
        ];

        $playerView = filterPlacementsForPlayerView($state);

        $this->assertCount(1, $playerView['placements']['scene-1']);
        $this->assertSame('visible-hero', $playerView['placements']['scene-1'][0]['id']);
    }

    public function testPlayerCanDeleteOwnVisibleClaimedPlacement(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero', 'hidden' => false],
                    ['id' => 'other', 'hidden' => false],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'claimedTokens' => [
                        'hero' => 'player one',
                        'other' => 'player two',
                    ],
                ],
            ],
        ];

        $next = applyBoardStateOp($state, [
            'type' => 'placement.remove',
            'sceneId' => 'scene-1',
            'placementId' => 'hero',
        ], ['isGm' => false, 'userId' => 'player one']);

        $this->assertSame(['other'], array_column($next['placements']['scene-1'], 'id'));
        $this->assertArrayNotHasKey('hero', $next['sceneState']['scene-1']['claimedTokens']);
    }

    public function testPlayerCannotDeleteAnotherPlayersOrHiddenPlacement(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'other', 'hidden' => false],
                    ['id' => 'hidden-own', 'hidden' => true],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'claimedTokens' => [
                        'other' => 'player two',
                        'hidden-own' => 'player one',
                    ],
                ],
            ],
        ];

        $otherAttempt = applyBoardStateOp($state, [
            'type' => 'placement.remove',
            'sceneId' => 'scene-1',
            'placementId' => 'other',
        ], ['isGm' => false, 'userId' => 'player one']);
        $hiddenAttempt = applyBoardStateOp($state, [
            'type' => 'placement.remove',
            'sceneId' => 'scene-1',
            'placementId' => 'hidden-own',
        ], ['isGm' => false, 'userId' => 'player one']);

        $this->assertSame($state, $otherAttempt);
        $this->assertSame($state, $hiddenAttempt);
    }

    public function testCombatStartIntentIsServerSequencedAndIdempotent(): void
    {
        $state = [
            'sceneState' => ['scene-1' => ['combat' => ['active' => false, 'sequence' => 8]]],
        ];
        $op = [
            'type' => 'combat.start',
            'sceneId' => 'scene-1',
            'intentId' => 'intent-start-1',
            'combat' => [
                'active' => true,
                'round' => 99,
                'startingTeam' => 'ally',
                'currentTeam' => 'enemy',
                'encounterId' => 'encounter-1',
                'sequence' => 1,
            ],
        ];

        $first = applyCombatIntentOp($state, $op, ['isGm' => true, 'userId' => 'gm']);
        $this->assertTrue($first['accepted']);
        $this->assertTrue($first['applied']);
        $this->assertTrue($first['combat']['active']);
        $this->assertSame(1, $first['combat']['round']);
        $this->assertSame('ally', $first['combat']['currentTeam']);
        $this->assertSame(9, $first['combat']['sequence']);

        $duplicate = applyCombatIntentOp($first['state'], $op, ['isGm' => true, 'userId' => 'gm']);
        $this->assertTrue($duplicate['accepted']);
        $this->assertFalse($duplicate['applied']);
        $this->assertSame('duplicate-intent', $duplicate['reason']);
        $this->assertSame(9, $duplicate['combat']['sequence']);
    }

    public function testSimultaneousTurnStartsAcceptOnlyFirstIntent(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero-one', 'team' => 'ally', 'profileId' => 'player one'],
                    ['id' => 'hero-two', 'team' => 'ally', 'profileId' => 'player two'],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'claimedTokens' => [
                        'hero-one' => 'player one',
                        'hero-two' => 'player two',
                    ],
                    'combat' => [
                        'active' => true,
                        'round' => 1,
                        'currentTeam' => 'ally',
                        'turnPhase' => 'pick',
                        'sequence' => 2,
                    ],
                ],
            ],
        ];

        $first = applyCombatIntentOp($state, [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'turn-one',
            'combatantId' => 'hero-one',
            'holderName' => 'Player One',
        ], ['isGm' => false, 'userId' => 'player one']);
        $this->assertTrue($first['accepted']);
        $this->assertSame('hero-one', $first['combat']['activeCombatantId']);

        $second = applyCombatIntentOp($first['state'], [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'turn-two',
            'combatantId' => 'hero-two',
            'holderName' => 'Player Two',
        ], ['isGm' => false, 'userId' => 'player two']);
        $this->assertFalse($second['accepted']);
        $this->assertFalse($second['applied']);
        $this->assertSame('turn-already-active', $second['reason']);
        $this->assertSame('hero-one', $second['combat']['activeCombatantId']);
    }

    public function testTurnStartEnforcesCurrentSideAndRequiresGmForOverride(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero', 'team' => 'ally', 'profileId' => 'player one'],
                    ['id' => 'enemy', 'team' => 'enemy'],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'claimedTokens' => ['hero' => 'player one'],
                    'combat' => [
                        'active' => true,
                        'round' => 1,
                        'currentTeam' => 'enemy',
                        'turnPhase' => 'pick',
                        'sequence' => 4,
                    ],
                ],
            ],
        ];

        $wrongSide = applyCombatIntentOp($state, [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'wrong-side',
            'combatantId' => 'hero',
        ], ['isGm' => false, 'userId' => 'player one']);
        $this->assertFalse($wrongSide['accepted']);
        $this->assertSame('wrong-side-for-current-pick', $wrongSide['reason']);

        $missingTeamState = $state;
        $missingTeamState['sceneState']['scene-1']['combat']['currentTeam'] = null;
        $missingTeam = applyCombatIntentOp($missingTeamState, [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'missing-current-team',
            'combatantId' => 'hero',
        ], ['isGm' => false, 'userId' => 'player one']);
        $this->assertFalse($missingTeam['accepted']);
        $this->assertSame('wrong-side-for-current-pick', $missingTeam['reason']);

        $playerOverride = applyCombatIntentOp($state, [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'player-override',
            'combatantId' => 'hero',
            'override' => true,
        ], ['isGm' => false, 'userId' => 'player one']);
        $this->assertFalse($playerOverride['accepted']);
        $this->assertSame('gm-override-required', $playerOverride['reason']);

        $correctSide = applyCombatIntentOp($state, [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'correct-side',
            'combatantId' => 'enemy',
        ], ['isGm' => true, 'userId' => 'gm']);
        $this->assertTrue($correctSide['accepted']);
        $this->assertSame('enemy', $correctSide['combat']['activeCombatantId']);

        $gmOverride = applyCombatIntentOp($state, [
            'type' => 'turn.start',
            'sceneId' => 'scene-1',
            'intentId' => 'gm-override',
            'combatantId' => 'hero',
            'override' => true,
        ], ['isGm' => true, 'userId' => 'gm']);
        $this->assertTrue($gmOverride['accepted']);
        $this->assertSame('hero', $gmOverride['combat']['activeCombatantId']);
    }

    public function testCombatStartMakesOneRegisteredEncounterCanonical(): void
    {
        $state = [
            'sceneState' => [
                'scene-new' => ['combat' => ['active' => false, 'sequence' => 2]],
                'scene-old' => [
                    'grid' => ['size' => 70],
                    'combat' => [
                        'active' => true,
                        'round' => 8,
                        'currentTeam' => 'ally',
                        'activeCombatantId' => 'old-hero',
                        'sequence' => 11,
                    ],
                ],
                'deleted-scene' => [
                    'combat' => ['active' => true, 'round' => 99, 'sequence' => 80],
                ],
            ],
        ];

        $result = applyCombatIntentOp($state, [
            'type' => 'combat.start',
            'sceneId' => 'scene-new',
            'intentId' => 'start-new',
            'combat' => [
                'active' => true,
                'startingTeam' => 'enemy',
                'encounterId' => 'enc-new',
            ],
        ], [
            'isGm' => true,
            'userId' => 'gm',
            'registeredSceneIds' => ['scene-new', 'scene-old'],
        ]);

        $this->assertTrue($result['accepted']);
        $this->assertTrue($result['state']['sceneState']['scene-new']['combat']['active']);
        $this->assertFalse($result['state']['sceneState']['scene-old']['combat']['active']);
        $this->assertSame(12, $result['state']['sceneState']['scene-old']['combat']['sequence']);
        $this->assertSame(70, $result['state']['sceneState']['scene-old']['grid']['size']);
        $this->assertTrue($result['state']['sceneState']['deleted-scene']['combat']['active']);
    }

    public function testAcceptedGmCombatSetAlsoDeactivatesOtherRegisteredEncounter(): void
    {
        $state = [
            'sceneState' => [
                'scene-new' => ['combat' => ['active' => false, 'sequence' => 1]],
                'scene-old' => ['combat' => ['active' => true, 'round' => 4, 'sequence' => 7]],
                'deleted-scene' => ['combat' => ['active' => true, 'round' => 20, 'sequence' => 30]],
            ],
        ];

        $result = applyBoardStateOp($state, [
            'type' => 'combat.set',
            'sceneId' => 'scene-new',
            'combat' => [
                'active' => true,
                'round' => 1,
                'currentTeam' => 'ally',
                'encounterId' => 'enc-new',
                'sequence' => 2,
            ],
        ], [
            'isGm' => true,
            'registeredSceneIds' => ['scene-new', 'scene-old'],
        ]);

        $this->assertTrue($result['sceneState']['scene-new']['combat']['active']);
        $this->assertFalse($result['sceneState']['scene-old']['combat']['active']);
        $this->assertTrue($result['sceneState']['deleted-scene']['combat']['active']);
    }

    public function testTurnCompleteRequiresOwnerAndAdvancesSide(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero', 'team' => 'ally'],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'claimedTokens' => ['hero' => 'player one'],
                    'combat' => [
                        'active' => true,
                        'round' => 2,
                        'activeCombatantId' => 'hero',
                        'currentTeam' => 'ally',
                        'turnPhase' => 'active',
                        'roundTurnCount' => 1,
                        'sequence' => 4,
                        'turnLock' => [
                            'holderId' => 'player one',
                            'holderName' => 'Player One',
                            'combatantId' => 'hero',
                            'acquiredAt' => 100,
                        ],
                    ],
                ],
            ],
        ];

        $rejected = applyCombatIntentOp($state, [
            'type' => 'turn.complete',
            'sceneId' => 'scene-1',
            'intentId' => 'complete-wrong-user',
            'combatantId' => 'hero',
        ], ['isGm' => false, 'userId' => 'player two']);
        $this->assertFalse($rejected['accepted']);
        $this->assertSame('not-authorized-for-combatant', $rejected['reason']);

        $accepted = applyCombatIntentOp($state, [
            'type' => 'turn.complete',
            'sceneId' => 'scene-1',
            'intentId' => 'complete-owner',
            'combatantId' => 'hero',
        ], ['isGm' => false, 'userId' => 'player one']);
        $this->assertTrue($accepted['accepted']);
        $this->assertNull($accepted['combat']['activeCombatantId']);
        $this->assertSame(['hero'], $accepted['combat']['completedCombatantIds']);
        $this->assertSame('enemy', $accepted['combat']['currentTeam']);
        $this->assertSame(2, $accepted['combat']['roundTurnCount']);
        $this->assertNull($accepted['combat']['turnLock']);
    }

    public function testRoundAdvanceAndCombatEndAreGmAuthoritative(): void
    {
        $state = [
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => true,
                        'round' => 3,
                        'activeCombatantId' => 'enemy',
                        'completedCombatantIds' => ['hero'],
                        'startingTeam' => 'enemy',
                        'currentTeam' => 'enemy',
                        'turnPhase' => 'active',
                        'roundTurnCount' => 4,
                        'encounterId' => 'encounter-1',
                        'sequence' => 10,
                    ],
                ],
            ],
        ];

        $playerRound = applyCombatIntentOp($state, [
            'type' => 'round.advance',
            'sceneId' => 'scene-1',
            'intentId' => 'round-player',
        ], ['isGm' => false, 'userId' => 'player one']);
        $this->assertFalse($playerRound['accepted']);
        $this->assertSame('gm-required', $playerRound['reason']);

        $round = applyCombatIntentOp($state, [
            'type' => 'round.advance',
            'sceneId' => 'scene-1',
            'intentId' => 'round-gm',
            'combat' => ['malice' => 7],
        ], ['isGm' => true, 'userId' => 'gm']);
        $this->assertTrue($round['accepted']);
        $this->assertSame(4, $round['combat']['round']);
        $this->assertNull($round['combat']['activeCombatantId']);
        $this->assertSame([], $round['combat']['completedCombatantIds']);
        $this->assertSame('enemy', $round['combat']['currentTeam']);
        $this->assertSame(7, $round['combat']['malice']);

        $wrongEncounter = applyCombatIntentOp($round['state'], [
            'type' => 'combat.end',
            'sceneId' => 'scene-1',
            'intentId' => 'end-wrong',
            'encounterId' => 'another-encounter',
        ], ['isGm' => true, 'userId' => 'gm']);
        $this->assertFalse($wrongEncounter['accepted']);
        $this->assertSame('encounter-mismatch', $wrongEncounter['reason']);

        $ended = applyCombatIntentOp($round['state'], [
            'type' => 'combat.end',
            'sceneId' => 'scene-1',
            'intentId' => 'end-right',
            'encounterId' => 'encounter-1',
        ], ['isGm' => true, 'userId' => 'gm']);
        $this->assertTrue($ended['accepted']);
        $this->assertFalse($ended['combat']['active']);
        $this->assertSame(0, $ended['combat']['round']);
        $this->assertSame('idle', $ended['combat']['turnPhase']);
    }

    public function testLegacyPlayerSnapshotCannotChangeTurnAuthorityFields(): void
    {
        $existing = [
            'active' => true,
            'round' => 2,
            'activeCombatantId' => 'hero',
            'currentTeam' => 'ally',
            'turnPhase' => 'active',
            'sequence' => 5,
            'updatedAt' => 1000,
        ];
        $incoming = [
            ...$existing,
            'activeCombatantId' => null,
            'currentTeam' => 'enemy',
            'turnPhase' => 'pick',
            'sequence' => 6,
            'updatedAt' => 2000,
        ];

        $result = mergePlayerCombatAuxiliaryUpdate($existing, $incoming);

        $this->assertFalse($result['accepted']);
        $this->assertFalse($result['applied']);
        $this->assertSame('server-authority-required', $result['reason']);
        $this->assertSame('hero', $result['combat']['activeCombatantId']);
    }

    public function testPlayerCanCancelOnlyTheirOwnActiveTurnByIntent(): void
    {
        $state = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hero', 'team' => 'ally'],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'claimedTokens' => ['hero' => 'player one'],
                    'combat' => [
                        'active' => true,
                        'round' => 1,
                        'activeCombatantId' => 'hero',
                        'currentTeam' => 'ally',
                        'turnPhase' => 'active',
                        'sequence' => 3,
                        'turnLock' => [
                            'holderId' => 'player one',
                            'holderName' => 'Player One',
                            'combatantId' => 'hero',
                            'acquiredAt' => 10,
                        ],
                    ],
                ],
            ],
        ];

        $result = applyCombatIntentOp($state, [
            'type' => 'turn.cancel',
            'sceneId' => 'scene-1',
            'intentId' => 'cancel-owner',
            'combatantId' => 'hero',
        ], ['isGm' => false, 'userId' => 'player one']);

        $this->assertTrue($result['accepted']);
        $this->assertNull($result['combat']['activeCombatantId']);
        $this->assertSame('pick', $result['combat']['turnPhase']);
        $this->assertSame('ally', $result['combat']['currentTeam']);
        $this->assertSame([], $result['combat']['completedCombatantIds']);
    }
}
