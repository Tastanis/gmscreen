<?php
declare(strict_types=1);

require_once __DIR__ . '/SyncV2Store.php';

/**
 * A hero's conditions on its token, for the character sheet (October 2026). Brandon: "Idk why you would have a
 * condition that is in your character sheet and not in the vtt or vice versa. So probably merge them."
 *
 * The hero's token is the one on the scene the players see (routing.playerActiveSceneId) first, else the one on the
 * Director's open scene (routing.activeSceneId), else none: off the map, the sheet edits its own list (late October
 * 2026; the page's same order: services/condition-sync-service.js heroSceneOrder). The sheet adds or removes one
 * condition on that token here, and sends the sheet the same change as a delta. The change is an ordinary placement.batch from the signed-in user (SyncV2Store::
 * acceptPlacementBatch), so the rules are the token's own: a player may change a token they can see, never a hidden
 * one. The hero's token is the server's own answer to "which token is this player's" (resolvePcPlacementIdForUser:
 * the hero's one token, or its primary one). The sheet then writes its mirror (handler.php sync-conditions).
 */
final class HeroConditions
{
    public const DURATIONS = ['save-ends', 'end-of-turn', 'end-of-encounter', 'until-dying', 'instantaneous'];

    /** The scenes the hero's token is looked for on, in order: the players' scene, then the Director's open scene. */
    public static function sceneOrder(array $routing): array
    {
        $order = [];
        $players = $routing['playerActiveSceneId'] ?? null;
        if (empty($routing['playerMapDisabled']) && is_string($players) && $players !== '') $order[] = $players;
        $director = $routing['activeSceneId'] ?? null;
        if (is_string($director) && $director !== '' && !in_array($director, $order, true)) $order[] = $director;
        return $order;
    }

    /** The hero's token as this user may see it: [sceneId, placementId, placement] or null (off the map). */
    public static function find(SyncV2Store $store, array $snapshot, string $character, bool $isGm, ?callable $hiddenForPlayer = null): ?array
    {
        $state = is_array($snapshot['state'] ?? null) ? $snapshot['state'] : [];
        foreach (self::sceneOrder(is_array($state['routing'] ?? null) ? $state['routing'] : []) as $sceneId) {
            $placements = is_array($state['placements'][$sceneId] ?? null) ? $state['placements'][$sceneId] : [];
            $placementId = $store->resolvePcPlacementIdForUser($placements, strtolower(trim($character)));
            if ($placementId === null || !is_array($placements[$placementId] ?? null)) continue;
            $placement = $placements[$placementId];
            // The hero's token, hidden from this player: not theirs to change (and not a reason to change another).
            if (!$isGm && $hiddenForPlayer !== null && $hiddenForPlayer($placement, is_array($state['sceneConfig'][$sceneId] ?? null) ? $state['sceneConfig'][$sceneId] : [])) return null;
            return ['sceneId' => $sceneId, 'placementId' => (string) $placementId, 'placement' => $placement];
        }
        return null;
    }

    /** What the sheet is told of a token: where it is, its revision, and its conditions as the sheet keeps them. */
    public static function view(?array $found): array
    {
        if ($found === null) return ['onMap' => false];
        return [
            'onMap' => true,
            'sceneId' => $found['sceneId'],
            'placementId' => $found['placementId'],
            'entityRevision' => max(0, (int) ($found['placement']['_entityRevision'] ?? 0)),
            'conditions' => self::mirror(self::tokenConditions($found['placement'])),
        ];
    }

    /** The token's list, whatever form it is stored in. */
    public static function tokenConditions(array $placement): array
    {
        $raw = $placement['conditions'] ?? ($placement['condition'] ?? []);
        if (!is_array($raw) || ($raw !== [] && !array_is_list($raw))) $raw = [$raw];
        $list = [];
        foreach ($raw as $entry) {
            if (is_string($entry) && trim($entry) !== '') $list[] = ['name' => trim($entry), 'duration' => ['type' => 'save-ends']];
            elseif (is_array($entry) && is_string($entry['name'] ?? null) && trim($entry['name']) !== '') $list[] = $entry;
        }
        return $list;
    }

    public static function durationOf(array $condition): string
    {
        $source = $condition['duration'] ?? ($condition['mode'] ?? ($condition['type'] ?? 'save-ends'));
        $type = is_array($source) ? (string) ($source['type'] ?? $source['value'] ?? $source['mode'] ?? '') : (string) $source;
        $type = strtolower(trim($type));
        if (in_array($type, self::DURATIONS, true)) return $type;
        if ($type === '' || str_contains($type, 'save') || $type === 'se') return 'save-ends';
        if (str_contains($type, 'encounter')) return 'end-of-encounter';
        if (str_contains($type, 'dying')) return 'until-dying';
        if (str_contains($type, 'instant') || $type === 'until-removed') return 'instantaneous';
        if (str_contains($type, 'eot') || str_contains($type, 'end')) return 'end-of-turn';
        return 'save-ends';
    }

