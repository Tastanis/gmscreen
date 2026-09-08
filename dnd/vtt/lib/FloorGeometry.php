<?php
declare(strict_types=1);

/** Pure geometry for authoritative movement. No persistence, sessions, or UI. */
final class FloorGeometry
{
    public const BASE = 'level-0';
    private const EPSILON = 0.000001;

    public static function orderedLevels(array $mapLevels): array
    {
        $levels = [];
        foreach (($mapLevels['levels'] ?? []) as $index => $level) {
            if (!is_array($level) || empty($level['id']) || $level['id'] === self::BASE) continue;
            $levels[] = [...$level, '_sourceIndex' => $index];
        }
        usort($levels, static fn (array $a, array $b): int =>
            (($a['zIndex'] ?? $a['_sourceIndex']) <=> ($b['zIndex'] ?? $b['_sourceIndex']))
            ?: ($a['_sourceIndex'] <=> $b['_sourceIndex']));
        return [['id' => self::BASE, 'cutouts' => []], ...$levels];
    }

    /** Exact union coverage, including fractional positions and partial support. */
    public static function fullyUnsupported(array $placement, array $level): bool
    {
        $x = (float) ($placement['column'] ?? 0);
        $y = (float) ($placement['row'] ?? 0);
        $right = $x + max(1, (float) ($placement['width'] ?? 1));
        $bottom = $y + max(1, (float) ($placement['height'] ?? 1));
        $cuts = [];
        $boundaries = [$x, $right];
        foreach (($level['cutouts'] ?? []) as $cutout) {
            if (!is_array($cutout)) continue;
            $left = (float) ($cutout['column'] ?? $cutout['col'] ?? $cutout['x'] ?? 0);
            $top = (float) ($cutout['row'] ?? $cutout['y'] ?? 0);
            $end = $left + max(1, (float) ($cutout['width'] ?? $cutout['columns'] ?? $cutout['w'] ?? 1));
            $low = $top + max(1, (float) ($cutout['height'] ?? $cutout['rows'] ?? $cutout['h'] ?? 1));
            if ($end <= $x || $left >= $right || $low <= $y || $top >= $bottom) continue;
            $cuts[] = [max($x, $left), max($y, $top), min($right, $end), min($bottom, $low)];
            $boundaries[] = max($x, $left);
            $boundaries[] = min($right, $end);
        }
        sort($boundaries, SORT_NUMERIC);
        for ($i = 1; $i < count($boundaries); $i++) {
            if ($boundaries[$i] - $boundaries[$i - 1] < self::EPSILON) continue;
            $intervals = array_values(array_filter($cuts, static fn ($cut) =>
                $cut[0] <= $boundaries[$i - 1] && $cut[2] >= $boundaries[$i]));
            usort($intervals, static fn ($a, $b) => $a[1] <=> $b[1]);
            $coveredTo = $y;
            foreach ($intervals as $cut) {
                if ($cut[1] > $coveredTo + self::EPSILON) return false;
                $coveredTo = max($coveredTo, $cut[3]);
            }
            if ($coveredTo < $bottom - self::EPSILON) return false;
        }
        return count($cuts) > 0;
    }

    public static function fallingDestination(array $placement, array $mapLevels): ?string
    {
        $levels = self::orderedLevels($mapLevels);
        $id = $placement['levelId'] ?? self::BASE;
        $start = array_search($id, array_column($levels, 'id'), true);
        if ($start === false || $start === 0) return null;
        $index = $start;
        while ($index > 0) {
            $level = $levels[$index];
            if (($level['hidden'] ?? false) !== true && !self::fullyUnsupported($placement, $level)) break;
            $index--;
        }
        return $index === $start ? null : $levels[$index]['id'];
    }

    /** Same axis-only perimeter and canonical edge IDs as stairs-geometry.js. */
    public static function perimeter(array $corners): array
    {
        if (count($corners) !== 4) return [];
        $segments = [];
        for ($i = 0; $i < 4; $i++) {
            $a = $corners[$i]; $b = $corners[($i + 1) % 4];
            if (!isset($a['column'], $a['row'], $b['column'], $b['row'])) return [];
            $x = (int) $a['column']; $y = (int) $a['row'];
            $dx = (int) $b['column'] - $x; $dy = (int) $b['row'] - $y;
            $nx = abs($dx); $ny = abs($dy); $total = $nx + $ny;
            if ($total > 10000) return []; // Bound work for malformed/oversized stairs.
            $h = 0; $v = 0;
            for ($k = 1; $k <= $total; $k++) {
                $from = ['x' => $x, 'y' => $y];
                $horizontal = $h >= $nx ? false : ($v >= $ny || $h + 0.5 < $k * $nx / $total);
                if ($horizontal) { $x += $dx <=> 0; $h++; }
                else { $y += $dy <=> 0; $v++; }
                $to = ['x' => $x, 'y' => $y];
                [$first, $last] = ($from['x'] < $x || ($from['x'] === $x && $from['y'] < $y)) ? [$from, $to] : [$to, $from];
                $key = $first['x'] . ',' . $first['y'] . '-' . $last['x'] . ',' . $last['y'];
                $segments[$key] = ['id' => $key, 'from' => $from, 'to' => $to];
            }
        }
        return array_values($segments);
    }

    private static function inside(array $point, array $edges): bool
    {
        $inside = false;
        foreach ($edges as $edge) {
            $a = $edge['from']; $b = $edge['to'];
            if (($a['y'] > $point['y']) !== ($b['y'] > $point['y'])
                && $point['x'] < ($b['x'] - $a['x']) * ($point['y'] - $a['y']) / ($b['y'] - $a['y']) + $a['x']) $inside = !$inside;
        }
        return $inside;
    }

