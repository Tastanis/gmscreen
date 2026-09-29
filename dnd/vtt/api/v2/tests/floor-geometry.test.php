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
same(FloorGeometry::move($from, $end, $map, 'teleport')['levelId'], 'upper', 'Teleport resolves the same stair landing as shift');
same(FloorGeometry::move($from, ['column'=>2,'row'=>2], $map, 'teleport'), $first, 'Teleport partway retains stair progress instead of jumping to the top');
same(FloorGeometry::move($saved, $end, $map, 'teleport')['levelId'], 'upper', 'Teleport resumes canonical stair progress');
same(FloorGeometry::move($from, ['column'=>0,'row'=>0], $map, 'teleport', [$end])['levelId'], 'level-0', 'Skipped teleport waypoints cannot change floors');
same(FloorGeometry::move([...$from,'movementMode'=>'fly'], $end, $map, 'teleport')['levelId'], 'level-0', 'Airborne teleport does not attach to stairs');
same(FloorGeometry::move([...$from, 'row'=>2], $end, $map)['levelId'], 'level-0', 'Spawning inside is under stairs');
same(FloorGeometry::move([...$from, 'column'=>0,'row'=>2], ['column'=>4,'row'=>2], $map)['levelId'], 'level-0', 'Side entry is a barrier');
$changed = $map; $changed['baseStairs'][0]['edgeColors'] = [];
same(FloorGeometry::move($saved, $end, $changed)['levelId'], 'level-0', 'Edited stair invalidates saved progress');
$hidden = $map; $hidden['levels'][0]['hidden'] = true;
same(FloorGeometry::move($from, $end, $hidden)['levelId'], 'level-0', 'Hidden destination cannot be used');
same(FloorGeometry::move($from, $end, $hidden, 'teleport')['levelId'], 'level-0', 'Teleport cannot reveal hidden floor');
$missing = $map; $missing['levels'] = [];
same(FloorGeometry::move($from, $end, $missing)['levelId'], 'level-0', 'Deleted destination cannot be used');
$reverse = [...$stair, 'direction'=>'down','linkedLevelId'=>'level-0'];
$map['levels'][0]['stairs'] = [$reverse];
same(FloorGeometry::move([...$from, 'row'=>4,'levelId'=>'upper'], ['column'=>2,'row'=>0], $map)['levelId'], 'level-0', 'Reverse descending traversal');

same(FloorGeometry::move([...$from, 'row'=>4,'levelId'=>'upper'], ['column'=>2,'row'=>0], $map, 'teleport')['levelId'], 'level-0', 'Teleport descends like shift');

// Even-sized tokens can stop with their center exactly on the entry edge.
$large = [...$from, 'width'=>2,'height'=>2,'column'=>2,'row'=>0];
$onEdge = FloorGeometry::move($large, ['column'=>2,'row'=>1], $map);
$resume = [...$large, 'row'=>1,'_floorTraversal'=>$onEdge['traversal']];
same(FloorGeometry::move($resume, ['column'=>2,'row'=>4], $map)['levelId'], 'upper', 'Boundary entrance is not counted twice');

$northLanding = [...$reverse, 'edgeColors'=>['2,2-3,2'=>'green','3,2-4,2'=>'green','2,4-3,4'=>'red','3,4-4,4'=>'red']];
same(FloorGeometry::crossing([['x'=>2.5,'y'=>2],['x'=>2.5,'y'=>5]],$northLanding)['fired'],true,'Turning back from the exact top edge descends');
same(FloorGeometry::crossing([['x'=>2.5,'y'=>2],['x'=>2.5,'y'=>5]],$northLanding,'barrier')['fired'],false,'Known under-stair traversal does not attach at the edge');

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
echo "Floor geometry: Traversal, teleport, boundary, support and hidden/deleted-floor checks passed.\n";

