<?php
declare(strict_types=1);
// Ground a labelled map marks no-climb is walked both ways (Brandon, November 8, 2026: "bumpy ground walked as
// plain"; coming down as well as going up, November 10, 2026, found on Thornbriar's banks: going up asked nothing and
// coming down the same bump was a fall of 2). A cliff's height is still a fall. The browser's side is in
// breakable-art.test.mjs. Also here: the load check names an object that is climbable but cannot be stood on.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function walkedCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

/** Ground whose height depends only on x: eight samples to the square, twelve squares wide; `$noClimb` squares are marked. */
function walkedConfig(callable $height, array $noClimb = []): array {
    $n = 8 * 12 + 1; $h = [];
    for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) $h[] = (float) $height($i / 8);
    $config = ['environment'=>['terrain'=>['revision'=>1, 'value'=>['n'=>$n, 'm'=>2, 'h'=>$h, 'bounds'=>['left'=>0, 'top'=>0, 'width'=>12, 'height'=>4]]]]];
    if ($noClimb) $config['environment']['zones'] = ['revision'=>1, 'value'=>['version'=>1, 'zones'=>[['id'=>'banks', 'tag'=>'bank', 'kind'=>'no-climb', 'cost'=>1, 'squares'=>$noClimb]]]];
    return $config;
}
function walkedProfile(array $points): callable {
    return static function (float $x) use ($points): float {
        if ($x <= $points[0][0]) return (float) $points[0][1];
        for ($i = 1; $i < count($points); $i++) {
            [$x0, $z0] = $points[$i - 1]; [$x1, $z1] = $points[$i];
            if ($x <= $x1) return $z0 + ($z1 - $z0) * ($x - $x0) / ($x1 - $x0);
        }
        return (float) $points[count($points) - 1][1];
    };
}
$walker = static fn (float $column) => ['id'=>'t', 'column'=>$column, 'row'=>1, 'width'=>1, 'height'=>1, 'levelId'=>'level-0', 'movementMode'=>'ground'];
$fall = static function (callable $shape, float $from, float $to, array $noClimb = []) use ($walker): ?int {
    $plan = FallOutcome::plan($walker($from), $walker($to), walkedConfig($shape, $noClimb), 'walk', []);
    return $plan === null ? null : $plan['squares'];
};
// The top is the square at column 2 (its middle is x = 2.5); the foot is the square at column 3.
$sloping = walkedProfile([[2.6, 1.9], [3.4, 0]]);       // a 1.9-high bank sloping over most of a square
$stepped = walkedProfile([[2.95, 1.71], [3.05, 0]]);    // a 1.71-high bank with a sharp edge
$cliff = walkedProfile([[2.95, 2.4], [3.05, 0]]);       // a sheer 2.4-high face
$top = [[2, 1]];

walkedCheck($fall($sloping, 2, 3) === 2 && $fall($stepped, 2, 3) === 2, 'Unmarked, a 1.7 to 1.9 bank is still a fall of 2 coming down');
walkedCheck($fall($sloping, 2, 3, $top) === null, 'Marked no-climb, a sloping 1.9 bank is walked down');
walkedCheck($fall($stepped, 2, 3, $top) === null, 'Marked no-climb, a sharp 1.71 bank is walked down');
walkedCheck($fall($cliff, 2, 3, $top) === 2, 'A cliff of 2 or more is a fall even where the top is marked no-climb');
walkedCheck($fall($sloping, 2, 3, [[3, 1]]) === 2, 'The mark is read on the square stepped down from, not the one landed in');
walkedCheck($fall($sloping, 3, 2, $top) === null, 'Going up never was a fall');
echo "PASS no-climb ground is walked down as well as up; a cliff is still a fall\n";

// One long move: over the marked bank at column 2, on along the flat, then off a real cliff at column 6.
$both = walkedProfile([[2.6, 5.9], [3.4, 4], [5.95, 4], [6.05, 0]]);
walkedCheck($fall($both, 2, 7, $top) === 4, 'After a walked bump the rest of the move is still looked at: the cliff beyond it is a fall of 4');
walkedCheck($fall($both, 2, 4, $top) === null, 'The same move stopping before the cliff is no fall');
echo "PASS a walked bump does not hide a real drop later in the same move\n";

walkedCheck(MapLabels::noClimbSquares(walkedConfig($sloping, [[2, 1], [5, 0]])) === ['level-0|2,1'=>true, 'level-0|5,0'=>true], 'The marked squares are read from the zones, by floor');
walkedCheck(MapLabels::noClimbSquares(walkedConfig($sloping)) === [], 'A map with no marks has none');
echo "PASS the marked squares are read from the map's zones\n";

// The load check: a thing set climbable that cannot be stood on is climbed "over" for 1 and a creature may stop inside it.
$square = fn (float $x, float $y) => [['x'=>$x,'y'=>$y],['x'=>$x+.92,'y'=>$y],['x'=>$x+.92,'y'=>$y+.92],['x'=>$x,'y'=>$y+.92]];
$tree = ['id'=>'elder', 'kind'=>'tree', 'label'=>'Elder tree', 'points'=>$square(3.04, 1.04), 'base'=>0, 'top'=>5, 'standOn'=>false, 'climbable'=>true];
$checked = function (array $object) use ($sloping): array {
    $config = walkedConfig(static fn () => 0.);
    $config['environment']['walls'] = ['revision'=>1, 'value'=>MapLabels::expand(['version'=>1, 'labels'=>1, 'nodes'=>[], 'segments'=>[], 'roofs'=>[], 'objects'=>[$object]])];
    $config['mapLevels'] = [];
    return MapLabels::check($config);
};
$lines = implode("\n", $checked($tree));
walkedCheck(str_contains($lines, 'Elder tree is climbable but cannot be stood on'), 'The check names a climbable object that cannot be stood on: ' . $lines);
walkedCheck(!str_contains(implode("\n", $checked([...$tree, 'climbable'=>false])), 'cannot be stood on'), 'A tree that just blocks is not reported');
walkedCheck(!str_contains(implode("\n", $checked([...$tree, 'standOn'=>true])), 'cannot be stood on'), 'A climbable thing that is stood on is not reported');
echo "PASS the load check names an object that is climbable but cannot be stood on\n";
