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

    public function testMergeSceneEntriesSkipsIncomingGmEntries(): void
    {
        $existing = [
            [
                'id' => 'gm-2',
                'column' => 3,
                'metadata' => ['authorRole' => 'gm'],
            ],
        ];

        $incoming = [
            [
                'id' => 'gm-2',
                'column' => 99,
                'metadata' => ['authorRole' => 'gm'],
            ],
            [
                'id' => 'player-2',
                'column' => 7,
            ],
        ];

        $merged = mergeSceneEntriesPreservingGmAuthored($existing, $incoming);

        $this->assertCount(2, $merged);
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
