<?php
declare(strict_types=1);
require_once __DIR__.'/MovementRules.php';
require_once __DIR__.'/FloorGeometry.php';
require_once __DIR__.'/FlightHeight.php';

/**
 * Labelled maps (Brandon, November 8, 2026: "The AI map maker labels everything ... The code reads the labels and acts
 * on them"). A design whose walls say `labels: 1` is labelled:
 *  - an object (a box, a rock, a tree core, a step) is stored once, in walls.objects: its outline, top and whether it is
 *    stood on. Its ring of walls is built from that here, on import and on every walls save, with ids "obj:<id>:<n>"
 *    and `object: <id>` on each wall; everything downstream (sight, drawing, 3D, movement) sees ordinary walls;
 *  - a stair is the ramp only: the floor link (mapLevels stairs) is worked out from the ramp;
 *  - box tops come from objects marked standOn, never from guessing at four walls in a square (WallBoxes).
 * Old maps have no `labels` and keep today's guessing. Pure: reads and returns arrays, stores nothing.
 */
final class MapLabels
{
    public const OBJECT_WALL = 'obj:';
    public const KINDS = ['water', 'difficult', 'no-climb'];

    public static function labelled(array $walls): bool
    {
        return ($walls['labels'] ?? null) === 1;
    }

    /** The squares a map marks no-climb, as a set keyed "<floor>|<column>,<row>" (empty on most maps). */
    public static function noClimbSquares(array $config): array
    {
        $set = [];
        foreach ($config['environment']['zones']['value']['zones'] ?? [] as $zone) {
            if (($zone['kind'] ?? null) !== 'no-climb') continue;
            foreach ($zone['squares'] ?? [] as [$c, $r]) $set[($zone['levelId'] ?? 'level-0') . '|' . $c . ',' . $r] = true;
        }
        return $set;
    }

    /**
     * No-climb ground is walked both ways (Brandon, November 8, 2026: "bumpy ground walked as plain"; down as well as
     * up, November 10): a step down out of a no-climb square, lower than a cliff, is a walk and never a fall.
     * `$upper` and `$lower` are the creature before and after the step; `$standing` gives the height it stands at.
     */
    public static function walkedBump(array $upper, array $lower, callable $standing, array $noClimb): bool
    {
        if (!$noClimb) return false;
        $key = ($upper['levelId'] ?? 'level-0') . '|' . (int) floor($upper['column'] + ($upper['width'] ?? 1) / 2 + 1e-9) . ',' . (int) floor($upper['row'] + ($upper['height'] ?? 1) / 2 + 1e-9);
        return isset($noClimb[$key]) && $standing($upper) - $standing($lower) < MovementRules::get('climbGrade') - 1e-6;
    }

    /** A whole scene config with its objects' walls and, on a labelled map, its stairs worked out from its ramps. */
    public static function apply(array $config): array
    {
        $walls = $config['environment']['walls']['value'] ?? null;
        if (!is_array($walls)) return $config;
        $config['environment']['walls']['value'] = self::expand($walls, $config);
        if (self::labelled($walls)) $config['mapLevels'] = self::stairs($walls['ramps'] ?? [], $config['mapLevels'] ?? []);
        return $config;
    }

    /** The walls design with every object's ring of walls built afresh. Broken walls stay broken. */
    public static function expand(array $walls, array $config = []): array
    {
        $objects = is_array($walls['objects'] ?? null) ? $walls['objects'] : [];
        $old = []; $segments = []; $nodes = [];
        foreach ($walls['segments'] ?? [] as $edge) {
            if (str_starts_with((string) ($edge['id'] ?? ''), self::OBJECT_WALL)) { $old[$edge['id']] = $edge; continue; }
            $segments[] = $edge;
        }
        foreach ($walls['nodes'] ?? [] as $node) if (!str_starts_with((string) ($node['id'] ?? ''), self::OBJECT_WALL)) $nodes[] = $node;
        if (!$objects && !$old) return $walls;
        $config['environment']['walls']['value'] = $walls;
        foreach ($objects as $object) {
            $id = (string) $object['id']; $ring = self::ring($object['points']);
            $base = self::base($object, $config); $tall = max(0., (float) $object['top'] - $base);
            $sight = $object['sight'] ?? ($tall <= MovementRules::get('objectSightPass') + 1e-9 ? 'pass' : 'block');
            $ids = [];
            foreach ($ring as $i => $point) { $ids[$i] = self::OBJECT_WALL . $id . ':p' . $i; $nodes[] = ['id' => $ids[$i], 'x' => (float) $point['x'], 'y' => (float) $point['y']]; }
            foreach ($ring as $i => $point) {
                $wallId = self::OBJECT_WALL . $id . ':' . $i;
                $edge = ['id' => $wallId, 'a' => $ids[$i], 'b' => $ids[($i + 1) % count($ring)], 'baseMode' => 'fixed', 'base' => $base, 'height' => $tall, 'topMode' => 'follow',
                    'sight' => $sight, 'movement' => 'block', 'interaction' => 'none', 'sightDirection' => 'both', 'movementDirection' => 'both', 'object' => $id,
                    'climbable' => self::climbable($object)];
                if (isset($object['material'])) $edge['material'] = $object['material'];
                if (isset($object['group'])) $edge['group'] = $object['group'];
                if (isset($object['label'])) $edge['label'] = $object['label'];
                if (isset($edge['material']) && ($old[$wallId]['broken'] ?? false) === true) {
                    $edge['broken'] = true;
                    if (isset($old[$wallId]['rubble'])) $edge['rubble'] = $old[$wallId]['rubble'];
                }
                $segments[] = $edge;
            }
        }
        $walls['nodes'] = $nodes; $walls['segments'] = $segments;
        return $walls;
    }

