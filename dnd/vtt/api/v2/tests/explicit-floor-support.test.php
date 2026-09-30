<?php
declare(strict_types=1);
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function floorPatchCheck(bool $ok,string $message):void {if(!$ok)throw new RuntimeException($message);}
$db=sys_get_temp_dir().'/vtt-explicit-floor-'.bin2hex(random_bytes(8)).'.sqlite';
try {
 $ring=[['x'=>0,'y'=>0],['x'=>10,'y'=>0],['x'=>10,'y'=>10],['x'=>0,'y'=>10]];
 $config=['mapLevels'=>['levels'=>[['id'=>'lower','zIndex'=>0,'elevationSquares'=>2],['id'=>'upper','zIndex'=>1,'elevationSquares'=>4],['id'=>'roof','zIndex'=>2,'elevationSquares'=>6],['id'=>'legacy','zIndex'=>3,'elevationSquares'=>8]]],
 'environment'=>['walls'=>['value'=>['version'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[
 ['id'=>'plate-lower','kind'=>'floor','levelId'=>'lower','height'=>2,'points'=>$ring],
 ['id'=>'plate-upper','kind'=>'floor','levelId'=>'upper','height'=>4,'points'=>$ring],
 ['id'=>'plate-roof','kind'=>'roof','levelId'=>'roof','height'=>6,'points'=>$ring]]]]]];
 $hero=['id'=>'hero','name'=>'Elowin','team'=>'ally','column'=>2,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'lower'];
 $store=new SyncV2Store($db);$board=['placements'=>['scene'=>[$hero],'untouched'=>[['id'=>'other','column'=>1,'row'=>1]]],'sceneState'=>['scene'=>$config]];
 $store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
 $s=$store->getSnapshot();$store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'floor-env','sceneId'=>'scene','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$config['environment']['walls']['value']]],'GM',true);
 $seq=0;$patch=function(array $patch,?array $choice=null)use(&$store,&$seq){$s=$store->getSnapshot();$action=['kind'=>'patch','sceneId'=>'scene','placementId'=>'hero','entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'patch'=>$patch];if($choice!==null){$action['movementKind']='teleport';$action['teleportChoice']=$choice;}
 $command=['type'=>'placement.batch','operationId'=>'floor-patch-'.++$seq,'baseRevision'=>$s['revision'],'payload'=>['actions'=>[$action]]];return [$store->acceptPlacementBatch($command,'GM',true),$command];};
 $patch(['column'=>2,'row'=>2],['height'=>2]);
 $before=$store->getSnapshot();floorPatchCheck($before['state']['placements']['scene']['hero']['_supportSurfaceId']==='plate-lower','Initial lower floor is retained');
 $patch(['column'=>2,'row'=>2],['height'=>6]);
 floorPatchCheck($store->getSnapshot()['state']['placements']['scene']['hero']['_supportSurfaceId']==='plate-roof','Teleport retains authored rooftop');
 $patch(['levelId'=>'roof']);
 floorPatchCheck($store->getSnapshot()['state']['placements']['scene']['hero']['_supportSurfaceId']==='plate-roof','Redundant same-level patch preserves rooftop support');
 foreach([['upper','plate-upper',4],['lower','plate-lower',2],['roof',null,6],['legacy',null,8],['upper','plate-upper',4]] as [$id,$support,$height]){
  [$result,$command]=$patch(['levelId'=>$id]);$s=$store->getSnapshot();$p=$s['state']['placements']['scene']['hero'];
  floorPatchCheck($p['levelId']===$id&&($p['_supportSurfaceId']??null)===$support,'Floor-only patch reconciles physical support '.$id);
  floorPatchCheck(WallMovement::height($p,$config)===$height*1.,'Correct canonical height '.$id);
  floorPatchCheck(($p['_floorTraversal']??null)===null&&$p['column']===2&&$p['row']===2,'No position/traversal mutation');
  floorPatchCheck($store->acceptPlacementBatch($command,'GM',true)['idempotent'],'Identical transport retry remains idempotent');
  floorPatchCheck($store->getSnapshot()===$s,'Retry does not mutate state');
 }
 $after=$store->getSnapshot();floorPatchCheck($after['state']['placements']['untouched']===$before['state']['placements']['untouched'],'Other scene preserved');
 $pdo=new PDO('sqlite:'.$db);floorPatchCheck((new CollisionEffects($pdo,'default'))->list('GM',true)===[],'Manual floor arrows never manufacture fall receipts');unset($pdo);
 unset($store);$store=new SyncV2Store($db);$p=$store->getSnapshot()['state']['placements']['scene']['hero'];floorPatchCheck($p['_supportSurfaceId']==='plate-upper'&&WallMovement::height($p,$config)===4.,'Reopened canonical store keeps correct support');
 $patch(['movementMode'=>'fly','flightHeight'=>10]);
 $patch(['levelId'=>'lower','conditions'=>[['name'=>'Prone']]]);
 $p=$store->getSnapshot()['state']['placements']['scene']['hero'];
 floorPatchCheck($p['movementMode']==='ground','A mixed floor/condition edit still interrupts ordinary flight');
 $pdo=new PDO('sqlite:'.$db);$effects=(new CollisionEffects($pdo,'default'))->list('GM',true);
 floorPatchCheck(count($effects)===1,'Interrupted flight keeps exactly one real fall receipt');unset($pdo);
 echo "PASS explicit floor-only support reconciliation, heights, no fall, retry and reload\n";
}finally{unset($patch,$store,$pdo);foreach(['','-wal','-shm'] as $suffix)if(is_file($db.$suffix))unlink($db.$suffix);}
