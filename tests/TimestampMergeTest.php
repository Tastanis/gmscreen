<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/api/state_helpers.php';

/**
 * Tests the timestamp-based delta merge used for token movement sync.
 *
 * mergeSceneEntriesByTimestamp() is the core conflict resolution mechanism.
 * When two clients move the same token simultaneously, the one with the
 * newer _lastModified timestamp wins. Existing entries not in the incoming
 * set are preserved (delta merge, not full replacement).
 */
final class TimestampMergeTest extends TestCase
{
    public function testNewerIncomingEntryReplacesOlderExisting(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3, 'row' => 5, '_lastModified' => 1000],
        ];

        $incoming = [
            ['id' => 'token-1', 'column' => 8, 'row' => 12, '_lastModified' => 2000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(1, $merged);
        $this->assertSame(8, $merged[0]['column']);
        $this->assertSame(12, $merged[0]['row']);
        $this->assertSame(2000, $merged[0]['_lastModified']);
    }

    public function testOlderIncomingEntryDoesNotReplaceNewerExisting(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 8, 'row' => 12, '_lastModified' => 2000],
        ];

        $incoming = [
            ['id' => 'token-1', 'column' => 3, 'row' => 5, '_lastModified' => 1000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(1, $merged);
        $this->assertSame(8, $merged[0]['column']);
        $this->assertSame(12, $merged[0]['row']);
        $this->assertSame(2000, $merged[0]['_lastModified']);
    }

    public function testEqualTimestampsUseIncoming(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3, '_lastModified' => 1000],
        ];

        $incoming = [
            ['id' => 'token-1', 'column' => 8, '_lastModified' => 1000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(1, $merged);
        $this->assertSame(8, $merged[0]['column']);
    }

    public function testNewEntryNotInExistingIsAdded(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3],
        ];

        $incoming = [
            ['id' => 'token-2', 'column' => 7, '_lastModified' => 1000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(2, $merged);
        $ids = array_column($merged, 'id');
        $this->assertContains('token-1', $ids);
        $this->assertContains('token-2', $ids);
    }

    public function testExistingEntriesNotInIncomingArePreserved(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3],
            ['id' => 'token-2', 'column' => 5],
            ['id' => 'token-3', 'column' => 9],
        ];

        // Only token-2 is in the delta update
        $incoming = [
            ['id' => 'token-2', 'column' => 10, '_lastModified' => 1000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(3, $merged);
        $byId = [];
        foreach ($merged as $entry) {
            $byId[$entry['id']] = $entry;
        }

        $this->assertSame(3, $byId['token-1']['column']); // preserved
        $this->assertSame(10, $byId['token-2']['column']); // updated
        $this->assertSame(9, $byId['token-3']['column']); // preserved
    }

    public function testEntriesWithNoTimestampDefaultToZero(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3],
        ];

        $incoming = [
            ['id' => 'token-1', 'column' => 8],
        ];

        // Both have no timestamp (default 0), so incoming wins (>= comparison)
        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(1, $merged);
        $this->assertSame(8, $merged[0]['column']);
    }

    public function testMultipleSimultaneousUpdates(): void
    {
        $existing = [
            ['id' => 'token-A', 'column' => 1, '_lastModified' => 1000],
            ['id' => 'token-B', 'column' => 2, '_lastModified' => 1000],
            ['id' => 'token-C', 'column' => 3, '_lastModified' => 3000],
        ];

        $incoming = [
            ['id' => 'token-A', 'column' => 10, '_lastModified' => 2000], // newer, wins
            ['id' => 'token-B', 'column' => 20, '_lastModified' => 500],  // older, loses
            ['id' => 'token-C', 'column' => 30, '_lastModified' => 2000], // older, loses
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $byId = [];
        foreach ($merged as $entry) {
            $byId[$entry['id']] = $entry;
        }

        $this->assertSame(10, $byId['token-A']['column']); // updated
        $this->assertSame(2, $byId['token-B']['column']);   // kept existing
        $this->assertSame(3, $byId['token-C']['column']);   // kept existing
    }

    public function testGmMarkerPreservedDuringTimestampMerge(): void
    {
        $existing = [
            [
                'id' => 'gm-token',
                'column' => 3,
                'metadata' => ['authorRole' => 'gm'],
                'flags' => ['gmAuthored' => true, 'hidden' => true],
                '_lastModified' => 1000,
            ],
        ];

        $incoming = [
            [
                'id' => 'gm-token',
                'column' => 8,
                'metadata' => ['authorRole' => 'player'],
                'flags' => ['gmAuthored' => false, 'hidden' => false],
                '_lastModified' => 2000,
            ],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertCount(1, $merged);
        $token = $merged[0];
        // Position should be updated
        $this->assertSame(8, $token['column']);
        // GM markers should be preserved
        $this->assertSame('gm', $token['metadata']['authorRole']);
        $this->assertTrue($token['flags']['gmAuthored']);
        $this->assertTrue($token['flags']['hidden']);
    }

    public function testEmptyExistingWithIncomingAddsAll(): void
    {
        $incoming = [
            ['id' => 'token-1', 'column' => 3],
            ['id' => 'token-2', 'column' => 7],
        ];

        $merged = mergeSceneEntriesByTimestamp([], $incoming);

        $this->assertCount(2, $merged);
    }

    public function testEmptyIncomingPreservesAllExisting(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3],
            ['id' => 'token-2', 'column' => 7],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, []);

        $this->assertCount(2, $merged);
    }

    public function testAlternateTimestampKeysAreRecognized(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3, 'lastModified' => 1000],
        ];

        $incoming = [
            ['id' => 'token-1', 'column' => 8, 'lastModified' => 2000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertSame(8, $merged[0]['column']);
    }

    public function testUpdatedAtTimestampKeyIsRecognized(): void
    {
        $existing = [
            ['id' => 'token-1', 'column' => 3, 'updatedAt' => 1000],
        ];

        $incoming = [
            ['id' => 'token-1', 'column' => 8, 'updatedAt' => 2000],
        ];

        $merged = mergeSceneEntriesByTimestamp($existing, $incoming);

        $this->assertSame(8, $merged[0]['column']);
    }
}