    /**
     * Whether an object is climbed: only one that can be stood on (Brandon, November 10, 2026: "don't let them climb
     * it but not stand on it"). A climbable trunk with no top is not climbed; a tree to climb gets a top to stand on.
     */
    public static function climbable(array $object): bool
    {
        return ($object['climbable'] ?? false) === true && ($object['standOn'] ?? false) === true;
    }

    /** An object's outline as a ring without a repeated last point. */
    public static function ring(array $points): array
    {
        $ring = array_values($points);
        if (count($ring) > 3) { $a = $ring[0]; $z = $ring[count($ring) - 1]; if (abs($a['x'] - $z['x']) < 1e-9 && abs($a['y'] - $z['y']) < 1e-9) array_pop($ring); }
        return $ring;
    }

    /**
     * The height an object stands on: its own `base` when given; otherwise, on the ground floor, the lowest ground
     * under its outline (a rock on a slope needs no worked-out number), and on an upper floor the floor plate under
     * its middle, else the floor's height.
     */
    public static function base(array $object, array $config): float
    {
        if (isset($object['base']) && is_numeric($object['base'])) return (float) $object['base'];
        $ring = self::ring($object['points']); $level = $object['levelId'] ?? 'level-0';
        $xs = array_column($ring, 'x'); $ys = array_column($ring, 'y');
        if ($level !== 'level-0') {
            $cx = array_sum($xs) / count($xs); $cy = array_sum($ys) / count($ys); $best = null;
            foreach ($config['environment']['walls']['value']['roofs'] ?? [] as $roof) {
                if (($roof['kind'] ?? '') !== 'floor' || ($roof['levelId'] ?? 'level-0') !== $level || count($roof['points'] ?? []) < 3) continue;
                if (FloorSupport::contains($roof['points'], $cx, $cy) && ($best === null || $roof['height'] > $best)) $best = (float) $roof['height'];
            }
            return $best ?? (float) (FloorGeometry::elevations($config['mapLevels'] ?? [])[$level] ?? 0);
        }
        $low = INF; $ground = static fn (float $x, float $y) => FlightHeight::ground(['column' => $x, 'row' => $y, 'width' => 0, 'height' => 0, 'levelId' => 'level-0'], $config);
        foreach ($ring as $point) $low = min($low, $ground((float) $point['x'], (float) $point['y']));
        for ($x = min($xs); $x <= max($xs) + 1e-9; $x += .25) for ($y = min($ys); $y <= max($ys) + 1e-9; $y += .25)
            if (FloorSupport::contains($ring, $x, $y)) $low = min($low, $ground($x, $y));
        return is_finite($low) ? $low : 0.;
    }

    /**
     * The floor links of a labelled map, from its ramps: a ramp joining two floors is an up stair on the floor it starts
     * from and a down stair on the floor it reaches, foot edges red and head edges green, under the ramp's own id.
     * Every other stair record is replaced.
     */
    public static function stairs(array $ramps, array $mapLevels): array
    {
        $exists = ['level-0' => true];
        foreach ($mapLevels['levels'] ?? [] as $level) if (is_string($level['id'] ?? null)) $exists[$level['id']] = true;
        $by = [];
        foreach ($ramps as $ramp) {
            $stair = self::stairOf($ramp);
            if (!$stair || !isset($exists[$ramp['fromLevel']], $exists[$ramp['toLevel']])) continue;
            $by[$ramp['fromLevel']][] = [...$stair, 'direction' => 'up', 'linkedLevelId' => $ramp['toLevel']];
            $by[$ramp['toLevel']][] = [...$stair, 'direction' => 'down', 'linkedLevelId' => $ramp['fromLevel']];
        }
        $mapLevels['baseStairs'] = $by['level-0'] ?? [];
        foreach ($mapLevels['levels'] ?? [] as $i => $level) $mapLevels['levels'][$i]['stairs'] = $by[$level['id'] ?? ''] ?? [];
        return $mapLevels;
    }

