<?php
declare(strict_types=1);
// A face that is charged as an N-square climb going up is an N-square fall coming down.
// The banks here are the shapes found on Dead Root; climbing.test.mjs climbs the same shapes.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function bankCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

/** Ground whose height depends only on x: eight samples to the square, twelve squares wide. */
function bankConfig(callable $height): array {
    $n = 8 * 12 + 1; $h = [];
    for ($j = 0; $j < 2; $j++) for ($i = 0; $i < $n; $i++) $h[] = (float) $height($i / 8);
    return ['environment'=>['terrain'=>['revision'=>1, 'value'=>['n'=>$n, 'm'=>2, 'h'=>$h, 'bounds'=>['left'=>0, 'top'=>0, 'width'=>12, 'height'=>4]]]]];
}
/** Straight line between the listed [x, height] points, flat beyond the ends. */
function profile(array $points): callable {
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
$fall = static function (callable $shape, float $from, float $to, string $kind = 'walk', array $path = []) use ($walker): ?int {
    $plan = FallOutcome::plan($walker($from), $walker($to), bankConfig($shape), $kind, $path);
    return $plan === null ? null : $plan['squares'];
};
// The top is the square at column 2 (its middle is x = 2.5); the foot is the square at column 3.
$banks = [
    // name => [shape, squares it is going up and must be coming down]
    'a 1.9-high bank sloping over most of a square' => [profile([[2.6, 1.9], [3.4, 0]]), 2],
    'a 1.71-high bank' => [profile([[2.6, 1.71], [3.35, 0]]), 2],
    'a 2.0-high bank that is not a sheer drop' => [profile([[2.55, 2.0], [3.45, 0]]), 2],
    'a 1.72-high face with a rounded top' => [profile([[2.5, 1.72], [2.9, 1.3], [3.1, 0.3], [3.5, 0]]), 2],
    'a sheer 3.75-high cliff' => [profile([[2.95, 3.75], [3.05, 0]]), 4],
    'a 3.42-high cliff with a raised lip at its edge' => [profile([[2.5, 3.42], [2.9, 4.15], [3.0, 4.15], [3.1, 0]]), 3],
    'a sheer 2.4-high face' => [profile([[2.95, 2.4], [3.05, 0]]), 2],
];
foreach ($banks as $name => [$shape, $squares]) {
    bankCheck($fall($shape, 2, 3) === $squares, "Walking off $name is a fall of $squares (got " . json_encode($fall($shape, 2, 3)) . ')');
    bankCheck($fall($shape, 2, 3, 'forced') === $squares, "Being pushed off $name is the same fall of $squares");
    bankCheck($fall($shape, 3, 2) === null, "Going up $name is not a fall");
    // A longer move that crosses the face counts it once, from the top square.
    bankCheck($fall($shape, 1, 4) === $squares, "A three-square walk over $name is a fall of $squares (got " . json_encode($fall($shape, 1, 4)) . ')');
    bankCheck($fall($shape, 1, 4, 'walk', [['column'=>2, 'row'=>1], ['column'=>3, 'row'=>1]]) === $squares, "The same walk drawn square by square is a fall of $squares");
}
echo "PASS a face is the same height coming down as it is going up\n";

// Under the two-square climb line nothing new becomes a fall.
foreach ([
    'a 1.4-high bank' => profile([[2.6, 1.4], [3.4, 0]]),
    'a 1.2-high bank' => profile([[2.6, 1.2], [3.4, 0]]),
    'a one-square slope' => profile([[2.5, 1.0], [3.5, 0]]),
    'a long hill dropping four squares over ten' => profile([[1, 4], [11, 0]]),
    'flat ground' => profile([[0, 0], [12, 0]]),
] as $name => $shape) {
    bankCheck($fall($shape, 2, 3) === null, "Stepping down $name is a plain step, not a fall (got " . json_encode($fall($shape, 2, 3)) . ')');
    bankCheck($fall($shape, 1, 4) === null, "Walking down $name is not a fall");
}
// A sheer one-square ledge was already a one-square fall (no damage, no pop-up) and still is.
bankCheck($fall(profile([[2.95, 1.1], [3.05, 0]]), 2, 3) === 1, 'A sheer 1.1-high ledge is still a one-square drop');
// Teleports and fliers are untouched.
bankCheck($fall(profile([[2.6, 1.9], [3.4, 0]]), 2, 3, 'teleport') === null, 'A teleport is never a fall');
echo "PASS below the climb line, and for teleports, nothing changed\n";