// Nearly flush terrain-to-paving contact, kept distinct from stairs and ceilings.
$plate=['id'=>'paving','kind'=>'floor','levelId'=>'paved','height'=>2,'points'=>[['x'=>2,'y'=>0],['x'=>10,'y'=>0],['x'=>10,'y'=>4],['x'=>2,'y'=>4]],'holes'=>[]];
$contactLevels=['levels'=>[['id'=>'paved','elevationSquares'=>2,'cutouts'=>[]]]];
$walker=['column'=>0,'row'=>1,'width'=>1,'height'=>1,'levelId'=>'level-0'];
$at=['column'=>3,'row'=>1];
same(FloorGeometry::move($walker,$at,$contactLevels,'walk',[],[$plate],fn($p)=>1.95416665)['levelId'],'paved','Terrain reacquires nearly flush paving');
same(FloorGeometry::move($walker,$at,$contactLevels,'walk',[],[$plate],fn($p)=>0.)['levelId'],'level-0','Walking below an overhead plate never acquires it');
same(FloorGeometry::move($walker,['column'=>8,'row'=>1],$contactLevels,'walk',[],[$plate],fn($p)=>$p['column']<3?1.95:0.)['levelId'],'paved','Retain the floor acquired at its nearly flush entrance over excavated terrain');
same(FloorGeometry::move($walker,['column'=>8,'row'=>1],$contactLevels,'teleport',[],[$plate],fn($p)=>$p['column']<3?1.95:0.)['levelId'],'level-0','Teleport never traverses an intermediate plate edge');
$holed=[...$plate,'holes'=>[[['x'=>3,'y'=>0],['x'=>5,'y'=>0],['x'=>5,'y'=>4],['x'=>3,'y'=>4]]]];
same(FloorGeometry::move($walker,$at,$contactLevels,'walk',[],[$holed],fn($p)=>1.95)['levelId'],'level-0','A hole has no contact support');
same(FloorGeometry::move([...$walker,'movementMode'=>'hover'],$at,$contactLevels,'walk',[],[$plate],fn($p)=>1.95)['levelId'],'level-0','Hover does not attach to paving');
$hidden=['levels'=>[[...$contactLevels['levels'][0],'hidden'=>true]]];
same(FloorGeometry::move($walker,$at,$hidden,'walk',[],[$plate],fn($p)=>1.95)['levelId'],'level-0','Hidden floors do not acquire tokens');

// Roof-only levels are bounded by their real roof polygon, including openings.
$roof=[...$plate,'id'=>'roof','kind'=>'roof','levelId'=>'roof','height'=>6];
$roofLevels=['levels'=>[['id'=>'roof','elevationSquares'=>6,'cutouts'=>[]],['id'=>'legacy','elevationSquares'=>8,'cutouts'=>[]]]];
same(FloorGeometry::fallingDestination(['column'=>11,'row'=>1,'levelId'=>'roof'],$roofLevels,[$roof]),'level-0','Outside an authored roof is unsupported even without cutouts');
same(FloorGeometry::fallingDestination(['column'=>3,'row'=>1,'levelId'=>'roof'],$roofLevels,[$roof]),null,'Inside roof retains support');
same(FloorGeometry::fallingDestination(['column'=>11,'row'=>1,'levelId'=>'legacy'],$roofLevels,[$roof]),null,'Genuinely unmodeled legacy levels retain their existing support');
same(FloorGeometry::move(['column'=>3,'row'=>1,'levelId'=>'roof'],['column'=>11,'row'=>1],$roofLevels,'walk',[],[$roof])['cause'],'fall','Walking off a roof falls');
$roofHole=[...$holed,'kind'=>'roof','levelId'=>'roof','height'=>6];
same(FloorGeometry::fallingDestination(['column'=>3,'row'=>1,'levelId'=>'roof'],$roofLevels,[$roofHole]),'level-0','Roof holes remain unsupported');
$nodeRoof=FloorSupport::surfaces(['nodes'=>[['id'=>'a','x'=>0,'y'=>0],['id'=>'b','x'=>4,'y'=>0],['id'=>'c','x'=>4,'y'=>4],['id'=>'d','x'=>0,'y'=>4]],'roofs'=>[['id'=>'nodeRoof','levelId'=>'roof','height'=>6,'nodes'=>['a','b','c','d']]]]);
same(FloorSupport::supported(['column'=>1,'row'=>1,'levelId'=>'roof'],$nodeRoof),true,'Node-authored roof interior supports');
same(FloorSupport::supported(['column'=>5,'row'=>1,'levelId'=>'roof'],$nodeRoof),false,'Node-authored roof exterior has no support');

