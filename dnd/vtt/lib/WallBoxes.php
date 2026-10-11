<?php
declare(strict_types=1);
/**
 * Low objects that fill a square: a crate, a rim rock. Brandon, October 10, 2026: "We can treat full square
 * boxes like railings ... if you try to go over it, it gives you a one climb thing. But if you get like pushed,
 * it can block your push."
 *
 * A box is worked out from the walls: a closed rectangle of four plain wall pieces, all with the same fixed
 * base and the same height, one square high or less. Its walls then count as low barriers (WallMovement), and
 * it gets a top to stand on, at base plus height, as a small floor plate on the floor the box stands on.
 * A ring that is taller, broken, not closed or of mixed heights is no box. A ring whose walls are all set
 * `climbable` (WallMovement::climbable) is a box whatever its height. Paired with low-boxes.mjs.
 */
final class WallBoxes
{
    /** The tallest a box may be, in squares. The same number as WallMovement::LOW_BARRIER. */
    public const BOX_HEIGHT = 1.0;
    public const BOX_TOP = 'box-top:';

    private static function place(float $x, float $y): string
    {
        return round($x * 1e4) . ',' . round($y * 1e4);
    }

    /** The boxes of a walls model: id, left, right, top, bottom, base, height (of its top), edges (wall ids). */
    public static function boxes(array $model): array
    {
        $nodes = array_column($model['nodes'] ?? [], null, 'id');
        $sides = []; $tops = [];
        foreach ($model['segments'] ?? [] as $edge) {
            if (($edge['interaction'] ?? 'none') !== 'none' || ($edge['movement'] ?? 'block') !== 'block' || ($edge['broken'] ?? false) === true || ($edge['movementDirection'] ?? 'both') !== 'both') continue;
            if (($edge['baseMode'] ?? 'terrain') !== 'fixed' || !is_numeric($edge['base'] ?? null) || !is_numeric($edge['height'] ?? null)) continue;
            $tall = (float) $edge['height']; $base = (float) $edge['base'];
            $can = ($edge['climbable'] ?? false) === true;
            if (!($tall > 0) || ($tall > self::BOX_HEIGHT + 1e-6 && !$can) || str_starts_with((string) ($edge['id'] ?? ''), 'template-cube:')) continue;
            $a = $nodes[$edge['a'] ?? ''] ?? null; $b = $nodes[$edge['b'] ?? ''] ?? null;
            if (!$a || !$b) continue;
            $flat = abs($a['y'] - $b['y']) < 1e-6 && abs($a['x'] - $b['x']) > 1e-6;
            $upright = abs($a['x'] - $b['x']) < 1e-6 && abs($a['y'] - $b['y']) > 1e-6;
            if (!$flat && !$upright) continue;
            $size = round($base * 1e4) . '|' . round($tall * 1e4) . ($can ? '|c' : '');
            $aFirst = $flat ? $a['x'] < $b['x'] : $a['y'] < $b['y'];
            $first = $aFirst ? $a : $b; $last = $aFirst ? $b : $a;
            $side = ['id' => $edge['id'], 'first' => $first, 'last' => $last, 'flat' => $flat, 'size' => $size, 'base' => $base, 'tall' => $tall, 'can' => $can];
            $sides[self::place((float) $first['x'], (float) $first['y']) . '>' . self::place((float) $last['x'], (float) $last['y']) . '|' . $size] = $side;
            if ($flat) $tops[] = $side;
        }
        $span = static fn (float $x0, float $y0, float $x1, float $y1, string $size) => $sides[self::place($x0, $y0) . '>' . self::place($x1, $y1) . '|' . $size] ?? null;
        $boxes = []; $used = [];
        foreach ($tops as $north) {
            if (isset($used[$north['id']])) continue;
            $x0 = (float) $north['first']['x']; $x1 = (float) $north['last']['x']; $y0 = (float) $north['first']['y'];
            // Its west side runs down from the same corner; the other two sides must close the rectangle.
            foreach ($sides as $west) {
                if ($west['flat'] || $west['size'] !== $north['size'] || abs($west['first']['x'] - $x0) > 1e-6 || abs($west['first']['y'] - $y0) > 1e-6 || isset($used[$west['id']])) continue;
                $y1 = (float) $west['last']['y'];
                $east = $span($x1, $y0, $x1, $y1, $north['size']); $south = $span($x0, $y1, $x1, $y1, $north['size']);
                if (!$east || !$south || isset($used[$east['id']]) || isset($used[$south['id']])) continue;
                $edges = [$north['id'], $east['id'], $south['id'], $west['id']];
                foreach ($edges as $id) $used[$id] = true;
                $sorted = $edges; sort($sorted, SORT_STRING);
                $boxes[] = ['id' => self::BOX_TOP . $sorted[0], 'left' => $x0, 'right' => $x1, 'top' => $y0, 'bottom' => $y1, 'base' => $north['base'], 'height' => $north['base'] + $north['tall'], 'edges' => $edges, ...($north['can'] ? ['climbable' => true] : [])];
                break;
            }
        }
        return $boxes;
    }

    /**
     * The same model with its boxes worked in: each box's four walls marked `boxWall`, and a floor plate
     * marked `boxTop` at its top, on the floor the box stands on (the floor plate under its middle at its
     * base, else the ground). The model itself when it has no box.
     */
    public static function with(array $model): array
    {
        $boxes = self::boxes($model);
        if (!$boxes) return $model;
        $walls = [];
        foreach ($boxes as $box) foreach ($box['edges'] as $id) $walls[$id] = true;
        foreach ($model['segments'] as $i => $edge) if (isset($walls[$edge['id'] ?? ''])) $model['segments'][$i]['boxWall'] = true;
        $floors = array_values(array_filter(FloorSupport::surfaces($model), static fn ($roof) => ($roof['kind'] ?? '') === 'floor' && empty($roof['boxTop']) && count($roof['points'] ?? []) > 2));
        $model['roofs'] = $model['roofs'] ?? [];
        foreach ($boxes as $box) {
            $x = ($box['left'] + $box['right']) / 2; $y = ($box['top'] + $box['bottom']) / 2; $level = 'level-0';
            foreach ($floors as $roof) {
                if (abs((float) ($roof['height'] ?? 0) - $box['base']) > 0.13 || !FloorSupport::contains($roof['points'], $x, $y)) continue;
                foreach ($roof['holes'] ?? [] as $hole) if (FloorSupport::contains($hole, $x, $y)) continue 2;
                $level = $roof['levelId'] ?? 'level-0'; break;
            }
            $model['roofs'][] = ['id' => $box['id'], 'kind' => 'floor', 'boxTop' => true, ...(!empty($box['climbable']) ? ['climbable' => true] : []), 'levelId' => $level, 'base' => $box['base'], 'height' => $box['height'],
                'points' => [['x' => $box['left'], 'y' => $box['top']], ['x' => $box['right'], 'y' => $box['top']], ['x' => $box['right'], 'y' => $box['bottom']], ['x' => $box['left'], 'y' => $box['bottom']]], 'holes' => []];
        }
        return $model;
    }
}
