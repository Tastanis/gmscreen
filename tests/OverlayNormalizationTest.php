<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    define('VTT_STATE_API_INCLUDE_ONLY', true);
}

require_once __DIR__ . '/../dnd/vtt/api/state.php';

final class OverlayNormalizationTest extends TestCase
{
    public function testLayerMapUrlsAreRetained(): void
    {
        $payload = [
            'layers' => [
                [
                    'id' => 'layer-one',
                    'name' => 'Layer One',
                    'mapUrl' => ' https://example.com/map-one.png ',
                ],
                [
                    'id' => 'layer-two',
                    'mapUrl' => 'https://example.com/map-two.png',
                ],
            ],
        ];

        $normalized = normalizeOverlayPayload($payload);

        $this->assertCount(2, $normalized['layers']);
        $this->assertSame('https://example.com/map-one.png', $normalized['layers'][0]['mapUrl']);
        $this->assertSame('https://example.com/map-two.png', $normalized['layers'][1]['mapUrl']);
    }
}
