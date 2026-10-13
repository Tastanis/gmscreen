<?php
declare(strict_types=1);

/** Server-owned movement receipts; undo never trusts a client-supplied floor. */
final class MovementUndo
{
    private static function position(array $placement): array
    {
        return ['column'=>$placement['column'], 'row'=>$placement['row'],
            '_supportSurfaceId'=>$placement['_supportSurfaceId']??null,
            'flightHeight'=>$placement['flightHeight']??null,
            'levelId'=>$placement['levelId'] ?? FloorGeometry::BASE,
            '_floorTraversal'=>$placement['_floorTraversal'] ?? null];
    }

    /**
     * Whether the token still stands where the newest move on its receipt left it. That, and not "nothing at all
     * has changed on the token", is what keeps a move undoable: a push into a wall, a creature or a fall hurts the
     * token at once as a change of its own, and the move is no less its last move for that. Anything that moves
     * the token writes a new receipt or clears it, and a floor change by hand fails this.
     */
    public static function standsWhereLeft(array $placement): bool
    {
        $history = $placement['_movementUndo']['history'] ?? [];
        $to = is_array($history) && $history ? ($history[array_key_last($history)]['to'] ?? null) : null;
        if (!is_array($to) || !is_numeric($to['column'] ?? null) || !is_numeric($to['row'] ?? null)
            || !is_numeric($placement['column'] ?? null) || !is_numeric($placement['row'] ?? null)) return false;
        return (float) $to['column'] === (float) $placement['column'] && (float) $to['row'] === (float) $placement['row']
            && ($to['levelId'] ?? FloorGeometry::BASE) === ($placement['levelId'] ?? FloorGeometry::BASE);
    }

    public static function record(array $current, array $next, string $actorId, array $mapLevels, ?string $operationId = null, bool $groupMove = false): array
    {
        $old = $current['_movementUndo'] ?? [];
        $history = ($old['actorId'] ?? null) === $actorId && self::standsWhereLeft($current)
            ? ($old['history'] ?? []) : [];
        $history[] = ['from'=>self::position($current), 'to'=>self::position($next),
            'geometry'=>hash('sha256', json_encode($mapLevels)),
            ...($operationId !== null ? ['operationId'=>$operationId] : []),
            ...($groupMove ? ['groupMove'=>true] : [])];
        return ['actorId'=>$actorId, 'revision'=>$next['_entityRevision'], 'history'=>array_slice($history, -20)];
    }

    /** Notes on the newest entry of a receipt which walls that move broke through, so undoing it can mend them. */
    public static function broke(array $receipt, array $wallIds): array
    {
        if ($wallIds && !empty($receipt['history'])) $receipt['history'][array_key_last($receipt['history'])]['broke'] = array_values($wallIds);
        return $receipt;
    }

    /** The walls the move that would be undone next broke through. */
    public static function lastBroke(array $placement): array
    {
        $history = $placement['_movementUndo']['history'] ?? [];
        $broke = $history ? ($history[array_key_last($history)]['broke'] ?? []) : [];
        return is_array($broke) ? array_values(array_filter($broke, 'is_string')) : [];
    }

    public static function restore(array $current, string $actorId, int $receiptRevision, array $mapLevels): array
    {
        $receipt = $current['_movementUndo'] ?? [];
        if (($receipt['actorId'] ?? null) !== $actorId
            || ($receipt['revision'] ?? -1) !== $receiptRevision
            || empty($receipt['history'])
            || !self::standsWhereLeft($current)) {
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
