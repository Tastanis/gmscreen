<?php
declare(strict_types=1);
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function checkWall(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
$model=['version'=>1,'nodes'=>[['id'=>'a','x'=>3,'y'=>1],['id'=>'b','x'=>3,'y'=>5]],'segments'=>[['id'=>'wall','a'=>'a','b'=>'b','baseMode'=>'fixed','base'=>0,'height'=>2]]];
$config=['environment'=>['walls'=>['revision'=>1,'value'=>$model]]];
$from=['column'=>1,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0','team'=>'ally'];$to=[...$from,'column'=>4];
function allowedWall(array $from,array $to,array $config,string $kind='walk',array $path=[],bool $gm=false): bool {
    try{WallMovement::assertAllowed($from,$to,$config,$kind,$path,$gm);return true;}catch(InvalidArgumentException $e){return false;}
}
foreach(['walk','shift','forced'] as $kind)checkWall(!allowedWall($from,$to,$config,$kind),$kind.' cannot cross a closed wall');
checkWall(allowedWall($from,$to,$config,'teleport'),'Teleport skips walls');
checkWall(allowedWall($from,$to,$config,'walk',[],true),'Preserve GM walk override');
checkWall(!allowedWall($from,$to,$config,'forced',[],true),'GM forced movement collides');
checkWall(allowedWall($from,$to,$config,'walk',[['column'=>1,'row'=>6],['column'=>4,'row'=>6]]),'Legal detour follows waypoints');
checkWall(!allowedWall($from,[...$from,'row'=>3],$config,'walk',[['column'=>4,'row'=>2]]),'Illegal detour cannot use clear endpoints');
checkWall(allowedWall($from,[...$from,'column'=>2],$config),'Touching wall is allowed');
checkWall(allowedWall([...$from,'column'=>2],[...$from,'column'=>2,'row'=>4],$config),'Slide along wall');
checkWall(!allowedWall([...$from,'width'=>2],[...$to,'column'=>2],$config),'Large footprint clips wall before center');
checkWall(allowedWall([...$from,'movementMode'=>'fly','flightHeight'=>3],$to,$config),'Flight above wall');
checkWall(!allowedWall([...$from,'movementMode'=>'fly','flightHeight'=>1],$to,$config),'Low flight blocked');
$upper=$config;$upper['mapLevels']=['levels'=>[['id'=>'upper','elevationSquares'=>5]]];
checkWall(allowedWall([...$from,'levelId'=>'upper'],$to,$upper),'Upper floor clears lower wall');
foreach(['door','window'] as $interaction){$open=$config;$open['environment']['walls']['value']['segments'][0]+=['interaction'=>$interaction,'open'=>true];checkWall(allowedWall($from,$to,$open),'Open '.$interaction.' passable');}
$oneway=$config;$oneway['environment']['walls']['value']['segments'][0]['movementDirection']='left';
checkWall(!allowedWall($from,$to,$oneway)&&allowedWall($to,$from,$oneway),'Directional wall');
$ramp=['left'=>1,'right'=>3,'top'=>1,'bottom'=>7,'base'=>0,'height'=>6,'direction'=>'north','fromLevel'=>'level-0','toLevel'=>'upper'];
$rampConfig=$config;$rampConfig['environment']['walls']['value']['ramps']=[$ramp];
checkWall(abs(WallMovement::height([...$from,'column'=>1,'row'=>3,'_floorTraversal'=>['entry'=>'red']],$rampConfig)-3.5)<1e-7,'Climbing token uses ramp plane');
checkWall(WallMovement::height([...$from,'column'=>1,'row'=>3,'_floorTraversal'=>['entry'=>'barrier']],$rampConfig)===0.,'Under stair token stays at terrain');

// Store integration: failure is atomic, doors are checked from current state, and batches cannot bypass it.
$database=sys_get_temp_dir().'/wall-movement-'.bin2hex(random_bytes(8)).'.sqlite';
try{
 $store=new SyncV2Store($database);
 $store->migrateLegacyPlacements(['placements'=>['scene'=>[[...$from,'id'=>'pc'],[...$from,'id'=>'other','row'=>7]]]]);
 $snap=$store->getSnapshot();
 $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'wall-create-001','sceneId'=>'scene','baseRevision'=>$snap['revision'],'entityRevision'=>0,'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$model]],'GM',true);
 $before=$store->getSnapshot();
 $move=['type'=>'token.move','operationId'=>'wall-blocked-001','sceneId'=>'scene','entityId'=>'pc','baseRevision'=>$before['revision'],'entityRevision'=>$before['state']['placements']['scene']['pc']['_entityRevision']??0,'payload'=>['column'=>4,'row'=>2]];
 try{$store->acceptTokenMove($move,'cal',false);throw new RuntimeException('Direct API bypassed wall');}catch(InvalidArgumentException $e){checkWall(str_contains($e->getMessage(),'blocked'),'Expected collision error');}
 checkWall($store->getSnapshot()===$before,'Rejection leaves all canonical state unchanged');
 $actions=[];foreach(['other','pc'] as $id)$actions[]=['kind'=>'patch','sceneId'=>'scene','placementId'=>$id,'entityRevision'=>$before['state']['placements']['scene'][$id]['_entityRevision']??0,'movementKind'=>'shift','patch'=>['column'=>4]];
 try{$store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'wall-batch-001','baseRevision'=>$before['revision'],'payload'=>['actions'=>$actions]],'cal',false);throw new RuntimeException('Batch bypassed wall');}catch(InvalidArgumentException $e){}
 checkWall($store->getSnapshot()===$before,'Later blocked batch member rolls back earlier legal member');
 $model['segments'][0]+=['interaction'=>'door','open'=>true];
 $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'wall-open-001','sceneId'=>'scene','baseRevision'=>$before['revision'],'entityRevision'=>$before['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>1,'value'=>$model]],'GM',true);
 $snap=$store->getSnapshot();$move['operationId']='wall-open-move';$move['baseRevision']=$snap['revision'];
 $result=$store->acceptTokenMove($move,'cal',false);checkWall($result['status']==='accepted','Newly opened canonical door allows movement');
 checkWall($store->acceptTokenMove($move,'cal',false)['idempotent'],'Accepted movement retry is idempotent');
 unset($store);$store=new SyncV2Store($database);$snap=$store->getSnapshot();checkWall($snap['state']['placements']['scene']['pc']['column']==4,'Movement survives DB reopen');
 $model['segments'][0]['open']=false;
 $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'wall-close-001','sceneId'=>'scene','baseRevision'=>$snap['revision'],'entityRevision'=>$snap['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>2,'value'=>$model]],'GM',true);
 $snap=$store->getSnapshot();$move['operationId']='wall-stale-client';$move['baseRevision']=$snap['revision'];$move['entityRevision']=$snap['state']['placements']['scene']['pc']['_entityRevision'];$move['payload']['column']=1;
 try{$store->acceptTokenMove($move,'cal',false);throw new RuntimeException('Stale client crossed closed door');}catch(InvalidArgumentException $e){}
 $move['operationId']='wall-teleport-001';$move['payload']['movementKind']='teleport';checkWall($store->acceptTokenMove($move,'cal',false)['status']==='accepted','Teleport crosses closed door through normal authority');
 echo "Wall movement: geometry, paths, portals, flight, stairs, atomic commands, batches and reload passed.\n";
}finally{unset($store);foreach(['','-wal','-shm'] as $suffix)if(is_file($database.$suffix))unlink($database.$suffix);}


// Yellow means at least 2 squares of uphill rise per grid step.
foreach([1,1.99,2,4] as $grade){
 $terrain=['environment'=>['terrain'=>['value'=>['n'=>2,'m'=>2,'h'=>[0,$grade*10,0,$grade*10],'bounds'=>['left'=>0,'top'=>0,'width'=>10,'height'=>10]]]]];
 checkWall(allowedWall($from,$to,$terrain,'forced')===($grade<2),'Yellow slope threshold '.$grade);
 checkWall(allowedWall($to,$from,$terrain,'forced'),'Downhill is not an uphill slam');
 checkWall(allowedWall($from,$to,$terrain,'teleport'),'Teleport skips slopes');
 checkWall(allowedWall($from,$to,$terrain,'walk'),'Voluntary move still climbs');
 $terrain['mapLevels']=['levels'=>[['id'=>'upper','elevationSquares'=>100]]];
 checkWall(allowedWall([...$from,'levelId'=>'upper'],$to,$terrain,'forced'),'Terrain below a solid upper floor does not slam its occupant');
}
echo "Yellow terrain threshold, downhill, voluntary movement, teleport and floor isolation passed.\n";

require __DIR__.'/wall-cubes.test.php';
require __DIR__.'/compiled-support.test.php';
