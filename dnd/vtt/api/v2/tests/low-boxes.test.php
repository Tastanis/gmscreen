<?php
declare(strict_types=1);
// A low object that fills a square (a crate, a rim rock) is climbed onto on a yes, and stood on. Brandon,
// October 10, 2026: "We can treat full square boxes like railings. A full square box ... can be like one
// square up. You can still see over it ... it can be broken, and if you try to go over it, it gives you a one
// climb thing. But if you get like pushed, it can block your push ... if you go to move over it, it just says,
// want to climb? And you say, sure." The browser's side is in low-boxes.test.mjs.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function boxCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
// A ring of four wall pieces just inside one square, as the map packages make an object on a square.
function boxRing(string $name,float $column,float $row,float $base,float $height,array $extra=[],float $size=1.): array {
    $x0=$column+.04;$y0=$row+.04;$x1=$column+$size-.04;$y1=$row+$size-.04;
    $nodes=[['id'=>"$name-nw",'x'=>$x0,'y'=>$y0],['id'=>"$name-ne",'x'=>$x1,'y'=>$y0],['id'=>"$name-se",'x'=>$x1,'y'=>$y1],['id'=>"$name-sw",'x'=>$x0,'y'=>$y1]];
    $side=fn($id,$a,$b)=>['id'=>"$name-$id",'a'=>"$name-$a",'b'=>"$name-$b",'baseMode'=>'fixed','base'=>$base,'height'=>$height,'sight'=>'pass','movement'=>'block','material'=>'wood',...$extra];
    return ['nodes'=>$nodes,'segments'=>[$side('north','nw','ne'),$side('east','ne','se'),$side('south','se','sw'),$side('west','sw','nw')]];
}
function boxModel(array $parts,array $roofs=[]): array {
    $nodes=[];$segments=[];
    foreach($parts as $part){array_push($nodes,...$part['nodes']);array_push($segments,...$part['segments']);}
    return ['version'=>1,'nodes'=>$nodes,'segments'=>$segments,'roofs'=>$roofs];
}
function boxScene(array $parts,array $roofs=[],array $levels=[]): array {
    return ['mapLevels'=>['levels'=>$levels],'environment'=>['walls'=>['revision'=>1,'value'=>boxModel($parts,$roofs)]]];
}

// ---- which rings are boxes
$one=WallBoxes::boxes(boxModel([boxRing('crate',9,41,12,.57)]));
boxCheck(count($one)===1&&$one[0]['id']===WallBoxes::BOX_TOP.'crate-east'&&abs($one[0]['height']-12.57)<1e-9&&$one[0]['base']===12.&&abs($one[0]['left']-9.04)<1e-9&&abs($one[0]['bottom']-41.96)<1e-9,'A closed ring of four low wall pieces is a box, with its top at base plus height');
boxCheck(WallBoxes::BOX_HEIGHT===WallMovement::LOW_BARRIER,'A box is as tall as a low barrier may be');
boxCheck(count(WallBoxes::boxes(boxModel([boxRing('a',3,3,0,.86),boxRing('b',4,3,0,.86)])))===2,'Two boxes side by side are two boxes');
boxCheck(count(WallBoxes::boxes(boxModel([boxRing('font',9,9,0,1.,[],2.)])))===1,'One that fills two squares by two');
$none=function(array $ring,string $why){$model=boxModel([$ring]);boxCheck(WallBoxes::boxes($model)===[]&&WallBoxes::with($model)===$model,$why);};
$none(boxRing('pillar',3,3,0,1.2),'Taller than a square is no box');
$none(boxRing('door',3,3,0,.86,['interaction'=>'door']),'A ring of doors is no box');
$none(boxRing('ghost',3,3,0,.86,['movement'=>'pass']),'Walls that stop nothing make no box');
$none(boxRing('oneway',3,3,0,.86,['movementDirection'=>'left']),'One-way walls make no box');
$open=boxRing('open',3,3,0,.86);array_pop($open['segments']);$none($open,'Three sides are no box');
$mixed=boxRing('mixed',3,3,0,.86);$mixed['segments'][1]['height']=.5;$none($mixed,'Sides of different heights are no box');
$broken=boxRing('broken',3,3,0,.86);$broken['segments'][2]['broken']=true;$none($broken,'A box with a side broken through is no box');
$unset=boxRing('unset',3,3,0,.86);foreach($unset['segments'] as $i=>$s)unset($unset['segments'][$i]['height']);$none($unset,'A wall that gives no height is two squares');
$terrain=boxRing('terrain',3,3,0,.86,['baseMode'=>'terrain']);$none($terrain,'No fixed base to measure its top from');
echo "PASS a box is a closed ring of four plain low wall pieces of one height; nothing else is\n";

