<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/bootstrap.php';

/**
 * Tests that hidden tokens are properly sanitized in the player view.
 *
 * The server-side filterPlacementsForPlayerView() keeps hidden placements
 * in the response (so clients can track them by ID for unhide syncing)
 * but strips all monster data.  The client-side rendering code skips
 * hidden placements for non-GM users.
 */
final class HiddenPlacementFilterTest extends TestCase
{
    public function testHiddenTruePlacementIsKeptButSanitized(): void
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

        $this->assertCount(2, $filtered['placements']['scene-1']);
        $this->assertSame('visible-token', $filtered['placements']['scene-1'][0]['id']);
        $this->assertSame('hidden-token', $filtered['placements']['scene-1'][1]['id']);
        $this->assertTrue($filtered['placements']['scene-1'][1]['hidden']);
        // Monster data must be stripped from hidden placements
        $this->assertArrayNotHasKey('monster', $filtered['placements']['scene-1'][1]);
        $this->assertArrayNotHasKey('monsterId', $filtered['placements']['scene-1'][1]);
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

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $this->assertSame('hidden-alt', $filtered['placements']['scene-1'][0]['id']);
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

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $this->assertSame('hidden-flags', $filtered['placements']['scene-1'][0]['id']);
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

        // All placements are kept; hidden ones are sanitized but present
        $ids = array_column($filtered['placements']['scene-1'], 'id');
        $this->assertSame(['visible-1', 'hidden-1', 'visible-2', 'hidden-2', 'visible-3'], $ids);
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

        // All kept but monster data stripped
        $this->assertCount(4, $filtered['placements']['scene-1']);
        foreach ($filtered['placements']['scene-1'] as $token) {
            $this->assertArrayNotHasKey('monster', $token);
        }
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

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $this->assertArrayNotHasKey('monster', $filtered['placements']['scene-1'][0]);
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

        // All placements are kept (hidden ones sanitized)
        $this->assertCount(2, $filtered['placements']['scene-1']);
        $this->assertSame('s1-visible', $filtered['placements']['scene-1'][0]['id']);
        $this->assertSame('s1-hidden', $filtered['placements']['scene-1'][1]['id']);
        $this->assertCount(1, $filtered['placements']['scene-2']);
        $this->assertSame('s2-hidden', $filtered['placements']['scene-2'][0]['id']);
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

    public function testHiddenAllyHasMonsterDataStripped(): void
    {
        // Even ally tokens have monster data stripped when hidden
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

        $this->assertCount(1, $filtered['placements']['scene-1']);
        $token = $filtered['placements']['scene-1'][0];
        $this->assertSame('hidden-ally', $token['id']);
        $this->assertArrayNotHasKey('monster', $token);
        $this->assertArrayNotHasKey('monsterId', $token);
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
