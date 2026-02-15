<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    define('VTT_STATE_API_INCLUDE_ONLY', true);
}

require_once __DIR__ . '/../dnd/vtt/api/state.php';

/**
 * Tests that player permission enforcement works correctly.
 *
 * Players should only be able to update: placements, templates, drawings,
 * pings, and combat state. They should NOT be able to modify overlay
 * (fog of war), change active scene, or set map URL directly.
 *
 * These tests exercise sanitizeBoardStateUpdates() to verify what fields
 * are accepted, and the merge logic to verify players can't delete tokens.
 */
final class PlayerPermissionTest extends TestCase
{
    public function testPlacementUpdatesAreAccepted(): void
    {
        $raw = [
            'placements' => [
                'scene-1' => [
                    ['id' => 'token-1', 'column' => 5, 'row' => 3],
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('placements', $updates);
        $this->assertCount(1, $updates['placements']['scene-1']);
    }

    public function testTemplateUpdatesAreAccepted(): void
    {
        $raw = [
            'templates' => [
                'scene-1' => [
                    [
                        'id' => 'template-1',
                        'type' => 'circle',
                        'center' => ['column' => 5, 'row' => 3],
                        'radius' => 4,
                    ],
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('templates', $updates);
    }

    public function testDrawingUpdatesAreAccepted(): void
    {
        $raw = [
            'drawings' => [
                'scene-1' => [
                    [
                        'id' => 'drawing-1',
                        'points' => [
                            ['x' => 1, 'y' => 2],
                            ['x' => 3, 'y' => 4],
                        ],
                    ],
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('drawings', $updates);
    }

    public function testPingUpdatesAreAccepted(): void
    {
        $nowMs = (int) round(microtime(true) * 1000);
        $raw = [
            'pings' => [
                [
                    'id' => 'ping-1',
                    'x' => 0.5,
                    'y' => 0.5,
                    'createdAt' => $nowMs,
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('pings', $updates);
    }

    public function testOverlayUpdatesAreAccepted(): void
    {
        // Note: sanitizeBoardStateUpdates accepts the overlay field at the parsing level.
        // The enforcement that players cannot submit overlay updates happens in the
        // POST handler logic (state.php), not in sanitizeBoardStateUpdates().
        $raw = [
            'overlay' => [
                'mapUrl' => null,
                'mask' => ['visible' => true, 'polygons' => []],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('overlay', $updates);
    }

    public function testPlayerCannotDeleteTokensViaTimestampMerge(): void
    {
        // Players use mergeSceneEntriesByTimestamp which preserves existing entries
        // not in the incoming set (delta merge). This prevents accidental deletion.
        $existing = [
            ['id' => 'token-A', 'column' => 3],
            ['id' => 'token-B', 'column' => 5],
            ['id' => 'token-C', 'column' => 7],
        ];

        // Player only sends token-B (delta update)
        $incoming = [
            ['id' => 'token-B', 'column' => 10, '_lastModified' => 2000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(3, $merged);
        $ids = array_column($merged, 'id');
        $this->assertContains('token-A', $ids);
        $this->assertContains('token-B', $ids);
        $this->assertContains('token-C', $ids);
    }

    public function testPlayerCannotDeleteGmTokensViaPreservingMerge(): void
    {
        // mergeSceneEntriesPreservingGmAuthored removes player entries missing
        // from incoming, but GM entries are ALWAYS preserved.
        $existing = [
            ['id' => 'gm-boss', 'metadata' => ['authorRole' => 'gm']],
            ['id' => 'player-fighter'],
        ];

        // Player sends empty array (trying to clear everything)
        $merged = mergeSceneEntriesPreservingGmAuthored($existing, []);

        $this->assertCount(1, $merged);
        $this->assertSame('gm-boss', $merged[0]['id']);
    }

    public function testEmptyPayloadIsRejected(): void
    {
        $updates = sanitizeBoardStateUpdates([]);

        $this->assertEmpty($updates);
    }

    public function testSceneStateWithCombatUpdatesAreAccepted(): void
    {
        $raw = [
            'sceneState' => [
                'scene-1' => [
                    'combat' => [
                        'active' => true,
                        'round' => 1,
                    ],
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('sceneState', $updates);
    }

    public function testActiveSceneIdIsAcceptedAtParsingLevel(): void
    {
        // sanitizeBoardStateUpdates accepts activeSceneId at the parsing level.
        // The POST handler enforces that players cannot change it.
        $raw = [
            'activeSceneId' => 'scene-2',
        ];

        $updates = sanitizeBoardStateUpdates($raw);

        $this->assertArrayHasKey('activeSceneId', $updates);
        $this->assertSame('scene-2', $updates['activeSceneId']);
    }

    public function testInvalidActiveSceneIdThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);

        sanitizeBoardStateUpdates(['activeSceneId' => 123]);
    }

    public function testInvalidPlacementsTypeThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);

        sanitizeBoardStateUpdates(['placements' => 'not-an-array']);
    }

    public function testNullPlacementsBecomesEmptyArray(): void
    {
        $updates = sanitizeBoardStateUpdates(['placements' => null]);

        $this->assertSame([], $updates['placements']);
    }
}
