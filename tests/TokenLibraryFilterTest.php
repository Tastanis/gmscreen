<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/bootstrap.php';

/**
 * Tests that the token library is properly filtered for player view.
 *
 * Players should only see tokens in the "PC's" folder. All other folders
 * (containing GM monsters, NPCs, etc.) should be hidden from the player's
 * token library view. Monster data should also be stripped from visible tokens.
 */
final class TokenLibraryFilterTest extends TestCase
{
    public function testOnlyPcsFolderTokensAreVisibleToPlayers(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "PC's"],
                ['id' => 'folder-monsters', 'name' => 'Monsters'],
                ['id' => 'folder-npcs', 'name' => 'NPCs'],
            ],
            'items' => [
                ['id' => 'fighter', 'name' => 'Fighter', 'folderId' => 'folder-pcs'],
                ['id' => 'goblin', 'name' => 'Goblin', 'folderId' => 'folder-monsters'],
                ['id' => 'merchant', 'name' => 'Merchant', 'folderId' => 'folder-npcs'],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $this->assertCount(1, $filtered['folders']);
        $this->assertSame("PC's", $filtered['folders'][0]['name']);
        $this->assertCount(1, $filtered['items']);
        $this->assertSame('fighter', $filtered['items'][0]['id']);
    }

    public function testGmTokensInOtherFoldersNotVisible(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "PC's"],
                ['id' => 'folder-gm', 'name' => 'GM Secrets'],
            ],
            'items' => [
                ['id' => 'rogue', 'name' => 'Rogue', 'folderId' => 'folder-pcs'],
                ['id' => 'boss', 'name' => 'Final Boss', 'folderId' => 'folder-gm'],
                ['id' => 'trap', 'name' => 'Trap Token', 'folderId' => 'folder-gm'],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $ids = array_column($filtered['items'], 'id');
        $this->assertContains('rogue', $ids);
        $this->assertNotContains('boss', $ids);
        $this->assertNotContains('trap', $ids);
    }

    public function testFolderMatchingIsCaseInsensitive(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "pc's"],
            ],
            'items' => [
                ['id' => 'wizard', 'name' => 'Wizard', 'folderId' => 'folder-pcs'],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $this->assertCount(1, $filtered['items']);
        $this->assertSame('wizard', $filtered['items'][0]['id']);
    }

    public function testFolderMatchingIgnoresSpecialChars(): void
    {
        // normalizeTokenFolderKey strips non-alphanumeric chars
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "PC's"],
            ],
            'items' => [
                ['id' => 'paladin', 'name' => 'Paladin', 'folderId' => 'folder-pcs'],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $this->assertCount(1, $filtered['items']);
    }

    public function testMonsterDataStrippedFromVisibleTokens(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "PC's"],
            ],
            'items' => [
                [
                    'id' => 'fighter',
                    'name' => 'Fighter',
                    'folderId' => 'folder-pcs',
                    'monster' => ['name' => 'Fighter', 'hp' => 45],
                    'monsterId' => 'fighter-001',
                ],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $token = $filtered['items'][0];
        $this->assertArrayNotHasKey('monster', $token);
        $this->assertArrayNotHasKey('monsterId', $token);
        $this->assertSame('Fighter', $token['name']);
    }

    public function testMetadataMonsterStrippedFromVisibleTokens(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "PC's"],
            ],
            'items' => [
                [
                    'id' => 'cleric',
                    'name' => 'Cleric',
                    'folderId' => 'folder-pcs',
                    'metadata' => [
                        'monster' => ['name' => 'Cleric', 'hp' => 30],
                        'monsterId' => 'cleric-001',
                        'portrait' => 'cleric.png',
                    ],
                ],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $token = $filtered['items'][0];
        if (isset($token['metadata'])) {
            $this->assertArrayNotHasKey('monster', $token['metadata']);
            $this->assertArrayNotHasKey('monsterId', $token['metadata']);
        }
    }

    public function testEmptyTokenLibraryReturnsEmpty(): void
    {
        $filtered = filterTokensForPlayerView(['folders' => [], 'items' => []]);

        $this->assertSame([], $filtered['folders']);
        $this->assertSame([], $filtered['items']);
    }

    public function testNoMatchingFolderReturnsEmpty(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-monsters', 'name' => 'Monsters'],
            ],
            'items' => [
                ['id' => 'goblin', 'name' => 'Goblin', 'folderId' => 'folder-monsters'],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $this->assertEmpty($filtered['items']);
    }

    public function testTokenWithFolderMetadataFallback(): void
    {
        // Some tokens use embedded folder metadata instead of folderId
        $tokens = [
            'folders' => [],
            'items' => [
                [
                    'id' => 'ranger',
                    'name' => 'Ranger',
                    'folderId' => 'folder-pcs',
                    'folder' => ['name' => "PC's"],
                ],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $this->assertCount(1, $filtered['items']);
        $this->assertSame('ranger', $filtered['items'][0]['id']);
    }

    public function testMultipleTokensInPcFolder(): void
    {
        $tokens = [
            'folders' => [
                ['id' => 'folder-pcs', 'name' => "PC's"],
            ],
            'items' => [
                ['id' => 'fighter', 'name' => 'Fighter', 'folderId' => 'folder-pcs'],
                ['id' => 'wizard', 'name' => 'Wizard', 'folderId' => 'folder-pcs'],
                ['id' => 'rogue', 'name' => 'Rogue', 'folderId' => 'folder-pcs'],
                ['id' => 'cleric', 'name' => 'Cleric', 'folderId' => 'folder-pcs'],
            ],
        ];

        $filtered = filterTokensForPlayerView($tokens);

        $this->assertCount(4, $filtered['items']);
    }
}
