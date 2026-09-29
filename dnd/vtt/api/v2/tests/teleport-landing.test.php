<?php
require __DIR__.'/../../../lib/SyncV2Store.php';
function tpCheck($ok,$why){if(!$ok)throw new RuntimeException($why);}
$config=['mapLevels'=>['levels'=>[['id'=>'upper','elevationSquares'=>5]]]];
$config['environment']['terrain']['value']=['n'=>2,'m'=>2,'h'=>[1,1,1,1],'bounds'=>['left'=>0,'top'=>0,'width'=>10,'height'=>10]];
$config['environment']['walls']['value']['roofs']=[['id'=>'roof','kind'=>'roof','levelId'=>'level-0','height'=>4,'points'=>[['x'=>3,'y'=>0],['x'=>5,'y'=>0],['x'=>5,'y'=>3],['x'=>3,'y'=>3]]]];
$from=['id'=>'pc','column'=>0,'row'=>0,'levelId'=>'upper'];$to=[...$from,'column'=>1];
$r=TeleportLanding::resolve($from,$to,$config,['height'=>1,'range'=>5],false);tpCheck($r['placement']['levelId']==='level-0'&&$r['fall']===null&&$r['distance']==4,'Height 5 to height 1 arrives without falling');
$high=[...$from,'movementMode'=>'fly','flightHeight'=>10];
try{TeleportLanding::resolve($high,$to,$config,['height'=>1,'range'=>5],false);throw new RuntimeException('Range bypass');}catch(InvalidArgumentException $e){}
$override=TeleportLanding::resolve($high,[...$to,'movementMode'=>'fly'],$config,['height'=>1,'range'=>5,'allowOutOfRange'=>true],false);
tpCheck($override['placement']['flightHeight']===1&&$override['distance']==9,'Player may explicitly choose a red out-of-range destination');
$custom=TeleportLanding::resolve([...$high,'flightHeight'=>1],[...$to,'movementMode'=>'fly'],$config,['height'=>9,'range'=>3,'allowOutOfRange'=>true],false);
tpCheck($custom['placement']['flightHeight']===9,'Custom displayed height 10 is accepted beyond ability range');
$config['mapLevels']['levels'][0]['elevationSquares']=10;
$r=TeleportLanding::resolve($from,$to,$config,['height'=>5,'range'=>5],false);tpCheck($r['fall']['squares']===4,'Grounded airborne arrival falls to ground');
$r=TeleportLanding::resolve($high,[...$to,'movementMode'=>'fly'],$config,['height'=>5,'range'=>5],false);tpCheck($r['fall']===null&&$r['placement']['flightHeight']===5,'Flying arrival remains airborne');
$r=TeleportLanding::resolve([...$from,'levelId'=>'level-0'],[...$to,'column'=>3],$config,['height'=>4,'range'=>5],false);tpCheck($r['placement']['_supportSurfaceId']==='roof'&&WallMovement::height($r['placement'],$config)===4.,'Explicit roof landing has actual support');
$r2=FloorGeometry::move($r['placement'],[...$r['placement'],'row'=>1],$config['mapLevels'],'walk',[],$config['environment']['walls']['value']['roofs']);tpCheck($r2['cause']===null,'Walking on roof remains supported');
$terrain=[];foreach([.3,1,1.5,2,4] as $rise)$terrain[]=TerrainContact::first(['column'=>0,'row'=>0],['column'=>4,'row'=>0],fn($x,$y)=>$rise*max(0,min(1,($x-1.375)/.125)));
echo json_encode(['terrainContacts'=>$terrain]);

$plate=['id'=>'basement','kind'=>'floor','levelId'=>'level-0','height'=>0,'points'=>[['x'=>0,'y'=>0],['x'=>8,'y'=>0],['x'=>8,'y'=>8],['x'=>0,'y'=>8]]];
$c=['mapLevels'=>['levels'=>[]],'environment'=>['terrain'=>['value'=>['n'=>2,'m'=>2,'h'=>[-.125,-.125,-.125,-.125],'bounds'=>['left'=>0,'top'=>0,'width'=>10,'height'=>10]]],'walls'=>['value'=>['roofs'=>[$plate]]]]];
$p=['column'=>2,'row'=>2,'levelId'=>'level-0','width'=>1,'height'=>1];
$choices=TeleportLanding::surfaces($p,$c,false);tpCheck(count($choices)===1&&$choices[0]['surfaceId']==='basement','Near-flush terrain is replaced by authored basement landing');
$r=TeleportLanding::resolve($p,$p,$c,['height'=>-.125],false);tpCheck($r['placement']['_supportSurfaceId']==='basement'&&$r['fall']===null,'Old terrain-height request resolves to the accessible basement floor');
$c['environment']['terrain']['value']['h']=[-2,-2,-2,-2];tpCheck(count(TeleportLanding::surfaces($p,$c,false))===2,'Real underfloor space remains reachable');
$c['environment']['terrain']['value']['h']=[-.125,-.125,-.125,-.125];
$c['environment']['walls']['value']['roofs'][0]['holes']=[[['x'=>1,'y'=>1],['x'=>4,'y'=>1],['x'=>4,'y'=>4],['x'=>1,'y'=>4]]];
$choices=TeleportLanding::surfaces($p,$c,false);tpCheck(count($choices)===1&&$choices[0]['surfaceId']===null,'Hole retains terrain access');
