<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/FloorGeometry.php';
function same($actual, $expected, string $message): void {
    if ($actual !== $expected) throw new RuntimeException($message . ': ' . json_encode($actual));
}
$stair = ['id'=>'stairs', 'direction'=>'up', 'linkedLevelId'=>'upper',
    'corners'=>[['column'=>2,'row'=>2],['column'=>4,'row'=>2],['column'=>4,'row'=>4],['column'=>2,'row'=>4]],
    'edgeColors'=>['2,2-3,2'=>'red','3,2-4,2'=>'red','2,4-3,4'=>'green','3,4-4,4'=>'green']];
$map = ['baseStairs'=>[$stair], 'levels'=>[['id'=>'upper','zIndex'=>0,'cutouts'=>[]]]];
$from = ['column'=>2,'row'=>0,'width'=>1,'height'=>1,'levelId'=>'level-0'];
$end = ['column'=>2,'row'=>4];
same(FloorGeometry::move($from, $end, $map)['levelId'], 'upper', 'Full stair traversal');
$first = FloorGeometry::move($from, ['column'=>2,'row'=>2], $map);
same($first['levelId'], 'level-0', 'Halfway remains on current floor');
$saved = json_decode(json_encode([...$from, 'row'=>2, '_floorTraversal'=>$first['traversal']]), true);
same(FloorGeometry::move($saved, $end, $map)['levelId'], 'upper', 'Traversal survives serialization/reload');
same(FloorGeometry::move($from, $end, $map, 'forced')['levelId'], 'level-0', 'Forced movement never climbs stairs');
same(FloorGeometry::move($from, $end, $map, 'teleport')['levelId'], 'level-0', 'Teleport never crosses intervening stairs');
same(FloorGeometry::move([...$from, 'row'=>2], $end, $map)['levelId'], 'level-0', 'Spawning inside is under stairs');
same(FloorGeometry::move([...$from, 'column'=>0,'row'=>2], ['column'=>4,'row'=>2], $map)['levelId'], 'level-0', 'Side entry is a barrier');
$changed = $map; $changed['baseStairs'][0]['edgeColors'] = [];
same(FloorGeometry::move($saved, $end, $changed)['levelId'], 'level-0', 'Edited stair invalidates saved progress');
$hidden = $map; $hidden['levels'][0]['hidden'] = true;
same(FloorGeometry::move($from, $end, $hidden)['levelId'], 'level-0', 'Hidden destination cannot be used');
$missing = $map; $missing['levels'] = [];
same(FloorGeometry::move($from, $end, $missing)['levelId'], 'level-0', 'Deleted destination cannot be used');
$reverse = [...$stair, 'direction'=>'down','linkedLevelId'=>'level-0'];
$map['levels'][0]['stairs'] = [$reverse];
same(FloorGeometry::move([...$from, 'row'=>4,'levelId'=>'upper'], ['column'=>2,'row'=>0], $map)['levelId'], 'level-0', 'Reverse descending traversal');

// Even-sized tokens can stop with their center exactly on the entry edge.
$large = [...$from, 'width'=>2,'height'=>2,'column'=>2,'row'=>0];
$onEdge = FloorGeometry::move($large, ['column'=>2,'row'=>1], $map);
$resume = [...$large, 'row'=>1,'_floorTraversal'=>$onEdge['traversal']];
same(FloorGeometry::move($resume, ['column'=>2,'row'=>4], $map)['levelId'], 'upper', 'Boundary entrance is not counted twice');

$hole = ['column'=>2,'row'=>2,'width'=>2,'height'=>2];
$floors = ['levels'=>[
    ['id'=>'hidden-mid','zIndex'=>0,'hidden'=>true,'cutouts'=>[]],
    ['id'=>'upper','zIndex'=>1,'cutouts'=>[$hole]],
]];
same(FloorGeometry::fallingDestination(['levelId'=>'upper','column'=>2,'row'=>2], $floors), 'level-0', 'Fall skips hidden intermediate floor');
same(FloorGeometry::fallingDestination(['levelId'=>'upper','column'=>2.5,'row'=>2,'width'=>2], $floors), null, 'Fractional partial support prevents fall');
same(FloorGeometry::fullyUnsupported(['column'=>2,'row'=>2,'width'=>2,'height'=>2], ['cutouts'=>[
    ['column'=>2,'row'=>2,'width'=>1,'height'=>2], ['column'=>3,'row'=>2,'width'=>1,'height'=>2],
]]), true, 'Adjacent cutouts jointly remove support');
same(FloorGeometry::fullyUnsupported(['column'=>2,'row'=>2,'width'=>3,'height'=>2], ['cutouts'=>[$hole]]), false, 'Large token remains supported');
same(FloorGeometry::move(['levelId'=>'upper','column'=>0,'row'=>2], ['column'=>2,'row'=>2], $floors, 'forced')['levelId'], 'level-0', 'Forced movement still falls');
echo "Floor geometry: 17 traversal, boundary, support and hidden/deleted-floor checks passed.\n";
