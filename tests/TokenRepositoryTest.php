<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class TokenRepositoryTest extends TestCase
{
    public function testNormalizeSceneTokenEntriesStripsInvalidImageData(): void
    {
        $validImage = 'data:image/png;base64,' . base64_encode('valid-image');
        $entries = [
            [
                'id' => 'valid-token',
                'libraryId' => 'library-1',
                'name' => 'Valid Token',
                'imageData' => $validImage,
                'size' => ['width' => 2, 'height' => 2],
                'position' => ['x' => 1, 'y' => 1],
                'stamina' => 3,
            ],
            [
                'id' => 'invalid-token',
                'libraryId' => 'library-2',
                'name' => 'Invalid Token',
                'imageData' => "data:image/png;base64,%\xFF",
            ],
        ];

        $normalized = normalizeSceneTokenEntries($entries);

        $this->assertCount(1, $normalized);
        $this->assertSame('valid-token', $normalized[0]['id']);
        $this->assertSame($validImage, $normalized[0]['imageData']);

        $json = json_encode($normalized);
        $this->assertIsString($json);
        $this->assertNotFalse($json);
    }

    public function testNormalizeTokenLibraryEntriesStripsInvalidImageData(): void
    {
        $validImage = 'data:image/png;base64,' . base64_encode('library-image');
        $entries = [
            [
                'id' => 'token-1',
                'name' => 'Valid Library Token',
                'imageData' => $validImage,
                'folderId' => 'pcs',
            ],
            [
                'id' => 'token-2',
                'name' => 'Invalid Library Token',
                'imageData' => "invalid\x00binary",
            ],
        ];

        $normalized = normalizeTokenLibraryEntries($entries);

        $this->assertCount(1, $normalized);
        $this->assertSame('token-1', $normalized[0]['id']);
        $this->assertSame($validImage, $normalized[0]['imageData']);

        $json = json_encode(['tokens' => $normalized]);
        $this->assertIsString($json);
        $this->assertNotFalse($json);
    }
}
