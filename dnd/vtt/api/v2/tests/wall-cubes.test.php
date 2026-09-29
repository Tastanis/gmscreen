<?php
// Included by wall-movement.test.php, which supplies the SQLite-enabled harness.
require_once __DIR__.'/../../../lib/WallCubes.php';
function cubeCheck(bool $ok,string $message):void {if(!$ok)throw new RuntimeException($message);}
$wall=['id'=>'cubes','type'=>'wall','levelId'=>'level-0','squares'=>[['column'=>3,'row'=>2],['column'=>3,'row'=>2,'elevation'=>1],['column'=>4,'row'=>2]]];
WallCubes::validate($wall);
$config=WallCubes::withTemplates([],[$wall]);
$from=['column'=>1,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0','team'=>'ally'];$to=[...$from,'column'=>5];
cubeCheck(count($config['environment']['walls']['value']['segments'])===12,'Every cube has four solid faces');
foreach(['walk','shift','forced'] as $kind)cubeCheck(!allowedWall($from,$to,$config,$kind),'Cube blocks '.$kind);
cubeCheck(!allowedWall([...$from,'movementMode'=>'fly','flightHeight'=>1],$to,$config),'Stack blocks low flight');
cubeCheck(allowedWall([...$from,'movementMode'=>'fly','flightHeight'=>2],$to,$config),'Flight touching top clears stack');
cubeCheck(allowedWall($from,[...$to,'row'=>3],$config,'walk',[['column'=>1,'row'=>3]]),'Adjacent detour clears cube faces');
$push=ForcedMovement::resolve($from,$to,[],$config);
cubeCheck($push['wall']&&$push['column']===2.&&$push['damage']===5,'Forced movement stops at cube and reports remaining-distance damage');
$landing=FloorSupport::landing([...$from,'column'=>3],FloorSupport::surfaces($config['environment']['walls']['value']),[],5,0);
cubeCheck($landing['height']===2.,'Descending flier lands on highest cube');
$standing=[...$from,'column'=>3,'_supportSurfaceId'=>$landing['id']];
cubeCheck(WallMovement::height($standing,$config)===2.,'Retained support uses cube top');
$bridge=WallCubes::withTemplates([],[[...$wall,'squares'=>[['column'=>3,'row'=>2,'elevation'=>1],['column'=>4,'row'=>2,'elevation'=>1],['column'=>5,'row'=>2,'elevation'=>1]]]]);
$bridgeSupport=FloorSupport::walkContact($standing,[...$standing,'column'=>5],[],FloorSupport::surfaces($bridge['environment']['walls']['value']),[],fn($p)=>0.);
cubeCheck(($bridgeSupport['id']??null)==='template-cube:cubes:5,2,1','Wide footprint transfers between touching same-height cube tops');
cubeCheck(allowedWall($standing,[...$standing,'column'=>5],$bridge),'Walking across connected same-height cube tops stays above solid volume');
$flushPlate=['id'=>'flush','kind'=>'floor','levelId'=>'level-0','height'=>2,'points'=>[['x'=>4,'y'=>2],['x'=>8,'y'=>2],['x'=>8,'y'=>3],['x'=>4,'y'=>3]]];
$joinedSurfaces=[...FloorSupport::surfaces($config['environment']['walls']['value']),$flushPlate];
$fromPlate=[...$standing,'column'=>5,'_supportSurfaceId'=>'flush'];
cubeCheck((FloorSupport::walkContact($fromPlate,$standing,[],$joinedSurfaces,[],fn($p)=>0.)['id']??null)===$standing['_supportSurfaceId'],'Flush native floor can walk onto touching cube top');
cubeCheck((FloorSupport::walkContact($standing,[...$standing,'column'=>5],[],$joinedSurfaces,[],fn($p)=>0.)['id']??null)==='flush','Cube top can walk onto touching flush native floor');
$lowerStep=[...$standing,'column'=>4];
cubeCheck(allowedWall($standing,$lowerStep,$config),'Can step down onto neighboring lower cube');
$contact=FloorGeometry::move($standing,$lowerStep,[],'walk',[],FloorSupport::surfaces($config['environment']['walls']['value']),fn($p)=>0.);
cubeCheck($contact['supportSurfaceId']==='template-cube:cubes:4,2,0','Step down retains lower cube top');
$nextLower=[...$lowerStep,'_supportSurfaceId'=>$contact['supportSurfaceId']];
cubeCheck(FallOutcome::plan($standing,$nextLower,$config,'walk')===null,'One-square step down follows normal non-falling threshold');
$step=[...$standing,'column'=>5,'_supportSurfaceId'=>null];
cubeCheck(FallOutcome::plan($standing,$step,$config,'walk')['squares']===2,'Leaving stack creates one two-square fall');
cubeCheck(FallOutcome::plan($step,[...$step,'column'=>6],$config,'walk')===null,'Next grounded move does not fall again');
$upper=WallCubes::withTemplates(['mapLevels'=>['levels'=>[['id'=>'upper','elevationSquares'=>5]]]],[[...$wall,'levelId'=>'upper']]);
cubeCheck(FloorSupport::supported([...$from,'levelId'=>'upper'],FloorSupport::surfaces($upper['environment']['walls']['value']))===null,'Cube does not turn legacy upper floor into bounded roof');
cubeCheck(FloorGeometry::move([...$from,'levelId'=>'upper'],[...$from,'column'=>2,'levelId'=>'upper'],$upper['mapLevels'],'walk',[],FloorSupport::surfaces($upper['environment']['walls']['value']))['levelId']==='upper','Existing upper floor remains supported beside cubes');
$raised=['environment'=>['walls'=>['value'=>['roofs'=>[['id'=>'plate','kind'=>'floor','levelId'=>'level-0','height'=>2,'points'=>[['x'=>2,'y'=>1],['x'=>6,'y'=>1],['x'=>6,'y'=>4],['x'=>2,'y'=>4]]]]]]]];
$raisedCube=WallCubes::withTemplates($raised,[$wall]);
cubeCheck($raisedCube['environment']['walls']['value']['segments'][0]['base']===2.,'Cube sits on authored plate above basement');
foreach([-1,.5,1001] as $invalid){try{WallCubes::validate([...$wall,'squares'=>[['column'=>3,'row'=>2,'elevation'=>$invalid]]]);throw new RuntimeException('Invalid elevation accepted');}catch(InvalidArgumentException $error){}}
try{WallCubes::validate([...$wall,'squares'=>[['column'=>3,'row'=>2],['column'=>3,'row'=>2,'elevation'=>0]]]);throw new RuntimeException('Duplicate accepted');}catch(InvalidArgumentException $error){}
try{WallCubes::assertDestination([...$from,'column'=>3],$config);throw new RuntimeException('Teleport landed inside cube');}catch(InvalidArgumentException $error){}
WallCubes::assertDestination($standing,$config);
$tall=WallCubes::withTemplates([],[[...$wall,'squares'=>[['column'=>3,'row'=>2,'elevation'=>2],['column'=>4,'row'=>2]]]]);
$tallStanding=[...$standing,'_supportSurfaceId'=>'template-cube:cubes:3,2,2'];
$drop=FloorGeometry::move($tallStanding,[...$tallStanding,'column'=>4],[],'walk',[],FloorSupport::surfaces($tall['environment']['walls']['value']),fn($p)=>0.);
$landed=[...$tallStanding,'column'=>4,'_supportSurfaceId'=>$drop['supportSurfaceId']];
cubeCheck($drop['cause']==='fall'&&FallOutcome::plan($tallStanding,$landed,$tall,'walk',[],$drop['cause'])['squares']===2,'Two-square cube step-down reports one fall to lower support');


$store=new SyncV2Store(':memory:');
$store->migrateLegacyPlacements(['placements'=>['cube-scene'=>[[...$from,'id'=>'pc','profileId'=>'cal']]]]);
$op=0;
$cubeCommand=function(string $type,array $payload)use($store,&$op):array{
 $snap=$store->getSnapshot();return $store->acceptBoardDomainCommand(['type'=>$type,'operationId'=>'cube-template-'.++$op,'sceneId'=>'cube-scene','entityId'=>'cubes','baseRevision'=>$snap['revision'],'entityRevision'=>$snap['state']['templates']['cube-scene']['cubes']['_entityRevision']??0,'payload'=>$payload],'GM',true);
};
$cubeCommand('template.upsert',['template'=>$wall]);
$move=function(array $payload,string $id='cube-move')use($store):array{
 $snap=$store->getSnapshot();return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'cube-scene','entityId'=>'pc','baseRevision'=>$snap['revision'],'entityRevision'=>$snap['state']['placements']['cube-scene']['pc']['_entityRevision']??0,'payload'=>$payload],'cal',false);
};
$before=$store->getSnapshot();
try{$store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'cube-batch-block','baseRevision'=>$before['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'cube-scene','placementId'=>'pc','entityRevision'=>$before['state']['placements']['cube-scene']['pc']['_entityRevision']??0,'movementKind'=>'shift','patch'=>['column'=>5]]]]],'cal',false);throw new RuntimeException('Batch bypassed cubes');}catch(InvalidArgumentException $error){}
cubeCheck($before===$store->getSnapshot(),'Blocked cube batch is atomic');
try{$move(['column'=>5,'row'=>2]);throw new RuntimeException('Canonical command bypassed template cube');}catch(InvalidArgumentException $error){}
cubeCheck($before===$store->getSnapshot(),'Cube rejection leaves revision and position unchanged');
$land=$move(['column'=>3,'row'=>2,'movementKind'=>'teleport','teleportChoice'=>['height'=>2]],'cube-land');
cubeCheck($store->getSnapshot()['state']['placements']['cube-scene']['pc']['_supportSurfaceId']===$landing['id'],'Canonical teleport retains cube top');
$heightPatch=function(array $patch,string $id)use($store):array{
 $snap=$store->getSnapshot();return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>$id,'baseRevision'=>$snap['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'cube-scene','placementId'=>'pc','entityRevision'=>$snap['state']['placements']['cube-scene']['pc']['_entityRevision']??0,'patch'=>$patch]]]],'cal',false);
};
$heightBefore=$store->getSnapshot();
try{$heightPatch(['movementMode'=>'fly','flightHeight'=>1],'cube-height-inside');throw new RuntimeException('Flight height placed inside solid cube');}catch(InvalidArgumentException $error){}
cubeCheck($heightBefore===$store->getSnapshot(),'Invalid interior flight-height change is atomic');
$heightPatch(['movementMode'=>'fly','flightHeight'=>3],'cube-height-above');
$heightPatch(['movementMode'=>'ground'],'cube-height-land');
cubeCheck($store->getSnapshot()['state']['placements']['cube-scene']['pc']['_supportSurfaceId']===$landing['id'],'Ground mode lands on highest cube beneath flier');
$leave=$move(['column'=>3,'row'=>0],'cube-leave');
$records=$store->collisionEffects(['operationId'=>'cube-leave'],'cal',false);
cubeCheck(count($records)===1&&$records[0]['details']['squares']===2,'Accepted move records exactly one fall');
$store->acceptTokenMove(['type'=>'token.move','operationId'=>'cube-leave','sceneId'=>'cube-scene','entityId'=>'pc','baseRevision'=>0,'entityRevision'=>0,'payload'=>['column'=>3,'row'=>0]],'cal',false);
cubeCheck(count($store->collisionEffects(['operationId'=>'cube-leave'],'cal',false))===1,'Transport retry does not duplicate fall');
$move(['column'=>6,'row'=>0],'cube-after-fall');
cubeCheck($store->collisionEffects(['operationId'=>'cube-after-fall'],'cal',false)===[],'Following grounded move has no second fall');
$cubeCommand('template.remove',[]);
$move(['column'=>1,'row'=>2],'cube-deleted-clear');
cubeCheck(empty($store->getSnapshot()['state']['sceneConfig']['cube-scene']['environment']['walls']['value']['segments']),'Derived geometry is not persisted after deletion');
// A linked floor transition must not persist the ephemeral cube model.
$snap=$store->getSnapshot();
$store->acceptBoardDomainCommand(['type'=>'levels.set','operationId'=>'cube-upper-floor','sceneId'=>'cube-scene','baseRevision'=>$snap['revision'],'entityRevision'=>$snap['state']['sceneConfig']['cube-scene']['_revision']??0,'payload'=>['mapLevels'=>['levels'=>[['id'=>'upper','zIndex'=>0,'elevationSquares'=>5]]]]],'GM',true);
$cubeCommand('template.upsert',['template'=>[...$wall,'levelId'=>'upper']]);
$move(['column'=>1,'row'=>2,'movementKind'=>'teleport','teleportChoice'=>['height'=>5]],'cube-floor-transition');
$scene=$store->getSnapshot()['state']['sceneConfig']['cube-scene'];
cubeCheck(($scene['userLevelState']['cal']['levelId']??null)==='upper','Linked viewer follows canonical floor transition');
cubeCheck(empty($scene['environment']['walls']['value']['segments']),'Linked transition never persists derived cube geometry');
$cubeCommand('template.remove',[]);
echo "Wall cubes: stacks, material-independent blockers, flight, forced movement, support, teleport, fall deduplication and deletion passed.\n";
