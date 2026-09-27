<?php
declare(strict_types=1);
require __DIR__.'/../../../lib/SyncV2Store.php';
function reliability(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$db=sys_get_temp_dir().'/collision-'.bin2hex(random_bytes(8)).'.sqlite';
try{
 $s=new SyncV2Store($db);$s->migrateLegacyPlacements(['placements'=>['scene'=>[['id'=>'a','column'=>0,'row'=>0,'team'=>'ally'],['id'=>'b','column'=>3,'row'=>0,'team'=>'ally']]]]);
 $st=$s->getSnapshot();$move=['type'=>'token.move','operationId'=>'collision-test-001','sceneId'=>'scene','entityId'=>'a','baseRevision'=>$st['revision'],'entityRevision'=>0,'payload'=>['column'=>2,'row'=>0,'movementKind'=>'forced','forcedDestination'=>['column'=>5,'row'=>0]]];
 $r=$s->acceptTokenMove($move,'cal',false);reliability($r['status']==='accepted','Clipped endpoint accepted');
 $records=$s->collisionEffects(['operationId'=>'collision-test-001'],'cal',false);reliability(count($records)===2&&(int)$records[0]['amount']===3,'Canonical damage plan for both creatures');
 reliability($s->collisionEffects([],'sharon',false)===[],'Other actor cannot inspect claims');
 $request=['action'=>'start','operationId'=>'collision-test-001','targetId'=>'a'];
 reliability($s->collisionEffects($request,'cal',false,true)['granted'],'First execution reserved');
 reliability(!$s->collisionEffects($request,'cal',false,true)['granted'],'Duplicate never executes again');
 unset($s);$s=new SyncV2Store($db);
 reliability(!$s->collisionEffects($request,'cal',false,true)['granted'],'Reservation survives reopen');
 reliability($s->acceptTokenMove($move,'cal',false)['idempotent'],'Move retry creates no duplicate plan');
 reliability(count($s->collisionEffects([],'GM',true))===2,'GM can recover both unresolved targets');
 $s->collisionEffects([...$request,'action'=>'finish','status'=>'completed'],'cal',false,true);
 reliability(count($s->collisionEffects([],'GM',true))===1,'Completed target is omitted from recovery');
 // A stale collision preview must not move or register damage against a changed obstacle.
 $st=$s->getSnapshot();$s->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'move-blocker-away','baseRevision'=>$st['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'b','entityRevision'=>0,'movementKind'=>'teleport','patch'=>['column'=>9]]]]],'GM',true);
 $st=$s->getSnapshot();$move['operationId']='stale-collision-001';$move['baseRevision']=$st['revision'];$move['entityRevision']=$st['state']['placements']['scene']['a']['_entityRevision'];
 try{$s->acceptTokenMove($move,'cal',false);throw new RuntimeException('Stale collision accepted');}catch(InvalidArgumentException $e){}
 reliability($s->getSnapshot()===$st,'Stale collision rejection is atomic');
 $s->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'restore-blocker','baseRevision'=>$st['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'b','entityRevision'=>1,'movementKind'=>'teleport','patch'=>['column'=>3]]]]],'GM',true);
 $st=$s->getSnapshot();$move['operationId']='unclipped-forced-001';$move['baseRevision']=$st['revision'];$move['payload']=['column'=>5,'row'=>0,'movementKind'=>'forced'];
 try{$s->acceptTokenMove($move,'cal',false);throw new RuntimeException('Unclipped force accepted');}catch(InvalidArgumentException $e){}
 echo "Canonical creature collisions, stale previews, reservations, privacy and recovery passed.\n";
}finally{unset($s);foreach(['','-wal','-shm'] as $suffix)if(is_file($db.$suffix))unlink($db.$suffix);}
$surface=['kind'=>'floor','levelId'=>'upper','points'=>[['x'=>0,'y'=>0],['x'=>6,'y'=>0],['x'=>0,'y'=>6]],'holes'=>[[['x'=>1,'y'=>1],['x'=>3,'y'=>1],['x'=>3,'y'=>3],['x'=>1,'y'=>3]]]];
$levels=['levels'=>[['id'=>'upper','elevationSquares'=>4]]];
foreach([[1,1,'level-0'],[4,4,'level-0'],[3,1,'upper'],[5.5,0,'upper'],[6,0,'level-0']] as [$x,$y,$expected])reliability((FloorGeometry::fallingDestination(['column'=>$x,'row'=>$y,'levelId'=>'upper'],$levels,[$surface])??'upper')===$expected,'Polygon support '.$x.','.$y);
reliability(FloorGeometry::move(['column'=>0,'row'=>0,'levelId'=>'upper'],['column'=>3,'row'=>1],$levels,'teleport',[],[$surface])['levelId']==='upper','Teleport ignores intermediate hole and lands supported');
echo "Polygon footprint, hole, partial edge support and teleport landing passed.\n";

$ability=new SyncV2Store(':memory:');
$ability->migrateLegacyPlacements(['placements'=>['scene'=>[['id'=>'enemy','column'=>0,'row'=>0,'team'=>'enemy'],['id'=>'other','column'=>3,'row'=>0,'team'=>'ally']]]]);
$st=$ability->getSnapshot();
$command=['type'=>'placement.batch','operationId'=>'ability-collision-fire','baseRevision'=>$st['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'enemy','entityRevision'=>0,'movementKind'=>'forced','forcedDestination'=>['column'=>5,'row'=>0],'collisionDamageType'=>'fire','patch'=>['column'=>2,'row'=>0]]]]];
reliability($ability->acceptPlacementBatch($command,'cal',false)['status']==='accepted','Player ability retains enemy movement permission');
$records=$ability->collisionEffects(['operationId'=>'ability-collision-fire'],'cal',false);
reliability(count($records)===2&&$records[0]['damageType']==='fire'&&(int)$records[0]['amount']===3,'Ability collision records canonical amount and authored damage type');
$claim=$ability->collisionEffects(['action'=>'start','operationId'=>'ability-collision-fire','targetId'=>'enemy'],'cal',false,true);
reliability($claim['granted']&&$claim['damageType']==='fire','Damage adapter receives original damage type');
reliability($ability->acceptPlacementBatch($command,'cal',false)['idempotent'],'Ability movement transport replay retains the same records');
reliability(count($ability->collisionEffects(['operationId'=>'ability-collision-fire'],'GM',true))===2,'No duplicate ability damage after transport replay');
echo "Ability enemy movement, typed collision recovery and transport replay passed.\n";