    /** The stair shape of one ramp ({id, corners, edgeColors}), or null when the ramp joins no two floors or is off the grid. */
    public static function stairOf(array $ramp): ?array
    {
        $from = $ramp['fromLevel'] ?? null; $to = $ramp['toLevel'] ?? null;
        if (!is_string($ramp['id'] ?? null) || !is_string($from) || !is_string($to) || $from === $to) return null;
        foreach (['left', 'right', 'top', 'bottom'] as $key) if (!is_numeric($ramp[$key] ?? null) || abs($ramp[$key] - round($ramp[$key])) > 1e-6) return null;
        [$l, $r, $t, $b] = [(int) round($ramp['left']), (int) round($ramp['right']), (int) round($ramp['top']), (int) round($ramp['bottom'])];
        $corners = [['column' => $l, 'row' => $t], ['column' => $r, 'row' => $t], ['column' => $r, 'row' => $b], ['column' => $l, 'row' => $b]];
        $direction = $ramp['direction'] ?? 'north'; $colors = [];
        foreach (FloorGeometry::perimeter($corners) as $edge) {
            $flat = $edge['from']['y'] === $edge['to']['y']; $x = $edge['from']['x']; $y = $edge['from']['y'];
            $side = $flat ? ($y === $t ? 'north' : 'south') : ($x === $l ? 'west' : 'east');
            $opposite = ['north' => 'south', 'south' => 'north', 'east' => 'west', 'west' => 'east'][$direction] ?? 'south';
            if ($side === $direction) $colors[$edge['id']] = 'green'; elseif ($side === $opposite) $colors[$edge['id']] = 'red';
        }
        return ['id' => $ramp['id'], 'corners' => $corners, 'edgeColors' => $colors];
    }

