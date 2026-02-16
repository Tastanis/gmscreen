<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    define('VTT_STATE_API_INCLUDE_ONLY', true);
}

require_once __DIR__ . '/../dnd/vtt/api/state.php';

/**
 * Tests that fog of war revealedCells is always encoded as a JSON object ({})
 * and never as a JSON array ([]).
 *
 * Root cause: PHP's json_encode() turns empty PHP arrays into [] (JSON array)
 * instead of {} (JSON object). JavaScript treats [] as an Array, so setting
 * arr["36,66"] = true creates an "expando property" that JSON.stringify()
 * silently drops (non-numeric keys on arrays are ignored).
 */
final class FogOfWarNormalizationTest extends TestCase
{
    // -----------------------------------------------------------------------
    // normalizeFogOfWarPayload — the core normalizer
    // -----------------------------------------------------------------------

    public function testEmptyRevealedCellsEncodesAsJsonObject(): void
    {
        $result = normalizeFogOfWarPayload([
            'enabled' => true,
            'revealedCells' => [],
        ]);

        $this->assertNotNull($result);
        $json = json_encode($result);
        $this->assertStringContainsString('"revealedCells":{}', $json,
            'Empty revealedCells must encode as {} not []');
    }

    public function testMissingRevealedCellsEncodesAsJsonObject(): void
    {
        $result = normalizeFogOfWarPayload([
            'enabled' => true,
        ]);

        $this->assertNotNull($result);
        $json = json_encode($result);
        $this->assertStringContainsString('"revealedCells":{}', $json,
            'Missing revealedCells must encode as {} not []');
    }

    public function testNullRevealedCellsEncodesAsJsonObject(): void
    {
        $result = normalizeFogOfWarPayload([
            'enabled' => false,
            'revealedCells' => null,
        ]);

        $this->assertNotNull($result);
        $json = json_encode($result);
        $this->assertStringContainsString('"revealedCells":{}', $json,
            'Null revealedCells must encode as {} not []');
    }

    public function testPopulatedRevealedCellsEncodesAsJsonObject(): void
    {
        $result = normalizeFogOfWarPayload([
            'enabled' => true,
            'revealedCells' => ['0,0' => true, '5,10' => true],
        ]);

        $this->assertNotNull($result);
        $json = json_encode($result);
        $this->assertStringNotContainsString('"revealedCells":[]', $json,
            'Populated revealedCells must not encode as []');
        $this->assertStringContainsString('"0,0"', $json);
        $this->assertStringContainsString('"5,10"', $json);
    }

    public function testRevealedCellsIsNeverJsonArray(): void
    {
        // Simulate what happens on a brand-new map: no cells revealed yet
        $result = normalizeFogOfWarPayload([
            'enabled' => true,
            'revealedCells' => [],
        ]);

        $this->assertNotNull($result);

        // The critical check: json_encode must produce {} not []
        $encoded = json_encode($result['revealedCells']);
        $this->assertSame('{}', $encoded,
            'revealedCells must json_encode to "{}" for empty state, got: ' . $encoded);
    }

    public function testRevealedCellsRejectsNumericKeys(): void
    {
        // Numeric keys would come from a JSON array context
        $result = normalizeFogOfWarPayload([
            'enabled' => true,
            'revealedCells' => [0 => true, 1 => true],
        ]);

        $this->assertNotNull($result);
        // Numeric keys should be rejected (is_string check in loop)
        $encoded = json_encode($result['revealedCells']);
        $this->assertSame('{}', $encoded,
            'Numeric keys should be rejected, got: ' . $encoded);
    }

    public function testRevealedCellsValidatesCellKeyFormat(): void
    {
        $result = normalizeFogOfWarPayload([
            'enabled' => true,
            'revealedCells' => [
                '3,5' => true,       // valid
                'abc,1' => true,     // invalid: non-numeric col
                '1,xyz' => true,     // invalid: non-numeric row
                '-1,0' => true,      // invalid: negative col
                '0,-2' => true,      // invalid: negative row
                '1,2,3' => true,     // invalid: too many segments
                '' => true,          // invalid: empty
            ],
        ]);

        $this->assertNotNull($result);
        $this->assertArrayHasKey('3,5', (array) $result['revealedCells']);
        $this->assertCount(1, (array) $result['revealedCells'],
            'Only the valid "3,5" key should survive normalization');
    }

    // -----------------------------------------------------------------------
    // normalizeSceneStatePayload — fog embedded in scene state
    // -----------------------------------------------------------------------

    public function testSceneStateFogOfWarEncodesEmptyRevealedCellsAsObject(): void
    {
        $result = normalizeSceneStatePayload([
            'scene-1' => [
                'grid' => ['size' => 64],
                'fogOfWar' => [
                    'enabled' => true,
                    'revealedCells' => [],
                ],
            ],
        ]);

        $this->assertArrayHasKey('scene-1', $result);
        $json = json_encode($result);
        $this->assertStringContainsString('"revealedCells":{}', $json,
            'Scene-state fogOfWar.revealedCells must encode as {}');
        $this->assertStringNotContainsString('"revealedCells":[]', $json,
            'Scene-state fogOfWar.revealedCells must never be []');
    }

    // -----------------------------------------------------------------------
    // Full round-trip: decode from JSON → normalize → encode back to JSON
    // -----------------------------------------------------------------------

    public function testRoundTripPreservesRevealedCellsAsObject(): void
    {
        // Simulate what PHP would read from a stored JSON file where
        // revealedCells was saved as [] (the original bug)
        $storedJson = '{"enabled":true,"revealedCells":[]}';
        $decoded = json_decode($storedJson, true);

        $normalized = normalizeFogOfWarPayload($decoded);
        $reEncoded = json_encode($normalized);

        $this->assertStringContainsString('"revealedCells":{}', $reEncoded,
            'Round-trip should convert [] to {} — got: ' . $reEncoded);
    }

    public function testRoundTripWithPopulatedCells(): void
    {
        $storedJson = '{"enabled":true,"revealedCells":{"36,66":true,"0,0":true}}';
        $decoded = json_decode($storedJson, true);

        $normalized = normalizeFogOfWarPayload($decoded);
        $reEncoded = json_encode($normalized);

        $this->assertStringContainsString('"36,66":true', $reEncoded);
        $this->assertStringContainsString('"0,0":true', $reEncoded);
    }
}