// ---- its top, and its walls
$island=['id'=>'mid','kind'=>'floor','levelId'=>'mid-level','height'=>12,'points'=>[['x'=>5,'y'=>38],['x'=>15,'y'=>38],['x'=>15,'y'=>46],['x'=>5,'y'=>46]],'holes'=>[]];
$levels=[['id'=>'mid-level','elevationSquares'=>12,'cutouts'=>[]]];
$worked=WallBoxes::with(boxModel([boxRing('rock',9,41,12,.57),boxRing('crate',30,30,0,1.)],[$island]));
$tops=array_values(array_filter($worked['roofs'],fn($roof)=>!empty($roof['boxTop'])));
boxCheck(count($tops)===2&&$tops[0]['levelId']==='mid-level'&&$tops[1]['levelId']==='level-0'&&$tops[0]['kind']==='floor'&&abs($tops[0]['height']-12.57)<1e-9&&$tops[1]['height']===1.,'Each box gets a top, on the floor it stands on');
boxCheck(count(array_filter($worked['segments'],fn($edge)=>!empty($edge['boxWall'])))===8&&$worked['roofs'][0]===$island,'Its four walls are marked, and the map\'s own plates are untouched');
boxCheck(FloorSupport::supported(['column'=>20,'row'=>20,'width'=>1,'height'=>1,'levelId'=>'level-0'],$worked['roofs'])===null,'A box top does not make the ground a bounded floor');
$config=boxScene([boxRing('crate',5,2,0,.86)]);$derived=WallCubes::withTemplates($config,[]);
boxCheck(count(array_filter($derived['environment']['walls']['value']['roofs'],fn($roof)=>!empty($roof['boxTop'])))===1&&!isset($config['environment']['walls']['value']['roofs'][0]),'The boxes are worked into the walls movement reads, not into what is stored');
echo "PASS a box gets a top to stand on and its walls are marked, in the worked model only\n";

