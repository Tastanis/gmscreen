<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/api/state_helpers.php';

final class StateHelpersTest extends TestCase
{
    public function testMergeSceneEntriesPreservesGmEntries(): void
    {
        $existing = [
            [
                'id' => 'gm-1',
                'name' => 'Goblin',
                'metadata' => ['authorRole' => 'gm'],
            ],
            [
                'id' => 'player-1',
                'name' => 'Fighter',
            ],
        ];

        $incoming = [
            [
                'id' => 'player-1',
                'name' => 'Fighter',
                'column' => 5,
            ],
        ];

        $merged = mergeSceneEntriesPreservingGmAuthored($existing, $incoming);

        $this->assertCount(2, $merged);
        $this->assertSame('gm-1', $merged[0]['id']);
        $this->assertSame('Goblin', $merged[0]['name']);
        $this->assertSame('player-1', $merged[1]['id']);
        $this->assertSame(5, $merged[1]['column']);
    }

    public function testMergeSceneEntriesAllowsPlayersToUpdateGmEntries(): void
    {
        $existing = [
            [
                'id' => 'gm-2',
                'column' => 3,
                'metadata' => ['authorRole' => 'gm'],
                'flags' => ['gmAuthored' => true, 'hidden' => true],
                'position' => ['x' => 1, 'y' => 2],
                'hp' => 15,
            ],
        ];

        $incoming = [
            [
                'id' => 'gm-2',
                'column' => 5,
                'metadata' => ['authorRole' => 'player'],
                'flags' => ['gmAuthored' => false, 'hidden' => false, 'status' => 'spotted'],
                'position' => ['x' => 9, 'y' => 4],
                'hp' => 11,
            ],
        ];

        $merged = mergeSceneEntriesPreservingGmAuthored($existing, $incoming);

        $this->assertCount(1, $merged);
        $gmEntry = $merged[0];

        $this->assertSame(5, $gmEntry['column']);
        $this->assertSame(['x' => 9, 'y' => 4], $gmEntry['position']);
        $this->assertSame(11, $gmEntry['hp']);

        // GM markers should be preserved from the original entry.
        $this->assertSame('gm', $gmEntry['metadata']['authorRole']);
        $this->assertTrue($gmEntry['flags']['gmAuthored']);
        $this->assertTrue($gmEntry['flags']['hidden']);
        $this->assertSame('spotted', $gmEntry['flags']['status']);
    }

    public function testMergeSceneEntriesRejectsNewGmEntriesFromPlayers(): void
    {
        $existing = [
            [
                'id' => 'gm-3',
                'column' => 3,
                'metadata' => ['authorRole' => 'gm'],
            ],
        ];

        $incoming = [
            [
                'id' => 'player-2',
                'column' => 7,
            ],
            [
                'id' => 'gm-new',
                'column' => 1,
                'metadata' => ['authorRole' => 'gm'],
            ],
        ];

        $merged = mergeSceneEntriesPreservingGmAuthored($existing, $incoming);

        $this->assertCount(2, $merged);
        $this->assertSame('gm-3', $merged[0]['id']);
        $this->assertSame(3, $merged[0]['column']);
        $this->assertSame('player-2', $merged[1]['id']);
        $this->assertSame(7, $merged[1]['column']);
    }

    public function testMergeSceneEntriesRemovesMissingPlayerData(): void
    {
        $existing = [
            [
                'id' => 'gm-3',
                'metadata' => ['authorRole' => 'gm'],
            ],
            [
                'id' => 'player-3',
            ],
        ];

        $merged = mergeSceneEntriesPreservingGmAuthored($existing, []);

        $this->assertCount(1, $merged);
        $this->assertSame('gm-3', $merged[0]['id']);
    }

    public function testIsGmAuthoredBoardEntryDetectsMarkers(): void
    {
        $this->assertTrue(
            isGmAuthoredBoardEntry([
                'metadata' => ['authorRole' => 'gm'],
            ])
        );

        $this->assertTrue(
            isGmAuthoredBoardEntry([
                'meta' => ['authorIsGm' => 'true'],
            ])
        );

        $this->assertTrue(
            isGmAuthoredBoardEntry([
                'flags' => ['gmOnly' => 1],
            ])
        );

        $this->assertFalse(
            isGmAuthoredBoardEntry([
                'metadata' => ['authorRole' => 'player'],
            ])
        );
    }
}