    public static function crossing(array $path, array $stair, ?string $priorEntry = null): array
    {
        $edges = self::perimeter($stair['corners'] ?? []);
        $result = ['fired' => false, 'entry' => null, 'endsInside' => false];
        if (!$edges || count($path) < 2) return $result;
        $entry = in_array($priorEntry, ['red', 'green', 'barrier'], true) ? $priorEntry
            : (self::inside($path[0], $edges) ? 'barrier' : null);
        $endsInside = self::inside($path[0], $edges);
        for ($i = 1; $i < count($path); $i++) {
            $a = $path[$i - 1]; $b = $path[$i];
            $dx = $b['x'] - $a['x']; $dy = $b['y'] - $a['y'];
            $length = hypot($dx, $dy);
            if ($length < self::EPSILON) continue;
            $hits = [];
            foreach ($edges as $edge) {
                $q = $edge['from']; $r = $edge['to'];
                $ex = $r['x'] - $q['x']; $ey = $r['y'] - $q['y'];
                $denominator = $dx * $ey - $dy * $ex;
                if (abs($denominator) < self::EPSILON) continue;
                $t = (($q['x'] - $a['x']) * $ey - ($q['y'] - $a['y']) * $ex) / $denominator;
                $u = (($q['x'] - $a['x']) * $dy - ($q['y'] - $a['y']) * $dx) / $denominator;
                if ($t < 0 || $t > 1 || $u < 0 || $u >= 1) continue;
                $hits[] = ['t' => $t, 'color' => $stair['edgeColors'][$edge['id']] ?? 'barrier'];
            }
            usort($hits, static fn ($a, $b) => $a['t'] <=> $b['t']);
            foreach ($hits as $hit) {
                $t = $hit['t']; $delta = self::EPSILON / $length;
                $before = self::inside(['x'=>$a['x']+($t-$delta)*$dx, 'y'=>$a['y']+($t-$delta)*$dy], $edges);
                $after = self::inside(['x'=>$a['x']+($t+$delta)*$dx, 'y'=>$a['y']+($t+$delta)*$dy], $edges);
                if ($before === $after) continue; // Tangency, not an entrance/exit.
                $endsInside = $after;
                if (!$before) {
                    // Don't count a completed prior entrance twice at a shared endpoint.
                    if ($t > self::EPSILON || $entry === null) $entry = $hit['color'];
                    continue;
                }
                $up = ($stair['direction'] ?? '') === 'up';
                if (($up && $entry === 'red' && $hit['color'] === 'green')
                    || (!$up && ($stair['direction'] ?? '') === 'down' && $entry === 'green' && $hit['color'] === 'red')) {
                    return ['fired'=>true, 'entry'=>null, 'endsInside'=>false];
                }
                $entry = null;
            }
        }
        return ['fired'=>false, 'entry'=>$endsInside ? $entry : null, 'endsInside'=>$endsInside];
    }

    /** Derive floor and resumable stair progress from canonical geometry only. */
    public static function move(array $current, array $destination, array $mapLevels, string $kind = 'walk', array $waypoints = []): array
    {
        $levelId = (string) ($current['levelId'] ?? self::BASE);
        $levels = self::orderedLevels($mapLevels);
        $byId = array_column($levels, null, 'id');
        $result = ['levelId'=>$levelId, 'traversal'=>null, 'cause'=>null];
        $width = max(1, (float) ($current['width'] ?? 1));
        $height = max(1, (float) ($current['height'] ?? 1));
        $path = [];
        foreach ([$current, ...$waypoints, $destination] as $point) {
            if (!is_numeric($point['column'] ?? null) || !is_numeric($point['row'] ?? null)) throw new InvalidArgumentException('Movement path requires numeric coordinates.');
            $x = (float) $point['column']; $y = (float) $point['row'];
            if (!is_finite($x) || !is_finite($y) || $x < 0 || $y < 0 || $x > 100000 || $y > 100000) throw new InvalidArgumentException('Movement path coordinates are out of range.');
            $path[] = ['x'=>$x+$width/2, 'y'=>$y+$height/2];
        }
        if (count($path) > 258) throw new InvalidArgumentException('Movement path has too many waypoints.');
        if ($kind === 'walk' && ($byId[$levelId]['hidden'] ?? false) !== true) {
            $stairs = $levelId === self::BASE ? ($mapLevels['baseStairs'] ?? []) : ($byId[$levelId]['stairs'] ?? []);
            foreach ($stairs as $stair) {
                $target = $stair['linkedLevelId'] ?? '';
                if (!isset($byId[$target]) || $target === $levelId || ($byId[$target]['hidden'] ?? false) === true) continue;
                $signature = hash('sha256', json_encode([$levelId, $width, $height, $stair]));
                $prior = $current['_floorTraversal'] ?? [];
                $crossing = self::crossing($path, $stair, ($prior['signature'] ?? '') === $signature ? ($prior['entry'] ?? null) : null);
                if ($crossing['fired']) { $result['levelId']=$target; $result['cause']='stairs'; break; }
                if ($crossing['endsInside']) {
                    $result['traversal']=['stairId'=>$stair['id'], 'signature'=>$signature, 'entry'=>$crossing['entry']];
                    break;
                }
            }
        }
        $fall = self::fallingDestination([...$current, ...$destination, 'levelId'=>$result['levelId']], $mapLevels);
        if ($fall !== null) { $result['levelId']=$fall; $result['cause']='fall'; $result['traversal']=null; }
        return $result;
    }
}
