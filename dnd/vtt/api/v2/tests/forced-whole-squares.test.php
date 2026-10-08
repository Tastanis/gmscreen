<?php
declare(strict_types=1);
// A creature in the way stops a forced move on a whole square, at any angle.
// The numbers match forced-move-cells.test.mjs: browser and server must agree.
require_once __DIR__ . '/../../../lib/FloorGeometry.php';
require_once __DIR__ . '/../../../lib/ForcedMovement.php';
function wholeSquare(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$cal = ['id'=>'cal', 'column'=>22, 'row'=>18, 'width'=>1, 'height'=>1];
$cases = [
    // [intended destination, creature in the way, expected column, row, damage]
    [[26, 18], ['id'=>'b', 'column'=>24, 'row'=>18, 'width'=>1, 'height'=>1], 23, 18, 3],
    [[26, 20], ['id'=>'b', 'column'=>24, 'row'=>19, 'width'=>1, 'height'=>1], 23, 19, 3],
    [[25, 19], ['id'=>'b', 'column'=>24, 'row'=>18, 'width'=>2, 'height'=>2], 23, 18, 2],
    [[27, 16], ['id'=>'b', 'column'=>25, 'row'=>17, 'width'=>1, 'height'=>1], 24, 17, 3],
    [[23, 18], ['id'=>'b', 'column'=>23, 'row'=>18, 'width'=>1, 'height'=>1], 22, 18, 1],
];
foreach ($cases as [$to, $other, $column, $row, $damage]) {
    $result = ForcedMovement::resolve($cal, ['column'=>$to[0], 'row'=>$to[1]], [$cal, $other], []);
    $label = "to {$to[0]},{$to[1]}";
    wholeSquare(abs($result['column'] - $column) < 1e-9 && abs($result['row'] - $row) < 1e-9, "$label stops at $column,$row (got {$result['column']},{$result['row']})");
    wholeSquare($result['damage'] === $damage && $result['collidedIds'] === ['b'] && $result['wall'] === false, "$label deals $damage to each");
    // The server accepts the square the browser computed, and refuses a square between squares.
    ForcedMovement::plan($cal, [...$cal, 'column'=>$column, 'row'=>$row], ['column'=>$to[0], 'row'=>$to[1]], 'forced', [$cal, $other], []);
}
$refused = false;
try { ForcedMovement::plan($cal, [...$cal, 'column'=>23, 'row'=>18.5], ['column'=>26, 'row'=>20], 'forced', [$cal, ['id'=>'b', 'column'=>24, 'row'=>19, 'width'=>1, 'height'=>1]], []); }
catch (InvalidArgumentException $error) { $refused = true; }
wholeSquare($refused, 'A stop between squares is refused');
// Nothing in the way: the move is unchanged.
$clear = ForcedMovement::resolve($cal, ['column'=>25, 'row'=>20], [$cal], []);
wholeSquare(abs($clear['column'] - 25) < 1e-9 && abs($clear['row'] - 20) < 1e-9 && $clear['damage'] === 0, 'A clear forced move ends where it was aimed');
echo "PASS creature collisions stop on whole squares\n";