// Raised rooms retain edge contact over sloped or excavated basements.
foreach ([['flush',2.,2.,2.],['slope',2.,0.,2.],['pit',2.,0.,2.],['lower plate',2.,0.,1.9],['higher outside',2.05,0.,2.],['negative basement',0.,-2.,0.]] as [$label,$outside,$inside,$floorHeight]) {
 $s=[...$plate,'height'=>$floorHeight];
 $terrain=fn($p)=>$p['column']<1.5?$outside:($label==='slope'?max($inside,$outside-($p['column']-1.5)/3):$inside);
 foreach(['walk','shift','forced'] as $kind){
  $r=FloorGeometry::move($walker,['column'=>8,'row'=>1],$contactLevels,$kind,[],[$s],$terrain);
  same($r['levelId'],'paved',"$label $kind enters room");same($r['supportSurfaceId'],'paving',"$label retains exact surface");
 }
 $land=FloorSupport::landing([...$walker,...$at],[$s],$contactLevels,3.,$inside);
 same($land['id'],'paving',"$label flier lands on plate");
}
same(FloorSupport::walkContact($walker,['column'=>8,'row'=>1],[],[$plate],$contactLevels,fn($p)=>$p['column']<.5?2.:0.),null,'Distant starting height cannot bridge a pit before the entrance');
same(FloorSupport::walkContact($walker,$at,[],[$plate],$contactLevels,fn($p)=>1.8),null,'A real step over tolerance is not acquired');
same(FloorSupport::landing([...$walker,...$at],[$plate],$contactLevels,1.,0.)['levelId'],'level-0','Flier below ceiling never lands above it');
same(FloorSupport::landing([...$walker,...$at],[$plate],$hidden,3.,0.)['levelId'],'level-0','Hidden floor is not a landing');
same(FloorSupport::landing([...$walker,...$at],[$holed],$contactLevels,3.,0.)['levelId'],'level-0','Landing respects holes');

$cutLevels=['levels'=>[['id'=>'paved','elevationSquares'=>2,'cutouts'=>[['column'=>3,'row'=>0,'width'=>2,'height'=>4]]]]];
same(FloorSupport::retained([...$walker,...$at,'_supportSurfaceId'=>'paving'],[$plate],$cutLevels),null,'Retained surface IDs cannot bridge floor cutouts');

$basement=[...$plate,'id'=>'basement','levelId'=>'level-0','height'=>0,'points'=>[['x'=>0,'y'=>0],['x'=>10,'y'=>0],['x'=>10,'y'=>10],['x'=>0,'y'=>10]]];
$down=[...$stair,'direction'=>'down','linkedLevelId'=>'level-0','edgeColors'=>['2,2-3,2'=>'green','3,2-4,2'=>'green','2,4-3,4'=>'red','3,4-4,4'=>'red']];
$basementMap=['levels'=>[['id'=>'upper','elevationSquares'=>2,'stairs'=>[$down]]]];
$stairsFrom=[...$from,'levelId'=>'upper'];
$stairsEnd=FloorGeometry::move($stairsFrom,$end,$basementMap,'walk',[],[$basement],fn($p)=>-.125);
same($stairsEnd['levelId'],'level-0','Stairs exit at basement level');same($stairsEnd['supportSurfaceId'],'basement','Stairs attach concrete base-level support');
$landed=[...$stairsFrom,...$end,'levelId'=>'level-0','_supportSurfaceId'=>'basement'];
same(FloorGeometry::move($landed,['column'=>5,'row'=>5],$basementMap,'walk',[],[$basement],fn($p)=>-.125)['supportSurfaceId'],'basement','Walking retains basement plate');
same(FloorSupport::terrainContact($landed,[$basement],$basementMap,-.125)['id'],'basement','Base floor contacts an eighth-square clearance');
same(FloorSupport::walkContact([...$landed,'_supportSurfaceId'=>null],['column'=>5,'row'=>5],[],[$basement],$basementMap,fn($p)=>-2.),null,'Sharing base-level label cannot attach an underpass occupant to its ceiling');