    /**
     * The load check (Brandon, November 8, 2026: warns, never blocks): anything on the map that will behave oddly, in
     * plain words with the square, for the Director and for the map maker to fix. A list of strings, at most 60.
     */
    public static function check(array $config): array
    {
        $walls = $config['environment']['walls']['value'] ?? [];
        $out = []; $add = static function (string $line) use (&$out) { $out[] = $line; };
        $step = MovementRules::get('stepUp'); $snap = MovementRules::get('deckSnap'); $body = MovementRules::get('bodyHeight');
        $ground = static fn (float $x, float $y) => FlightHeight::ground(['column' => $x, 'row' => $y, 'width' => 0, 'height' => 0, 'levelId' => 'level-0'], $config);
        $at = static fn (float $x, float $y) => '(' . (floor($x)) . ',' . (floor($y)) . ')';
        $roofs = FloorSupport::surfaces($walls);
        $floors = array_values(array_filter($roofs, static fn ($r) => ($r['kind'] ?? '') === 'floor' && empty($r['boxTop']) && count($r['points'] ?? []) > 2));
        $nodes = array_column($walls['nodes'] ?? [], null, 'id');
        if (self::labelled($walls)) {
            foreach ($roofs as $roof) if (!in_array($roof['kind'] ?? null, ['floor', 'roof'], true)) $add('Plate ' . ($roof['id'] ?? '?') . ' says neither floor nor roof; it is treated as a roof.');
            // A stair record that disagrees with its ramp: the ramp wins.
            $given = [];
            foreach ([['level-0', $config['mapLevels']['baseStairs'] ?? []], ...array_map(static fn ($l) => [$l['id'] ?? '', $l['stairs'] ?? []], $config['mapLevels']['levels'] ?? [])] as [$level, $stairs])
                foreach ($stairs as $stair) $given[$level . '|' . ($stair['id'] ?? '')] = $stair;
            foreach ($walls['ramps'] ?? [] as $ramp) {
                $stair = self::stairOf($ramp);
                if (!$stair && ($ramp['fromLevel'] ?? null) !== ($ramp['toLevel'] ?? null) && isset($ramp['fromLevel'], $ramp['toLevel'])) $add('Ramp ' . ($ramp['id'] ?? '?') . ' joins two floors but is not on whole squares; it makes no floor link.');
                $old = $given[($ramp['fromLevel'] ?? '') . '|' . ($ramp['id'] ?? '')] ?? null;
                if ($stair && $old && (($old['corners'] ?? null) != $stair['corners'] || ($old['edgeColors'] ?? null) != $stair['edgeColors'])) $add('Stair ' . $ramp['id'] . ' did not match its ramp; the ramp was used.');
            }
        }
        // Climbable walls with a ceiling just above them: climbing would hit the ceiling. One line a thing.
        $ceilings = [];
        foreach ($walls['segments'] ?? [] as $edge) {
            if (($edge['climbable'] ?? false) !== true || ($edge['broken'] ?? false) === true) continue;
            $a = $nodes[$edge['a']] ?? null; $b = $nodes[$edge['b']] ?? null; if (!$a || !$b) continue;
            $x = ($a['x'] + $b['x']) / 2; $y = ($a['y'] + $b['y']) / 2;
            $base = ($edge['baseMode'] ?? 'terrain') === 'fixed' ? (float) ($edge['base'] ?? 0) : $ground($x, $y) + (float) ($edge['base'] ?? 0);
            $top = $base + (float) ($edge['height'] ?? 2);
            foreach ($roofs as $roof) if (count($roof['points'] ?? []) > 2 && empty($roof['boxTop']) && $roof['height'] > $top + 1e-6 && $roof['height'] <= $top + $body + 1e-6 && FloorSupport::contains($roof['points'], $x, $y)) {
                $name = $edge['label'] ?? $edge['object'] ?? $edge['group'] ?? $edge['id']; $name = preg_replace('/-\d+$/', '', (string) $name);
                if (!isset($ceilings[$name])) { $ceilings[$name] = true; $add('Climbable ' . $name . ' at ' . $at($x, $y) . ' has a ceiling right above it.'); }
                break;
            }
        }
        // Objects: overlapping outlines.
        $objects = is_array($walls['objects'] ?? null) ? $walls['objects'] : [];
        // An object set climbable that cannot be stood on (a tree trunk, a pointed rock) is not climbed (self::climbable).
        // Found on Thornbriar's trees, November 9, 2026; Brandon's rule November 10.
        foreach ($objects as $object) if (($object['climbable'] ?? false) === true && ($object['standOn'] ?? false) !== true)
            $add('Object ' . ($object['label'] ?? $object['id']) . ' is climbable but cannot be stood on, so it is not climbed. To climb it, give it a top to stand on (standOn).');
        $span = static function (array $o) { $r = self::ring($o['points']); return [min(array_column($r, 'x')), min(array_column($r, 'y')), max(array_column($r, 'x')), max(array_column($r, 'y')), $r]; };
        for ($i = 0; $i < count($objects); $i++) for ($j = $i + 1; $j < count($objects); $j++) {
            [$l1, $t1, $r1, $b1, $p1] = $span($objects[$i]); [$l2, $t2, $r2, $b2, $p2] = $span($objects[$j]);
            if (($objects[$i]['levelId'] ?? 'level-0') !== ($objects[$j]['levelId'] ?? 'level-0') || $l1 >= $r2 - 1e-6 || $l2 >= $r1 - 1e-6 || $t1 >= $b2 - 1e-6 || $t2 >= $b1 - 1e-6) continue;
            $inside = false;
            foreach ($p1 as $p) if (FloorSupport::contains($p2, $p['x'], $p['y'])) { $inside = true; break; }
            if (!$inside) foreach ($p2 as $p) if (FloorSupport::contains($p1, $p['x'], $p['y'])) { $inside = true; break; }
            if ($inside) $add('Objects ' . ($objects[$i]['label'] ?? $objects[$i]['id']) . ' and ' . ($objects[$j]['label'] ?? $objects[$j]['id']) . ' overlap.');
        }
        // Decks on the ground floor that miss the ground where they join it.
        foreach ($floors as $roof) {
            if (($roof['levelId'] ?? 'level-0') !== 'level-0') continue;
            $worst = 0.; $where = null;
            foreach ($roof['points'] as $p) { $gap = (float) $roof['height'] - $ground((float) $p['x'], (float) $p['y']); if (abs($gap) > $snap + 1e-6 && abs($gap) <= $step + 1e-6 && abs($gap) > abs($worst)) { $worst = $gap; $where = $p; } }
            if ($where) $add('Deck ' . ($roof['id'] ?? '?') . ' is ' . round(abs($worst), 2) . ' ' . ($worst > 0 ? 'above' : 'below') . ' the ground at ' . $at($where['x'], $where['y']) . ' (more than ' . $snap . ').');
        }
        // Ramp ends that meet no floor.
        foreach ($walls['ramps'] ?? [] as $ramp) {
            $direction = $ramp['direction'] ?? 'north'; $cx = ($ramp['left'] + $ramp['right']) / 2; $cy = ($ramp['top'] + $ramp['bottom']) / 2;
            $head = match ($direction) { 'south' => [$cx, $ramp['bottom'] + .5], 'east' => [$ramp['right'] + .5, $cy], 'west' => [$ramp['left'] - .5, $cy], default => [$cx, $ramp['top'] - .5] };
            $foot = match ($direction) { 'south' => [$cx, $ramp['top'] - .5], 'east' => [$ramp['left'] - .5, $cy], 'west' => [$ramp['right'] + .5, $cy], default => [$cx, $ramp['bottom'] + .5] };
            foreach ([['foot', $foot, (float) $ramp['base'], $ramp['fromLevel'] ?? 'level-0'], ['head', $head, (float) $ramp['height'], $ramp['toLevel'] ?? 'level-0']] as [$end, [$x, $y], $height, $level]) {
                $meets = $level === 'level-0' && abs($ground($x, $y) - $height) <= $snap + 1e-6;
                foreach ($floors as $roof) if (abs($roof['height'] - $height) <= MovementRules::get('stairMeetsPlate') + 1e-6 && FloorSupport::contains($roof['points'], $x, $y)) { $meets = true; break; }
                if (!$meets && $level !== 'level-0' && abs((float) (FloorGeometry::elevations($config['mapLevels'] ?? [])[$level] ?? -1000) - $height) <= $snap) $meets = true;
                if (!$meets) $add('Ramp ' . ($ramp['id'] ?? '?') . ' ' . $end . ' at ' . $at($x, $y) . ' meets no floor at height ' . $height . '.');
            }
        }
        // Water under a deck.
        foreach ($config['environment']['zones']['value']['zones'] ?? [] as $zone) {
            if (($zone['kind'] ?? (($zone['tag'] ?? '') === 'water' ? 'water' : null)) !== 'water') continue;
            foreach ($zone['squares'] as [$c, $r]) {
                // A deck over the water, not the floor the water lies in.
                $under = ($zone['levelId'] ?? 'level-0') === 'level-0' ? $ground($c + .5, $r + .5) : (float) (FloorGeometry::elevations($config['mapLevels'] ?? [])[$zone['levelId']] ?? 0);
                foreach ($floors as $roof) if (($roof['levelId'] ?? 'level-0') === ($zone['levelId'] ?? 'level-0') && $roof['height'] > $under + $snap + 1e-6 && FloorSupport::contains($roof['points'], $c + .5, $r + .5)) {
                    $add('Water at (' . $c . ',' . $r . ') is under deck ' . ($roof['id'] ?? '?') . '.'); continue 3;
                }
            }
        }
        // Ground bumps that will ask to climb: a rise of more than a plain step within one square, under a cliff's height.
        $terrain = $config['environment']['terrain']['value'] ?? null;
        if (is_array($terrain) && isset($terrain['bounds'])) {
            $smooth = [];
            foreach ($config['environment']['zones']['value']['zones'] ?? [] as $zone) if (($zone['kind'] ?? null) === 'no-climb') foreach ($zone['squares'] as [$c, $r]) $smooth[$c . ',' . $r] = true;
            $bounds = $terrain['bounds']; $bumps = 0; $first = null;
            for ($c = (int) floor($bounds['left']); $c < $bounds['left'] + $bounds['width'] - 1; $c++) for ($r = (int) floor($bounds['top']); $r < $bounds['top'] + $bounds['height'] - 1; $r++) {
                if (isset($smooth[$c . ',' . $r])) continue;
                $here = $ground($c + .5, $r + .5);
                foreach ([[1, 0], [0, 1]] as [$dx, $dy]) {
                    if (isset($smooth[($c + $dx) . ',' . ($r + $dy)])) continue;
                    $rise = abs($ground($c + $dx + .5, $r + $dy + .5) - $here);
                    if ($rise > $step + 1e-6 && $rise < MovementRules::get('climbGrade') - 1e-6) { $bumps++; $first ??= '(' . $c . ',' . $r . ')'; }
                }
            }
            if ($bumps) $add($bumps . ' ground bump' . ($bumps === 1 ? '' : 's') . ' between ' . $step . ' and ' . MovementRules::get('climbGrade') . ' high with no label, first at ' . $first . '. They ask to climb; mark them no-climb if they should be walked.');
        }
        if (count($out) > 60) $out = [...array_slice($out, 0, 59), (count($out) - 59) . ' more.'];
        return $out;
    }
}
