<?php
declare(strict_types=1);

/** Server-owned movement receipts; undo never trusts a client-supplied floor. */
final class MovementUndo
{
    private static function position(array $placement): array
    {
        return ['column'=>$placement['column'], 'row'=>$placement['row'],
            'levelId'=>$placement['levelId'] ?? FloorGeometry::BASE,
            '_floorTraversal'=>$placement['_floorTraversal'] ?? null];
    }

    public static function record(array $current, array $next, string $actorId, array $mapLevels): array
    {
        $old = $current['_movementUndo'] ?? [];
        $history = ($old['actorId'] ?? null) === $actorId
            && ($old['revision'] ?? -1) === ($current['_entityRevision'] ?? 0)
            ? ($old['history'] ?? []) : [];
        $history[] = ['from'=>self::position($current), 'to'=>self::position($next),
            'geometry'=>hash('sha256', json_encode($mapLevels))];
        return ['actorId'=>$actorId, 'revision'=>$next['_entityRevision'], 'history'=>array_slice($history, -20)];
    }

    public static function restore(array $current, string $actorId, int $receiptRevision, array $mapLevels): array
    {
        $receipt = $current['_movementUndo'] ?? [];
        if (($receipt['actorId'] ?? null) !== $actorId
            || ($receipt['revision'] ?? -1) !== ($current['_entityRevision'] ?? 0)
            || ($receipt['revision'] ?? -1) !== $receiptRevision
            || empty($receipt['history'])) {
            throw new InvalidArgumentException('This movement can no longer be undone: the token changed or another user moved it.');
        }
        $entry = array_pop($receipt['history']);
        if (($entry['geometry'] ?? '') !== hash('sha256', json_encode($mapLevels))) {
            throw new InvalidArgumentException('The floors changed after this move. Ask the GM to restore the position.');
        }
        $receipt['revision'] = $current['_entityRevision'] + 1;
        return [...$entry['from'], '_movementUndo'=>$receipt];
    }
}
