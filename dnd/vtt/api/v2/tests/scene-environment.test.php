<?php
require __DIR__.'/../../../lib/SyncV2Store.php';
$s=new SyncV2Store(':memory:');
$c=['type'=>'environment.set','sceneId'=>'test','operationId'=>'environment-test-1','baseRevision'=>0,'entityRevision'=>0,'payload'=>['field'=>'terrain','expectedRevision'=>0,'value'=>['n'=>2,'m'=>2,'h'=>[0,1,2,3]]]];
$r=$s->acceptBoardDomainCommand($c,'GM',true);if($r['status']!=='accepted')throw new Exception('accept');
if(!$s->acceptBoardDomainCommand($c,'GM',true)['idempotent'])throw new Exception('replay');
try{$s->acceptBoardDomainCommand($c,'cal',false);throw new Exception('player accepted');}catch(InvalidArgumentException $e){}
$c['operationId']='environment-test-2';$c['baseRevision']=1;$c['entityRevision']=1;
try{$s->acceptBoardDomainCommand($c,'GM',true);throw new Exception('stale accepted');}catch(InvalidArgumentException $e){}
if($s->getSnapshot()['revision']!==1)throw new Exception('stale mutated');
$c['payload']['expectedRevision']=1;$c['payload']['value']['h']=[0];
try{$s->acceptBoardDomainCommand($c,'GM',true);throw new Exception('invalid accepted');}catch(InvalidArgumentException $e){}
echo "PASS authority, idempotency, stale design and validation\n";

// Independent scene and document revisions prevent stale-tab overwrites.
$c['operationId']='scene-other';$c['sceneId']='other';$c['entityRevision']=0;$c['payload']['expectedRevision']=0;$c['payload']['value']=['n'=>2,'m'=>2,'h'=>[8,8,8,8]];
$s->acceptBoardDomainCommand($c,'GM',true);
if($s->getSnapshot()['state']['sceneConfig']['test']['environment']['terrain']['value']['h']!==[0,1,2,3])throw new Exception('Cross-scene contamination');
$c['operationId']='reset-fog';$c['sceneId']='test';$c['baseRevision']=2;$c['entityRevision']=1;$c['payload']=['field'=>'exploration','expectedRevision'=>0,'value'=>['resetId'=>'reset-test-123']];
$s->acceptBoardDomainCommand($c,'GM',true);
if($s->getSnapshot()['state']['sceneConfig']['test']['environment']['exploration']['value']['resetId']!=='reset-test-123')throw new Exception('Reset missing');

$s->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'add-owner-test','baseRevision'=>3,'payload'=>['actions'=>[['kind'=>'add','sceneId'=>'test','placementId'=>'owner-test','placement'=>['id'=>'owner-test','column'=>0,'row'=>0,'team'=>'ally','visionOwners'=>['cal']]]]]],'GM',true);
$before=$s->getSnapshot();
$bad=['type'=>'placement.batch','operationId'=>'steal-owner','baseRevision'=>$before['revision'],'payload'=>['actions'=>[['kind'=>'patch','sceneId'=>'test','placementId'=>'owner-test','entityRevision'=>1,'patch'=>['visionOwners'=>['sharon']]]]]];
try{$s->acceptPlacementBatch($bad,'cal',false);throw new Exception('Player changed owner');}catch(InvalidArgumentException $e){}
if($s->getSnapshot()!==$before)throw new Exception('Owner rejection changed state');

// Scene-wide automatic fog is GM-owned and independent of retired manual records.
$fogStore=new SyncV2Store(':memory:');
$fogCommand=['type'=>'fog.set','sceneId'=>'fog-test','operationId'=>'automatic-fog-off','baseRevision'=>0,'entityRevision'=>0,'payload'=>['fogOfWar'=>['automaticEnabled'=>false,'byLevel'=>['level-0'=>['enabled'=>true,'revealedCells'=>[]]]]]];
try{$fogStore->acceptBoardDomainCommand($fogCommand,'cal',false);throw new Exception('Player toggled automatic fog');}catch(InvalidArgumentException $e){}
if($fogStore->getSnapshot()['revision']!==0)throw new Exception('Player fog rejection mutated state');
$fogStore->acceptBoardDomainCommand($fogCommand,'GM',true);
$fogSnapshot=$fogStore->getSnapshot();
if($fogSnapshot['state']['sceneConfig']['fog-test']['fogOfWar']!==$fogCommand['payload']['fogOfWar'])throw new Exception('Automatic fog or legacy data lost');
if(!$fogStore->acceptBoardDomainCommand($fogCommand,'GM',true)['idempotent'])throw new Exception('Fog replay duplicated');
$fogCommand['operationId']='invalid-fog-boolean';$fogCommand['baseRevision']=1;$fogCommand['entityRevision']=1;$fogCommand['payload']['fogOfWar']['automaticEnabled']='false';
try{$fogStore->acceptBoardDomainCommand($fogCommand,'GM',true);throw new Exception('Invalid fog boolean accepted');}catch(InvalidArgumentException $e){}
if($fogStore->getSnapshot()!==$fogSnapshot)throw new Exception('Invalid fog changed state');
echo "PASS automatic fog authority, persistence, replay and validation\n";
