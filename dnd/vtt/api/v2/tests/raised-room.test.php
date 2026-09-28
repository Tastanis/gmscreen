<?php
declare(strict_types=1);
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function roomCheck(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
foreach([[2.,2.,2.],[2.,0.,2.],[2.,0.,1.9],[2.05,0.,2.],[0.,-2.,0.]] as [$outside,$inside,$height]){
 $db=sys_get_temp_dir().'/vtt-raised-room-'.bin2hex(random_bytes(8)).'.sqlite';
 try{
  $plate=['id'=>'plate','kind'=>'floor','levelId'=>'room','height'=>$height,'points'=>[['x'=>3,'y'=>0],['x'=>12,'y'=>0],['x'=>12,'y'=>6],['x'=>3,'y'=>6]]];
  $terrain=['n'=>15,'m'=>2,'bounds'=>['left'=>0,'top'=>0,'width'=>14,'height'=>6],'h'=>array_merge(array_fill(0,4,$outside),array_fill(0,11,$inside),array_fill(0,4,$outside),array_fill(0,11,$inside))];
  $config=['mapLevels'=>['levels'=>[['id'=>'room','elevationSquares'=>2,'zIndex'=>0,'cutouts'=>[]]]],'environment'=>['terrain'=>['value'=>$terrain],'walls'=>['value'=>['version'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[$plate]]]]];
  $hero=['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>1,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0'];
  $store=new SyncV2Store($db);$board=['placements'=>['scene'=>[$hero]],'sceneState'=>['scene'=>$config]];$store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);$seq=0;
  foreach($config['environment'] as $field=>$entry){$s=$store->getSnapshot();$store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'room-env-'.$field,'baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>$field,'expectedRevision'=>0,'value'=>$entry['value']]],'GM',true);}

  $patch=function($patch,$kind='teleport')use(&$store,&$seq){$s=$store->getSnapshot();return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'room-patch-'.++$seq,'baseRevision'=>$s['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'scene','placementId'=>'hero','entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'movementKind'=>$kind,'patch'=>$patch]]]],'GM',true);};
  foreach(['walk','shift','forced','batch'] as $kind){
   $patch(['column'=>1,'row'=>2,'levelId'=>'level-0','movementMode'=>'ground']);
   $s=$store->getSnapshot();
   if($kind==='batch')$patch(['column'=>8],'walk');
   else $store->acceptTokenMove(['type'=>'token.move','operationId'=>'room-move-'.++$seq,'sceneId'=>'scene','entityId'=>'hero','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'payload'=>['column'=>8,'row'=>2,'movementKind'=>$kind]],'cal',false);
   $t=$store->getSnapshot()['state']['placements']['scene']['hero'];roomCheck($t['levelId']==='room'&&$t['_supportSurfaceId']==='plate',"$kind canonical room support");roomCheck(abs(WallMovement::height($t,$config)-$height)<1e-6,'Exact physical plate height');
   unset($store);$store=new SyncV2Store($db);roomCheck($store->getSnapshot()['state']['placements']['scene']['hero']['_supportSurfaceId']==='plate','Support survives database reopen');
  }
  $pdo=new PDO('sqlite:'.$db);roomCheck((new CollisionEffects($pdo,'default'))->list('GM',true)===[],'Walking into the room never creates a basement fall');unset($pdo);
  $blockedConfig=$config;$blockedConfig['environment']['walls']['value']['nodes']=[['id'=>'a','x'=>10,'y'=>0],['id'=>'b','x'=>10,'y'=>6]];$blockedConfig['environment']['walls']['value']['segments']=[['id'=>'inside-wall','a'=>'a','b'=>'b','baseMode'=>'fixed','base'=>$height,'height'=>3]];
  foreach([[],[['column'=>8,'row'=>2]]] as $path){$blocked=false;try{WallMovement::assertAllowed($hero,[...$hero,'column'=>11],$blockedConfig,'walk',$path,false);}catch(InvalidArgumentException $e){$blocked=true;}roomCheck($blocked,'Room support never passes under an interior wall, including waypoints');}
  $patch(['levelId'=>'level-0','movementMode'=>'fly','flightHeight'=>3]);$patch(['movementMode'=>'ground']);
  $t=$store->getSnapshot()['state']['placements']['scene']['hero'];roomCheck($t['levelId']==='room'&&$t['_supportSurfaceId']==='plate','Flight lands on highest plate below');
  $patch(['levelId'=>'level-0','movementMode'=>'fly','flightHeight'=>3]);$patch(['conditions'=>['Prone']]);
  $t=$store->getSnapshot()['state']['placements']['scene']['hero'];roomCheck($t['levelId']==='room'&&$t['movementMode']==='ground','Interrupted flight lands on room');
 }finally{unset($pdo,$patch,$store);gc_collect_cycles();foreach([$db,$db.'-wal',$db.'-shm'] as $f)if(is_file($f))unlink($f);}
}
echo "Raised room canonical walk/shift/forced/batch, reload and flight landing passed.\n";
