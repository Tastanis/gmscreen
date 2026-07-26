<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/bootstrap.php';

/**
 * Tests that hidden tokens are omitted from the player view.
 *
 * Coordinates alone disclose a GM secret, so the server never returns hidden
 * placements to a non-GM client.
 */
final class HiddenPlacementFilterTest extends TestCase
{
    public function testHiddenTruePlacementIsOmitted(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'visible-token', 'name' => 'Fighter', 'column' => 3, 'row' => 5],
                    ['id' => 'hidden-token', 'name' => 'Trap', 'column' => 7, 'row' => 2, 'hidden' => true,
                     'monster' => ['name' => 'Trap', 'hp' => 10], 'monsterId' => 'trap-001'],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $this->assertSame('visible-token', $filtered['placements']['scene-1'][0]['id']);
    }

    public function testIsHiddenAlternateKeyIsRecognized(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hidden-alt', 'name' => 'Secret Door', 'isHidden' => true],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(0, $filtered['placements']['scene-1']);
    }

    public function testFlagsHiddenNestedKeyIsRecognized(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'hidden-flags', 'name' => 'Ambush', 'flags' => ['hidden' => true]],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(0, $filtered['placements']['scene-1']);
    }

    public function testNonHiddenPlacementIsPreserved(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'token-1', 'name' => 'Goblin', 'hidden' => false],
                    ['id' => 'token-2', 'name' => 'Orc'],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(2, $filtered['placements']['scene-1']);
    }

    public function testMixedHiddenAndVisibleInSameScene(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'visible-1', 'name' => 'Fighter'],
                    ['id' => 'hidden-1', 'name' => 'Trap', 'hidden' => true],
                    ['id' => 'visible-2', 'name' => 'Cleric'],
                    ['id' => 'hidden-2', 'name' => 'Assassin', 'isHidden' => true],
                    ['id' => 'visible-3', 'name' => 'Goblin', 'hidden' => false],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $ids = array_column($filtered['placements']['scene-1'], 'id');
        $this->assertSame(['visible-1', 'visible-2', 'visible-3'], $ids);
    }

    public function testStringTrueIsRecognizedAsHidden(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'str-true', 'hidden' => 'true', 'monster' => ['hp' => 5]],
                    ['id' => 'str-1', 'hidden' => '1', 'monster' => ['hp' => 5]],
                    ['id' => 'str-yes', 'hidden' => 'yes', 'monster' => ['hp' => 5]],
                    ['id' => 'str-on', 'hidden' => 'on', 'monster' => ['hp' => 5]],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(0, $filtered['placements']['scene-1']);
    }

    public function testStringFalseIsNotHidden(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'str-false', 'hidden' => 'false'],
                    ['id' => 'str-0', 'hidden' => '0'],
                    ['id' => 'str-no', 'hidden' => 'no'],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(3, $filtered['placements']['scene-1']);
    }

    public function testIntegerOneIsRecognizedAsHidden(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'int-hidden', 'hidden' => 1, 'monster' => ['hp' => 10]],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(0, $filtered['placements']['scene-1']);
    }

    public function testIntegerZeroIsNotHidden(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'int-visible', 'hidden' => 0],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(1, $filtered['placements']['scene-1']);
    }

    public function testMultipleScenesAreFilteredIndependently(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 's1-visible', 'name' => 'Fighter'],
                    ['id' => 's1-hidden', 'name' => 'Trap', 'hidden' => true],
                ],
                'scene-2' => [
                    ['id' => 's2-hidden', 'name' => 'Boss', 'hidden' => true],
                ],
                'scene-3' => [
                    ['id' => 's3-visible', 'name' => 'NPC'],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $this->assertSame('s1-visible', $filtered['placements']['scene-1'][0]['id']);
        $this->assertCount(0, $filtered['placements']['scene-2']);
        $this->assertCount(1, $filtered['placements']['scene-3']);
        $this->assertSame('s3-visible', $filtered['placements']['scene-3'][0]['id']);
    }

    public function testEmptyPlacementsReturnEmpty(): void
    {
        $filtered = filterPlacementsForPlayerView(['placements' => []]);

        $this->assertSame([], $filtered['placements']);
    }

    public function testNonArrayBoardStateReturnsEmpty(): void
    {
        $filtered = filterPlacementsForPlayerView(null);

        $this->assertSame([], $filtered);
    }

    public function testHiddenKeyTakesPrecedenceOverIsHidden(): void
    {
        // When both hidden and isHidden are set, hidden should be checked first
        $boardState = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'conflict', 'hidden' => false, 'isHidden' => true],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        // hidden=false takes precedence, so the token should be visible
        $this->assertCount(1, $filtered['placements']['scene-1']);
    }

    public function testHiddenAllyIsOmitted(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'hidden-ally',
                        'name' => 'Paladin',
                        'combatTeam' => 'ally',
                        'hidden' => true,
                        'monster' => ['name' => 'Paladin', 'hp' => 50],
                        'monsterId' => 'paladin-001',
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $this->assertCount(0, $filtered['placements']['scene-1']);
    }

    public function testPlayerMapDisabledStillFiltersHiddenPlacements(): void
    {
        $filtered = filterPlacementsForPlayerView([
            'playerMapDisabled' => true,
            'playerActiveSceneId' => 'secret-scene',
            'playerMapUrl' => '/secret-map.png',
            'placements' => [
                'secret-scene' => [
                    ['id' => 'hidden-boss', 'hidden' => true, 'column' => 8, 'row' => 9],
                    ['id' => 'visible-hero', 'hidden' => false, 'column' => 1, 'row' => 2],
                ],
            ],
        ]);

        $this->assertNull($filtered['activeSceneId']);
        $this->assertNull($filtered['mapUrl']);
        $this->assertSame(['visible-hero'], array_column(
            $filtered['placements']['secret-scene'],
            'id'
        ));
    }

    public function testCombatProjectionDoesNotExposeHiddenMonsterIdentifiers(): void
    {
        $filtered = filterPlacementsForPlayerView([
            'placements' => [
                'scene-1' => [
                    ['id' => 'hidden-boss-name', 'hidden' => true],
                    ['id' => 'visible-minion', 'hidden' => false],
                    ['id' => 'visible-hero', 'hidden' => false],
                ],
            ],
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => true,
                        'activeCombatantId' => 'hidden-boss-name',
                        'completedCombatantIds' => ['visible-hero', 'hidden-boss-name'],
                        'turnPhase' => 'active',
                        'groups' => [[
                            'representativeId' => 'hidden-boss-name',
                            'memberIds' => ['hidden-boss-name', 'visible-minion'],
                        ]],
                        'turnLock' => [
                            'holderId' => 'gm',
                            'holderName' => 'GM',
                            'combatantId' => 'hidden-boss-name',
                        ],
                        'lastEffect' => [
                            'type' => 'token-float',
                            'placementId' => 'hidden-boss-name',
                        ],
                    ],
                ],
            ],
        ]);

        $combat = $filtered['sceneState']['scene-1']['combat'];
        $this->assertSame('__hidden_enemy__', $combat['activeCombatantId']);
        $this->assertSame(['visible-hero'], $combat['completedCombatantIds']);
        $this->assertSame([], $combat['groups']);
        $this->assertSame('__hidden_enemy__', $combat['turnLock']['combatantId']);
        $this->assertNull($combat['lastEffect']);
        $this->assertStringNotContainsString('hidden-boss-name', json_encode($combat));
    }

    public function testPositionDataPreservedInFilteredResults(): void
    {
        $boardState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'token-1',
                        'name' => 'Fighter',
                        'column' => 5,
                        'row' => 10,
                        'position' => ['x' => 5, 'y' => 10],
                    ],
                ],
            ],
        ];

        $filtered = filterPlacementsForPlayerView($boardState);

        $token = $filtered['placements']['scene-1'][0];
        $this->assertSame(5, $token['column']);
        $this->assertSame(10, $token['row']);
        $this->assertSame(['x' => 5, 'y' => 10], $token['position']);
    }
}