    /** Which condition is which between the sheet and the token (name, duration; a rider's amount and type). */
    public static function key(array $condition): string
    {
        $name = trim((string) ($condition['name'] ?? ''));
        $key = strtolower($name) . '|' . self::durationOf($condition);
        if ($name === 'damageWeakness' || $name === 'damageImmunity') {
            $amount = $condition['amount'] ?? '';
            $key .= '|' . ($amount === 'all' ? 'all' : (is_numeric($amount) && (int) $amount > 0 ? (string) (int) $amount : '')) . (($condition['stacks'] ?? false) === true ? '+' : '')
                . '|' . strtolower(trim((string) ($condition['damageType'] ?? '')));
        }
        return $key;
    }

    /** The token's conditions as the sheet keeps them: not the Director's hidden effects; one of each. */
    public static function mirror(array $tokenConditions): array
    {
        $shown = array_values(array_filter($tokenConditions, static fn (array $c): bool => !(!empty($c['hidden']) && ($c['shown'] ?? false) !== true)
            && strcasecmp(trim((string) $c['name']), 'hiddenEffect') !== 0));
        $list = [];
        foreach ($shown as $condition) {
            $entry = ['name' => trim((string) $condition['name']), 'duration' => ['type' => self::durationOf($condition)]];
            foreach (['amount', 'damageType', 'stacks'] as $field) if (array_key_exists($field, $condition) && ($entry['name'] === 'damageWeakness' || $entry['name'] === 'damageImmunity')) $entry[$field] = $condition[$field];
            $list[] = $entry;
        }
        $seen = [];
        $result = [];
        foreach ($list as $entry) {
            $key = self::key($entry);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $result[] = $entry;
            if (count($result) >= 40) break;
        }
        return $result;
    }

    /** One condition as the sheet sends it, checked. */
    public static function readCondition($value): array
    {
        if (!is_array($value) || !is_string($value['name'] ?? null)) throw new InvalidArgumentException('A condition needs a name.');
        $name = trim((string) preg_replace('/\s+/u', ' ', (string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $value['name'])));
        if ($name === '' || preg_match_all('/./us', $name) > 80 || strcasecmp($name, 'hiddenEffect') === 0 || strcasecmp($name, 'Other') === 0) throw new InvalidArgumentException('That is not a condition name.');
        return ['name' => $name, 'duration' => ['type' => self::durationOf($value)]];
    }

    /**
     * Adds a condition to the hero's token or takes one off. Answers the sheet's view of the token afterwards
     * (onMap false: no token on the active scene for this user, nothing changed), and the event to publish.
     */
    public static function change(SyncV2Store $store, string $character, string $op, array $condition, string $operationId, string $actorId, bool $isGm, ?callable $hiddenForPlayer = null): array
    {
        if (!in_array($op, ['add', 'remove'], true)) throw new InvalidArgumentException('Unknown condition change.');
        $condition = self::readCondition($condition);
        $wanted = self::key($condition);
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $snapshot = $store->getSnapshot();
            $found = self::find($store, $snapshot, $character, $isGm, $hiddenForPlayer);
            if ($found === null) return ['view' => ['onMap' => false], 'applied' => false, 'event' => null];
            $current = self::tokenConditions($found['placement']);
            $next = $current;
            if ($op === 'add') {
                foreach ($current as $existing) if (self::key($existing) === $wanted) return ['view' => self::view($found), 'applied' => false, 'event' => null];
                $added = $condition;
                if ($added['duration']['type'] === 'end-of-turn') {
                    // Ends at the end of the hero's own turn, as an EoT added by hand or by an ability names its bearer.
                    $added['duration']['targetTokenId'] = $found['placementId'];
                    $label = trim((string) ($found['placement']['name'] ?? ''));
                    if ($label !== '') $added['duration']['targetTokenName'] = $label;
                }
                $next[] = $added;
            } else {
                $at = null;
                foreach ($current as $index => $existing) {
                    if (!empty($existing['hidden']) && ($existing['shown'] ?? false) !== true) continue;
                    if (self::key($existing) === $wanted) { $at = $index; break; }
                }
                if ($at === null) return ['view' => self::view($found), 'applied' => false, 'event' => null];
                array_splice($next, $at, 1);
            }
            $result = $store->acceptPlacementBatch([
                'type' => 'placement.batch',
                'operationId' => $attempt === 0 ? $operationId : substr($operationId, 0, 120) . '-r' . $attempt,
                'baseRevision' => (int) ($snapshot['revision'] ?? 0),
                'payload' => ['actions' => [[
                    'kind' => 'patch',
                    'sceneId' => $found['sceneId'],
                    'placementId' => $found['placementId'],
                    'entityRevision' => max(0, (int) ($found['placement']['_entityRevision'] ?? 0)),
                    'patch' => ['conditions' => array_values($next), 'condition' => $next[0] ?? null],
                ]]],
            ], $actorId, $isGm);
            if (($result['status'] ?? '') === 'conflict') continue;      // the token changed meanwhile: read it again
            $after = self::find($store, $store->getSnapshot(), $character, $isGm, $hiddenForPlayer);
            return ['view' => self::view($after), 'applied' => empty($result['idempotent']), 'event' => $result['event'] ?? null];
        }
        throw new RuntimeException('The token kept changing; the condition was not changed. Try again.');
    }
}

