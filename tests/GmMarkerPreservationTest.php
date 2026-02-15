<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/api/state_helpers.php';

/**
 * Tests that GM markers are preserved when players update GM-authored entries.
 *
 * When a player moves a GM-placed token, the position should update but
 * critical GM markers (authorRole, hidden, gmAuthored, etc.) must never
 * be overwritten. This prevents players from unhiding tokens or claiming
 * GM authorship.
 */
final class GmMarkerPreservationTest extends TestCase
{
    public function testPlayerMovesGmTokenPositionUpdatesButAuthorRolePreserved(): void
    {
        $existing = [
            'id' => 'gm-goblin',
            'column' => 3,
            'row' => 5,
            'metadata' => ['authorRole' => 'gm'],
        ];

        $incoming = [
            'id' => 'gm-goblin',
            'column' => 8,
            'row' => 12,
            'metadata' => ['authorRole' => 'player'],
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertSame(8, $merged['column']);
        $this->assertSame(12, $merged['row']);
        $this->assertSame('gm', $merged['metadata']['authorRole']);
    }

    public function testPlayerCannotUnhideGmToken(): void
    {
        $existing = [
            'id' => 'hidden-trap',
            'hidden' => true,
            'metadata' => ['authorRole' => 'gm'],
        ];

        $incoming = [
            'id' => 'hidden-trap',
            'hidden' => false,
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertTrue($merged['hidden']);
    }

    public function testPlayerCannotRemoveGmAuthoredFlag(): void
    {
        $existing = [
            'id' => 'gm-entry',
            'flags' => ['gmAuthored' => true, 'hidden' => true],
            'metadata' => ['authorRole' => 'gm'],
        ];

        $incoming = [
            'id' => 'gm-entry',
            'flags' => ['gmAuthored' => false, 'hidden' => false],
            'metadata' => ['authorRole' => 'player'],
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertTrue($merged['flags']['gmAuthored']);
        $this->assertTrue($merged['flags']['hidden']);
        $this->assertSame('gm', $merged['metadata']['authorRole']);
    }

    public function testPlayerCannotCreateNewGmAuthoredEntries(): void
    {
        $existing = [
            ['id' => 'existing-gm', 'metadata' => ['authorRole' => 'gm']],
        ];

        $incoming = [
            ['id' => 'existing-gm', 'column' => 5, 'metadata' => ['authorRole' => 'gm']],
            ['id' => 'fake-gm-new', 'column' => 1, 'metadata' => ['authorRole' => 'gm']],
        ];

        $merged = mergeSceneEntriesPreservingGmAuthored($existing, $incoming);

        $ids = array_column($merged, 'id');
        $this->assertContains('existing-gm', $ids);
        $this->assertNotContains('fake-gm-new', $ids);
    }

    public function testNestedFlagsGmOnlyPreserved(): void
    {
        $existing = [
            'id' => 'gm-npc',
            'flags' => ['gmOnly' => true],
        ];

        $incoming = [
            'id' => 'gm-npc',
            'flags' => ['gmOnly' => false, 'status' => 'active'],
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertTrue($merged['flags']['gmOnly']);
        $this->assertSame('active', $merged['flags']['status']);
    }

    public function testPlayerCanUpdateHpOnGmToken(): void
    {
        $existing = [
            'id' => 'gm-monster',
            'hp' => 20,
            'maxHp' => 20,
            'metadata' => ['authorRole' => 'gm'],
            'flags' => ['gmAuthored' => true],
        ];

        $incoming = [
            'id' => 'gm-monster',
            'hp' => 15,
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertSame(15, $merged['hp']);
        $this->assertSame('gm', $merged['metadata']['authorRole']);
        $this->assertTrue($merged['flags']['gmAuthored']);
    }

    public function testAllGmBooleanMarkersPreserved(): void
    {
        $existing = [
            'id' => 'full-markers',
            'authorIsGm' => true,
            'gm' => true,
            'isGm' => true,
            'gmOnly' => true,
            'gm_only' => true,
            'gmAuthored' => true,
            'gm_authored' => true,
            'hidden' => true,
        ];

        $incoming = [
            'id' => 'full-markers',
            'authorIsGm' => false,
            'gm' => false,
            'isGm' => false,
            'gmOnly' => false,
            'gm_only' => false,
            'gmAuthored' => false,
            'gm_authored' => false,
            'hidden' => false,
            'column' => 5,
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertTrue($merged['authorIsGm']);
        $this->assertTrue($merged['gm']);
        $this->assertTrue($merged['isGm']);
        $this->assertTrue($merged['gmOnly']);
        $this->assertTrue($merged['gm_only']);
        $this->assertTrue($merged['gmAuthored']);
        $this->assertTrue($merged['gm_authored']);
        $this->assertTrue($merged['hidden']);
        $this->assertSame(5, $merged['column']);
    }

    public function testAllGmStringMarkersPreserved(): void
    {
        $existing = [
            'id' => 'string-markers',
            'authorRole' => 'gm',
            'role' => 'gm',
            'createdByRole' => 'gm',
            'source' => 'gm',
            'ownerRole' => 'gm',
        ];

        $incoming = [
            'id' => 'string-markers',
            'authorRole' => 'player',
            'role' => 'player',
            'createdByRole' => 'player',
            'source' => 'player',
            'ownerRole' => 'player',
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertSame('gm', $merged['authorRole']);
        $this->assertSame('gm', $merged['role']);
        $this->assertSame('gm', $merged['createdByRole']);
        $this->assertSame('gm', $merged['source']);
        $this->assertSame('gm', $merged['ownerRole']);
    }

    public function testDeepNestedMetaMarkersPreserved(): void
    {
        $existing = [
            'id' => 'deep-nested',
            'meta' => ['authorIsGm' => true, 'info' => 'secret'],
        ];

        $incoming = [
            'id' => 'deep-nested',
            'meta' => ['authorIsGm' => false, 'info' => 'updated'],
        ];

        $merged = mergeGmAuthoredEntry($existing, $incoming);

        $this->assertTrue($merged['meta']['authorIsGm']);
        $this->assertSame('updated', $merged['meta']['info']);
    }

    public function testGmDetectionWorksWithVariousMarkerFormats(): void
    {
        // metadata.authorRole = 'gm'
        $this->assertTrue(isGmAuthoredBoardEntry([
            'metadata' => ['authorRole' => 'gm'],
        ]));

        // flags.gmAuthored = true
        $this->assertTrue(isGmAuthoredBoardEntry([
            'flags' => ['gmAuthored' => true],
        ]));

        // meta.authorIsGm = 'true' (string)
        $this->assertTrue(isGmAuthoredBoardEntry([
            'meta' => ['authorIsGm' => 'true'],
        ]));

        // flags.gmOnly = 1 (integer)
        $this->assertTrue(isGmAuthoredBoardEntry([
            'flags' => ['gmOnly' => 1],
        ]));

        // Top-level isGm = true
        $this->assertTrue(isGmAuthoredBoardEntry([
            'isGm' => true,
        ]));

        // Not GM authored
        $this->assertFalse(isGmAuthoredBoardEntry([
            'metadata' => ['authorRole' => 'player'],
        ]));

        $this->assertFalse(isGmAuthoredBoardEntry([
            'name' => 'Fighter',
            'column' => 5,
        ]));
    }
}