// ---- the walls ask; a mover is not up on the box until they have let him in
$allowed=function(array $from,array $to,array $config,string $kind='walk',bool $climb=false,bool $gm=false): bool {
    try{WallMovement::assertAllowed($from,$to,WallCubes::withTemplates($config,[]),$kind,[],$gm,null,$climb);return true;}catch(InvalidArgumentException $e){return false;}
};
$hero=['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>4,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0'];$into=[...$hero,'column'=>5];
boxCheck(!$allowed($hero,$into,$config),'A walk into a box is refused until the walker says yes');
boxCheck($allowed($hero,$into,$config,'walk',true)&&$allowed($hero,$into,$config,'shift',true),'On yes he climbs onto it');
boxCheck($allowed($hero,[...$hero,'column'=>6],$config,'walk',true)&&!$allowed($hero,[...$hero,'column'=>6],$config),'A walk right across it is asked the same');
boxCheck(!$allowed($hero,$into,$config,'forced',true),'A push into a box hits it');
boxCheck($allowed($hero,$into,$config,'walk',false,true),'The Director\'s own walk passes, as always');
boxCheck(!$allowed($hero,$into,boxScene([boxRing('pillar',5,2,0,1.2)]),'walk',true),'A taller ring refuses either way');
$onTop=[...$into,'_supportSurfaceId'=>WallBoxes::BOX_TOP.'crate-east'];
boxCheck(abs(WallMovement::height($onTop,$derived)-.86)<1e-9,'On it he stands at its top');
boxCheck($allowed($onTop,[...$onTop,'column'=>6],$config)&&$allowed($onTop,[...$onTop,'column'=>4],$config),'From its top he steps off either way without being asked');
$pair=boxScene([boxRing('a',5,2,0,.86),boxRing('b',6,2,0,.86)]);
boxCheck($allowed([...$into,'_supportSurfaceId'=>WallBoxes::BOX_TOP.'a-east'],[...$into,'column'=>6],$pair),'And walks from one box onto the next of the same height');
$higher=boxScene([boxRing('a',5,2,0,.4),boxRing('b',6,2,0,1.)]);
boxCheck(!$allowed([...$into,'_supportSurfaceId'=>WallBoxes::BOX_TOP.'a-east'],[...$into,'column'=>6],$higher)&&$allowed([...$into,'_supportSurfaceId'=>WallBoxes::BOX_TOP.'a-east'],[...$into,'column'=>6],$higher,'walk',true),'A higher box beside it is asked again');
// A box on rough ground: Dead Root's rocks stand at the ground's height where they are, and the square beside one
// is a little lower or higher (one is 0.43 above its neighbour). A rail on a built floor keeps the strict rule.
foreach([.02,.43,WallMovement::BOX_FOOT] as $base){
    $rough=boxScene([boxRing('rock',5,2,$base,1.)]);
    boxCheck(!$allowed($hero,$into,$rough)&&$allowed($hero,$into,$rough,'walk',true),"A box whose base is $base above his feet is asked, and climbed on a yes");
    $on=FloorSupport::walkContact($hero,$into,[],FloorSupport::surfaces(WallCubes::withTemplates($rough,[])['environment']['walls']['value']),[],fn($p)=>0.);
    boxCheck(($on['id']??null)===WallBoxes::BOX_TOP.'rock-east',"And he stands on it (base $base)");
}
boxCheck(!$allowed($hero,$into,boxScene([boxRing('ledge',5,2,.6,1.)]),'walk',true),'A box 0.6 above his feet is not on his floor');
boxCheck(abs(FloorSupport::BOX_REACH-(WallMovement::LOW_BARRIER+WallMovement::BOX_FOOT))<1e-9,'Its top is reached from as far as its walls are low');
echo "PASS a box's walls ask like a rail, stop a push, and are nothing to whoever stands on its top\n";

