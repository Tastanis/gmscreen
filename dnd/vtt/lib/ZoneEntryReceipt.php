<?php
declare(strict_types=1);

/** Immutable evidence captured by movement authority, never accepted from clients. */
final class ZoneEntryReceipt
{
    public static function boundary(array $combat): string
    {
        $encounter = is_string($combat['encounterId'] ?? null) ? $combat['encounterId'] : '';
        return json_encode([$encounter, !empty($combat['active']) ? max(1, (int) ($combat['round'] ?? 1)) : 0], JSON_THROW_ON_ERROR);
    }

    public static function create(string $sceneId, string $placementId, array $from, array $to, array $combat): array
    {
        return ['sceneId'=>$sceneId, 'placementId'=>$placementId,
            'boundary'=>self::boundary($combat), 'from'=>self::footprint($from), 'to'=>self::footprint($to)];
    }

    private static function footprint(array $placement): array
    {
        return ['column'=>(float) ($placement['column'] ?? 0), 'row'=>(float) ($placement['row'] ?? 0),
            'width'=>max(1.0, (float) ($placement['width'] ?? 1)), 'height'=>max(1.0, (float) ($placement['height'] ?? 1)),
            'levelId'=>is_string($placement['levelId'] ?? null) && trim($placement['levelId']) !== ''
                ? trim($placement['levelId']) : 'level-0'];
    }
}
