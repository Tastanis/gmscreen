<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';

/**
 * What stands in a creature's own square: a pillar, a crate, a crystal, any wall that runs through
 * the square instead of along its edge. Pure; reads the scene and changes nothing.
 *
 * A creature whose square is crossed by a standing wall cannot walk out of it, because every step
 * starts already against that wall. So a fall must not leave a creature there: it breaks the
 * thing it lands on if that can be broken (FallOutcome::landing), and lands beside it if not.
 */
final class WallObjects
{
    /** A wall along the edge of the square is beside the creature, not under it. */
    private const INSET = 1e-4;

    /**
     * The standing walls that cross the inside of the creature's square at the height of its body.
     * One-way walls (cliff edges) and anything open or broken are not in the way.
     *
     * @return list<array> wall segments, as stored
     */
    public static function under(array $placement, array $config): array
    {
        $model = $config['environment']['walls']['value'] ?? [];
        if (empty($model['segments'])) return [];
        $w = max(1, (float) ($placement['width'] ?? 1)); $h = max(1, (float) ($placement['height'] ?? 1));
        $left = $placement['column'] + self::INSET; $right = $placement['column'] + $w - self::INSET;
        $top = $placement['row'] + self::INSET; $bottom = $placement['row'] + $h - self::INSET;
        $nodes = array_column($model['nodes'] ?? [], null, 'id'); $z = null; $found = []; $objects = [];
        foreach ($model['segments'] as $edge) {
            $e = [...['movement'=>'block','movementDirection'=>'both','interaction'=>'none','open'=>false,'baseMode'=>'terrain','base'=>0,'height'=>2,'topMode'=>'follow'], ...$edge];
            if ($e['movement'] === 'pass' || $e['movementDirection'] !== 'both' || ($e['open'] && $e['interaction'] !== 'none') || ($edge['broken'] ?? false) === true) continue;
            $a = $nodes[$e['a']] ?? null; $b = $nodes[$e['b']] ?? null;
            if (!$a || !$b) continue;
            // An object's walls (one group name) ring the squares it stands on: remember its outline.
            if (is_string($edge['group'] ?? null)) {
                $box = $objects[$edge['group']] ?? [INF, INF, -INF, -INF, []];
                $objects[$edge['group']] = [min($box[0], $a['x'], $b['x']), min($box[1], $a['y'], $b['y']), max($box[2], $a['x'], $b['x']), max($box[3], $a['y'], $b['y']), [...$box[4], $edge]];
            }
            // The stretch of the wall that lies inside the square, if any (Liang-Barsky).
            $dx = $b['x'] - $a['x']; $dy = $b['y'] - $a['y']; $lo = 0.; $hi = 1.;
            foreach ([[-$dx, $a['x'] - $left], [$dx, $right - $a['x']], [-$dy, $a['y'] - $top], [$dy, $bottom - $a['y']]] as [$p, $q]) {
                if (abs($p) < 1e-12) { if ($q < 0) { $hi = -1; break; } continue; }
                $t = $q / $p;
                if ($p < 0) $lo = max($lo, $t); else $hi = min($hi, $t);
            }
            if ($hi - $lo <= 1e-9 || hypot($dx, $dy) * ($hi - $lo) < 1e-6) continue;
            // Only a wall that reaches the creature's body: the same test a move makes.
            $u = ($lo + $hi) / 2;
            $base = $e['baseMode'] === 'fixed' ? $e['base'] : WallMovement::terrain($a['x'] + $dx * $u, $a['y'] + $dy * $u, $config) + $e['base'];
            $crest = $e['baseMode'] === 'fixed' || $e['topMode'] === 'follow' ? $base + $e['height'] : max(WallMovement::terrain($a['x'], $a['y'], $config), WallMovement::terrain($b['x'], $b['y'], $config)) + $e['base'] + $e['height'];
            $z ??= WallMovement::height($placement, $config);
            if ($z < $crest - 1e-7 && $z + max($w, $h) > $base + 1e-7) $found[] = $edge;
        }
        // The middle square of a wide object is touched by none of its walls, yet a creature there
        // is on the object all the same.
        $ids = array_column($found, 'id');
        foreach ($objects as [$l, $t, $r, $b, $edges]) {
            if ($left >= $r || $right <= $l || $top >= $b || $bottom <= $t || array_intersect(array_column($edges, 'id'), $ids)) continue;
            $e = [...['baseMode'=>'terrain','base'=>0,'height'=>2], ...$edges[0]];
            $base = $e['baseMode'] === 'fixed' ? $e['base'] : WallMovement::terrain(($l + $r) / 2, ($t + $b) / 2, $config) + $e['base'];
            $z ??= WallMovement::height($placement, $config);
            if ($z < $base + $e['height'] - 1e-7 && $z + max($w, $h) > $base + 1e-7) $found = [...$found, ...$edges];
        }
        return $found;
    }

    /** The book's materials, as Stamina for each square of wall (Hurling Through Objects). */
    public const STAMINA = ['glass'=>1, 'wood'=>3, 'stone'=>6, 'metal'=>9];

    /**
     * A wall's Stamina for each square, or null when it cannot be broken. A wall may state the
     * number itself (a summoned wall given "15 Stamina a square"); otherwise its material says it.
     * Breaking a square costs that many squares of forced movement and does that much plus 2.
     */
    public static function stamina(array $edge): ?int
    {
        if (isset($edge['stamina']) && is_int($edge['stamina']) && $edge['stamina'] > 0) return $edge['stamina'];
        return self::STAMINA[$edge['material'] ?? ''] ?? null;
    }

    public static function breakable(array $edge): bool
    {
        return self::stamina($edge) !== null && ($edge['broken'] ?? false) !== true;
    }

    /**
     * Those walls and every other standing wall of the same object. An object's walls share a
     * `group` name and break as one thing.
     *
     * @return list<array{id:string,material:string}>
     */
    public static function whole(array $walls, array $config): array
    {
        $groups = array_values(array_unique(array_filter(array_map(static fn ($edge) => $edge['group'] ?? null, $walls), 'is_string')));
        $ids = array_column($walls, 'id'); $out = [];
        foreach ($config['environment']['walls']['value']['segments'] ?? [] as $edge) {
            if (!self::breakable($edge)) continue;
            if (in_array($edge['id'], $ids, true) || (isset($edge['group']) && in_array($edge['group'], $groups, true))) $out[] = ['id'=>$edge['id'], 'material'=>$edge['material'] ?? 'stone'];
        }
        return $out;
    }
}