// ---- through the store
$run=function(array $config,array $hero,callable $steps): void {
    $db=sys_get_temp_dir().'/vtt-low-box-'.bin2hex(random_bytes(8)).'.sqlite';
    try{
        $store=new SyncV2Store($db);$board=['placements'=>['scene'=>[$hero]],'sceneState'=>['scene'=>$config]];$store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
        $s=$store->getSnapshot();$store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'low-box-environment','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$config['environment']['walls']['value']]],'GM',true);
        $n=0;
        $move=function(array $payload,bool $gm=false)use(&$store,&$n): array {
            $s=$store->getSnapshot();$id='low-box-move-number-'.(++$n);$refused=null;
            try{$store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>'hero','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'payload'=>$payload],$gm?'GM':'cal',$gm);}
            catch(InvalidArgumentException $e){$refused=$e->getMessage();}
            $state=$store->getSnapshot()['state'];$p=$state['placements']['scene']['hero'];
            $falls=array_values(array_filter($store->collisionEffects(['operationId'=>$id],'GM',true),fn($r)=>$r['kind']==='fall'));
            return ['refused'=>$refused,'column'=>$p['column'],'level'=>$p['levelId']??'level-0','support'=>$p['_supportSurfaceId']??null,'height'=>WallMovement::height($p,WallCubes::withTemplates($state['sceneConfig']['scene'],$state['templates']['scene']??[])),'fall'=>$falls[0]['details']['squares']??null];
        };
        $steps($move);
    }finally{unset($store);@unlink($db);}
};
$walk=fn(int $column,int $row,bool $yes=false)=>['column'=>$column,'row'=>$row,'movementKind'=>'walk',...($yes?['climbLow'=>true]:[])];
$top=WallBoxes::BOX_TOP.'crate-east';
$run($config,$hero,function(callable $move)use($walk,$top){
    $r=$move($walk(5,2));boxCheck($r['refused']!==null&&str_contains($r['refused'],'blocked by a wall')&&$r['column']===4,'Without the answer the player\'s walk into the crate is refused and he stays');
    $r=$move($walk(5,2,true));boxCheck($r['refused']===null&&$r['column']===5&&$r['support']===$top&&abs($r['height']-.86)<1e-9,'With the answer he stands on the crate, at its top');
    $r=$move($walk(6,2));boxCheck($r['refused']===null&&$r['column']===6&&$r['support']===null&&$r['height']===0.&&$r['fall']===null,'He steps off the far side onto the ground: no question, and less than a square is no fall');
    $r=$move($walk(4,2,true));boxCheck($r['refused']===null&&$r['column']===4&&$r['support']===null,'A walk right across it, on a yes, ends on the ground beyond');
    $r=$move(['column'=>5,'row'=>2,'movementKind'=>'forced'],true);boxCheck($r['refused']!==null&&$r['column']===4,'A push into the crate is stopped by it');
    $r=$move($walk(5,2),true);boxCheck($r['refused']===null&&$r['support']===$top,'The Director\'s walk puts him on it without the question');
    $r=$move($walk(4,2),true);boxCheck($r['support']===null&&$r['height']===0.,'And off it');
    $r=$move(['column'=>5,'row'=>2,'movementKind'=>'teleport','teleportChoice'=>['height'=>0]]);boxCheck($r['refused']===null&&$r['support']===$top&&abs($r['height']-.86)<1e-9,'A teleport into its square lands on its top, not on the floor inside it');
});
echo "PASS through the store: refused without the yes, on its top with it, off again, a push stopped, a teleport on top\n";

// A box exactly one square high: stepping off it is a drop of one square, as off any ledge that high.
$run(boxScene([boxRing('crate',5,2,0,1.)]),$hero,function(callable $move)use($walk,$top){
    $r=$move($walk(5,2,true));boxCheck($r['support']===$top&&$r['height']===1.,'Exactly one square high is still a box');
    $r=$move($walk(6,2));boxCheck($r['column']===6&&$r['height']===0.&&$r['fall']===1,'Stepping off a box one square high is a drop of one square');
});
echo "PASS a box one square high is climbed, and stepping off it is a drop of one\n";

// ---- a rim rock on an island: onto it from the island, back onto the island, or over the edge
$rim=boxScene([boxRing('rock',5,41,12,.57)],[$island],$levels);$rock=WallBoxes::BOX_TOP.'rock-east';
$islander=[...$hero,'column'=>7,'row'=>41,'levelId'=>'mid-level','_supportSurfaceId'=>'mid'];
$run($rim,$islander,function(callable $move)use($walk,$rock){
    $r=$move($walk(6,41));boxCheck($r['support']==='mid'&&$r['height']===12.,'Beside the rock he is on the island');
    $r=$move($walk(5,41));boxCheck($r['refused']!==null&&$r['column']===6,'The rim rock refuses a walk without the answer');
    $r=$move($walk(5,41,true));boxCheck($r['refused']===null&&$r['support']===$rock&&$r['level']==='mid-level'&&abs($r['height']-12.57)<1e-9,'With it he stands on the rock, still on the island\'s floor');
    $r=$move($walk(6,41));boxCheck($r['support']==='mid'&&$r['level']==='mid-level'&&$r['height']===12.&&$r['fall']===null,'He steps back down onto the island, not through it');
    $move($walk(5,41,true));
    $r=$move($walk(4,41));boxCheck($r['refused']===null&&$r['level']==='level-0'&&$r['support']===null&&$r['fall']===13,'Off the rock over the island\'s edge is a drop, from the rock\'s top');
});
$run($rim,[...$islander,'column'=>6],function(callable $move)use($walk){
    $r=$move($walk(4,41));boxCheck($r['refused']!==null&&$r['column']===6,'Over the rim rock and off the island in one walk is asked too');
    $r=$move($walk(4,41,true));boxCheck($r['refused']===null&&$r['level']==='level-0'&&$r['fall']===12,'On yes he goes over it and falls');
});
// A walker on the ground under the island is not stopped by a rock twelve squares over his head.
boxCheck($allowed([...$hero,'column'=>6,'row'=>41],[...$hero,'column'=>5,'row'=>41],$rim),'A rock on the island is nothing to a walker on the ground under it');
echo "PASS a rim rock: onto it on a yes, back onto the island, and over the edge is a drop\n";
