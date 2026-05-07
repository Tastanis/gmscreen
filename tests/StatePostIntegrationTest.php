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
}
