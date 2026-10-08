<?php
declare(strict_types=1);
// A fall counts the nearest whole square, the same way a climb up the same face is counted
// (stepRise in terrain-math.mjs; the numbers below match climbing.test.mjs). Before, a fall
// rounded down, so one face read "climbs 4" going up and "fell 3" coming down.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function nearestCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

// A flier whose flight ends drops from its flight height to the ground at height 0.
$from = static fn (float $height) => ['id'=>'t', 'column'=>3, 'row'=>3, 'movementMode'=>'fly', 'flightHeight'=>$height];
$fall = static fn (float $height) => FallOutcome::plan($from($height), [...$from($height), 'movementMode'=>'ground'], [], 'forced');
foreach ([[0.5, null], [0.99, null], [1.0, 1], [1.1, 1], [1.35, 1], [1.49, 1], [1.5, 2], [1.71, 2], [1.9, 2], [2.0, 2], [2.49, 2], [3.75, 4], [4.0, 4], [7.0, 7]] as [$height, $squares]) {
    $plan = $fall($height);
    nearestCheck(($plan['squares'] ?? null) === $squares, "A drop of $height is " . ($squares === null ? 'no fall' : "$squares squares") . ' (got ' . json_encode($plan['squares'] ?? null) . ')');
}
echo "PASS a fall counts the nearest whole square\n";
