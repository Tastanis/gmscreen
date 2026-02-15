<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/bootstrap.php';

/**
 * Tests that monster stats are properly stripped from placements in the player view.
 *
 * Enemy tokens should never leak monster/monsterId to players.
 * Ally tokens should retain monster data so players can see their own character stats.
 */
final class MonsterStatSanitizationTest extends TestCase
{
    public function testEnemyPlacementHasMonsterStripped(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'enemy-1',
                        'name' => 'Goblin',
                        'combatTeam' => 'enemy',
                        'monster' => ['name' => 'Goblin', 'hp' => 7, 'ac' => 15],
                        'monsterId' => 'goblin-001',
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $token = $filtered['placements']['scene-1'][0];
        $this->assertArrayNotHasKey('monster', $token);
        $this->assertArrayNotHasKey('monsterId', $token);
        $this->assertSame('enemy-1', $token['id']);
        $this->assertSame('Goblin', $token['name']);
    }

    public function testAllyPlacementKeepsMonsterData(): void
    {
        $monsterData = ['name' => 'Fighter', 'hp' => 45, 'ac' => 18];

        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'ally-1',
                        'name' => 'Fighter',
                        'combatTeam' => 'ally',
                        'monster' => $monsterData,
                        'monsterId' => 'fighter-001',
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $token = $filtered['placements']['scene-1'][0];
        $this->assertSame($monsterData, $token['monster']);
        $this->assertSame('fighter-001', $token['monsterId']);
    }

    public function testPlacementWithNoCombatTeamHasMonsterStripped(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'no-team',
                        'name' => 'Unknown',
                        'monster' => ['name' => 'Mystery', 'hp' => 20],
                        'monsterId' => 'mystery-001',
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $token = $filtered['placements']['scene-1'][0];
        $this->assertArrayNotHasKey('monster', $token);
        $this->assertArrayNotHasKey('monsterId', $token);
    }

    public function testNestedMetadataMonsterStrippedForEnemy(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'enemy-meta',
                        'name' => 'Dragon',
                        'combatTeam' => 'enemy',
                        'metadata' => [
                            'monster' => ['name' => 'Dragon', 'hp' => 200],
                            'monsterId' => 'dragon-001',
                            'someOtherData' => 'keep-this',
                        ],
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $token = $filtered['placements']['scene-1'][0];
        $this->assertArrayNotHasKey('monster', $token);
        $this->assertArrayNotHasKey('monsterId', $token);
        // Metadata should still exist if other keys remain
        if (isset($token['metadata'])) {
            $this->assertArrayNotHasKey('monster', $token['metadata']);
            $this->assertArrayNotHasKey('monsterId', $token['metadata']);
        }
    }

    public function testTeamKeyAlternateNameIsRecognized(): void
    {
        // Some data uses 'team' instead of 'combatTeam'
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'alt-team-ally',
                        'name' => 'Paladin',
                        'team' => 'ally',
                        'monster' => ['name' => 'Paladin', 'hp' => 50],
                    ],
                    [
                        'id' => 'alt-team-enemy',
                        'name' => 'Lich',
                        'team' => 'enemy',
                        'monster' => ['name' => 'Lich', 'hp' => 135],
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $tokens = $filtered['placements']['scene-1'];
        $ally = null;
        $enemy = null;
        foreach ($tokens as $t) {
            if ($t['id'] === 'alt-team-ally') {
                $ally = $t;
            }
            if ($t['id'] === 'alt-team-enemy') {
                $enemy = $t;
            }
        }

        $this->assertNotNull($ally);
        $this->assertArrayHasKey('monster', $ally);
        $this->assertNotNull($enemy);
        $this->assertArrayNotHasKey('monster', $enemy);
    }

    public function testCombatTeamIsCaseInsensitive(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'upper-ally',
                        'name' => 'Ranger',
                        'combatTeam' => 'Ally',
                        'monster' => ['name' => 'Ranger', 'hp' => 35],
                    ],
                    [
                        'id' => 'upper-enemy',
                        'name' => 'Ogre',
                        'combatTeam' => 'ENEMY',
                        'monster' => ['name' => 'Ogre', 'hp' => 59],
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $tokens = $filtered['placements']['scene-1'];
        $ally = null;
        $enemy = null;
        foreach ($tokens as $t) {
            if ($t['id'] === 'upper-ally') {
                $ally = $t;
            }
            if ($t['id'] === 'upper-enemy') {
                $enemy = $t;
            }
        }

        $this->assertNotNull($ally);
        $this->assertArrayHasKey('monster', $ally);
        $this->assertNotNull($enemy);
        $this->assertArrayNotHasKey('monster', $enemy);
    }

    public function testHiddenEnemyWithMonsterIsFullyStripped(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'hidden-enemy',
                        'name' => 'Boss',
                        'combatTeam' => 'enemy',
                        'hidden' => true,
                        'monster' => ['name' => 'Boss', 'hp' => 300],
                        'monsterId' => 'boss-001',
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        // The entire placement should be gone (hidden), so monster data cannot leak
        $this->assertCount(0, $filtered['placements']['scene-1']);
    }

    public function testVisibleEnemyWithoutMonsterDataIsPreserved(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'simple-enemy',
                        'name' => 'Bandit',
                        'combatTeam' => 'enemy',
                        'column' => 4,
                        'row' => 8,
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $token = $filtered['placements']['scene-1'][0];
        $this->assertSame('simple-enemy', $token['id']);
        $this->assertSame(4, $token['column']);
        $this->assertSame(8, $token['row']);
    }
}
