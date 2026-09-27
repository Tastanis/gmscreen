<?php
require __DIR__.'/../../../lib/SyncV2Store.php';
require __DIR__.'/../../../lib/SyncV2PusherTransport.php';
function eh($ok,$why){if(!$ok)throw new RuntimeException($why);}
$s=new SyncV2Store(':memory:');$events=[];
$send=function($type,$payload)use($s,&$events){$st=$s->getSnapshot();$r=$s->acceptBoardDomainCommand(['type'=>$type,'operationId'=>'handoff-'.count($events), 'sceneId'=>'s','baseRevision'=>$st['revision'],'entityRevision'=>$st['state']['sceneConfig']['s']['_revision']??0,'payload'=>$payload],'GM',true);$events[]=$r['event'];return $r['event'];};
$model=['version'=>1,'nodes'=>[['id'=>'a','x'=>0,'y'=>0],['id'=>'b','x'=>0,'y'=>5]],'segments'=>[['id'=>'door','a'=>'a','b'=>'b','interaction'=>'door','secret'=>true,'open'=>false]]];
$send('environment.set',['field'=>'walls','expectedRevision'=>0,'value'=>$model]);
$send('environment.set',['field'=>'terrain','expectedRevision'=>0,'value'=>['n'=>2,'m'=>2,'h'=>[0,0,0,0]]]);
$before=$s->getSnapshot();
$event=$send('environment.portal.set',['segmentId'=>'door','open'=>true,'expectedRevision'=>1]);
eh(strlen(json_encode($event))<1000,'Portal event under 1KB');eh(!isset($event['payload']['environment']),'No terrain in portal event');
$event=$send('environment.terrain.patch',['expectedRevision'=>1,'patch'=>['i0'=>1,'j0'=>0,'i1'=>1,'j1'=>1,'values'=>[2,3]]]);
eh($s->getSnapshot()['state']['sceneConfig']['s']['environment']['terrain']['value']['h']===[0,2,0,3],'Patch merged');
$safe=SceneEnvironment::project(['walls'=>['value'=>$model]]);eh($safe['walls']['value']['segments'][0]['interaction']==='none'&&!array_key_exists('secret',$safe['walls']['value']['segments'][0]),'Closed secret projected as wall');
$model['segments'][0]['open']=true;$safe=SceneEnvironment::project(['walls'=>['value'=>$model]]);eh($safe['walls']['value']['segments'][0]['interaction']==='door'&&!array_key_exists('secret',$safe['walls']['value']['segments'][0]),'Open secret projected as ordinary door');
$bad=$model;$bad['segments'][]=[...$bad['segments'][0],'id'=>'duplicate'];try{SceneEnvironment::validate('walls',$bad);throw new RuntimeException('Duplicate accepted');}catch(InvalidArgumentException $e){}
$large=[...$event,'payload'=>['data'=>str_repeat('x',20000)]];eh(SyncV2PusherTransport::boundedEvent($large)['type']==='sync.recoveryRequired','Oversized events use recovery notice');
eh(FloorSupport::supported(['column'=>0,'row'=>0,'levelId'=>'new'],[['kind'=>'floor','levelId'=>'other']])===null,'Unmodeled floor uses legacy support');
$env=['walls'=>['revision'=>2,'value'=>['roofs'=>[['levelId'=>'deleted'],['levelId'=>'keep']],'ramps'=>[['toLevel'=>'deleted']]]]];
$clean=SceneEnvironment::removeLevels($env,['deleted']);eh(count($clean['walls']['value']['roofs'])===1&&$clean['walls']['value']['ramps']===[]&&$clean['walls']['revision']===3,'Deleted level surfaces removed once');
echo json_encode(['before'=>$before,'events'=>array_slice($events,2),'after'=>$s->getSnapshot()]);
