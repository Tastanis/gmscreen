<?php
declare(strict_types=1);
// A token wider than a stair, or standing to one side of it, still uses the stair.
// Before, a size 2 token's centre ran along the side line of a one-square-wide stair
// and it never changed floor in either direction.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function stairCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

// One-square-wide stair running north: column 18, rows 20 to 22. Red (foot) at row 23's top edge, green (head) at row 20's.
$corners = [['column'=>18,'row'=>20],['column'=>19,'row'=>20],['column'=>19,'row'=>23],['column'=>18,'row'=>23]];
$colors = ['18,20-19,20'=>'green','18,23-19,23'=>'red'];
$levels = [
    'baseStairs'=>[['id'=>'s','direction'=>'up','linkedLevelId'=>'upper','corners'=>$corners,'edgeColors'=>$colors]],
    'levels'=>[['id'=>'upper','zIndex'=>1,'stairs'=>[['id'=>'s','direction'=>'down','linkedLevelId'=>'level-0','corners'=>$corners,'edgeColors'=>$colors]]]],
];
$token = static fn (float $column, float $row, int $size, string $level) => ['id'=>'t','column'=>$column,'row'=>$row,'width'=>$size,'height'=>$size,'levelId'=>$level,'team'=>'ally'];
$walk = static fn (array $from, float $column, float $row, array $map = null) => FloorGeometry::move($from, ['column'=>$column,'row'=>$row], $map ?? $levels);

// ---- one move the length of the stair
foreach ([[18, 1], [17, 2], [18, 2], [17, 3], [16, 3], [18, 3]] as [$column, $size]) {
    $up = $walk($token($column, 23, $size, 'level-0'), $column, 19 - ($size - 1));
    stairCheck($up['levelId'] === 'upper' && $up['cause'] === 'stairs', "A size $size token at column $column goes up the stair");
    $down = $walk($token($column, 19 - ($size - 1), $size, 'upper'), $column, 23);
    stairCheck($down['levelId'] === 'level-0' && $down['cause'] === 'stairs', "A size $size token at column $column comes down the stair");
}
echo "PASS large tokens climb and descend a one-square-wide stair\n";

// ---- square by square, with the progress carried between moves
foreach ([[18, 1], [17, 2], [18, 2]] as [$column, $size]) {
    $at = $token($column, 24, $size, 'level-0'); $changedAt = null;
    for ($row = 23; $row >= 17; $row--) {
        $result = $walk($at, $column, $row);
        if ($changedAt === null && $result['levelId'] === 'upper') $changedAt = $row;
        $at = [...$at, 'row'=>$row, 'levelId'=>$result['levelId'], '_floorTraversal'=>$result['traversal']];
    }
    stairCheck($at['levelId'] === 'upper' && $at['_floorTraversal'] === null, "A size $size token at column $column climbs one square at a time and is left with no stair progress");
    stairCheck($changedAt !== null && $changedAt <= 20, "It changes floor at the head of the stair, not before (changed at row $changedAt)");
}
echo "PASS square-by-square climbing carries its progress\n";

// ---- tokens that are not on the stair are left alone
foreach ([[19, 1], [16, 1], [20, 2], [15, 2]] as [$column, $size]) {
    $beside = $walk($token($column, 23, $size, 'level-0'), $column, 18);
    stairCheck($beside['levelId'] === 'level-0' && $beside['traversal'] === null, "A size $size token at column $column, beside the stair, stays on its floor");
}
// A size 2 token stepping sideways off the stair leaves it.
$on = $walk($token(17, 24, 2, 'level-0'), 17, 21);
stairCheck($on['traversal'] !== null && $on['traversal']['entry'] === 'red', 'Half-way up, the token is on the stair');
$off = $walk([...$token(17, 21, 2, 'level-0'), '_floorTraversal'=>$on['traversal']], 15, 21);
stairCheck($off['levelId'] === 'level-0' && $off['traversal'] === null, 'Stepping sideways off the stair ends the climb');
// Crossing the foot of the stair without climbing it changes nothing.
$across = $walk($token(15, 22, 2, 'level-0'), 20, 22);
stairCheck($across['levelId'] === 'level-0', 'Walking across the stair sideways does not change floor');
echo "PASS tokens beside or across the stair keep their floor\n";

// ---- the lane itself: only the across-the-stair coordinate moves, and a token that fits is unchanged
$stair = $levels['baseStairs'][0];
$lane = static fn (float $column, int $size) => FloorGeometry::stairLane([['x'=>$column + $size / 2, 'y'=>24.0]], $stair, (float) $size, (float) $size)[0];
stairCheck($lane(18, 1) === ['x'=>18.5, 'y'=>24.0], 'A size 1 token on the stair is unchanged');
stairCheck($lane(19, 1) === ['x'=>19.5, 'y'=>24.0], 'A size 1 token beside the stair is unchanged');
stairCheck($lane(17, 2) === ['x'=>18.5, 'y'=>24.0] && $lane(18, 2) === ['x'=>18.5, 'y'=>24.0], 'A size 2 token walks the stair by its column that is on it');
stairCheck($lane(20, 2) === ['x'=>21.0, 'y'=>24.0], 'A size 2 token clear of the stair is unchanged');

// ---- a stair running east, and a two-square-wide stair with a token one column off
$east = ['baseStairs'=>[['id'=>'e','direction'=>'up','linkedLevelId'=>'upper','corners'=>[['column'=>5,'row'=>8],['column'=>8,'row'=>8],['column'=>8,'row'=>9],['column'=>5,'row'=>9]],
    'edgeColors'=>['5,8-5,9'=>'red','8,8-8,9'=>'green']]], 'levels'=>[['id'=>'upper','zIndex'=>1]]];
foreach ([7, 8] as $row) stairCheck($walk($token(3, $row, 2, 'level-0'), 9, $row, $east)['levelId'] === 'upper', "A size 2 token at row $row climbs a stair running east");
stairCheck($walk($token(3, 8, 1, 'level-0'), 9, 8, $east)['levelId'] === 'upper', 'A size 1 token still climbs it');
stairCheck($walk($token(3, 9, 1, 'level-0'), 9, 9, $east)['levelId'] === 'level-0', 'A size 1 token beside it does not');
$wide = ['baseStairs'=>[['id'=>'w','direction'=>'up','linkedLevelId'=>'upper','corners'=>[['column'=>18,'row'=>20],['column'=>20,'row'=>20],['column'=>20,'row'=>23],['column'=>18,'row'=>23]],
    'edgeColors'=>['18,20-19,20'=>'green','19,20-20,20'=>'green','18,23-19,23'=>'red','19,23-20,23'=>'red']]], 'levels'=>[['id'=>'upper','zIndex'=>1]]];
foreach ([17, 18, 19] as $column) stairCheck($walk($token($column, 23, 2, 'level-0'), $column, 18, $wide)['levelId'] === 'upper', "A size 2 token at column $column climbs a two-square-wide stair");
stairCheck($walk($token(20, 23, 2, 'level-0'), 20, 18, $wide)['levelId'] === 'level-0', 'A size 2 token beside the wide stair does not');
echo "PASS stairs running east and wider stairs\n";
