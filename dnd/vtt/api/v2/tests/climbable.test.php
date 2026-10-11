<?php
declare(strict_types=1);
// The wall setting "climbable". Brandon, October 10, 2026, after a rim rock 1.58 squares tall refused him beside
// one 0.61 tall that asked: "well i should be able to climb up most things right that are steep terrain. So I guess
// we need a wall type called climbable ... any thing outside like a large rock or something. Those should all be
// climbable. We can just make that a setting instead of trying to make sure every block is the right height". Only
// what is ticked is climbable; coming down is the fall rule as it is ("if there would be a far enough fall then it
// will bring up the usual fall thing with the climb option"). The browser's side is in climbable.test.mjs.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function climbCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function climbRing(string $name,float $column,float $row,float $base,float $height,array $extra=[],float $size=1.): array {
    $x0=$column+.04;$y0=$row+.04;$x1=$column+$size-.04;$y1=$row+$size-.04;
    $nodes=[['id'=>"$name-nw",'x'=>$x0,'y'=>$y0],['id'=>"$name-ne",'x'=>$x1,'y'=>$y0],['id'=>"$name-se",'x'=>$x1,'y'=>$y1],['id'=>"$name-sw",'x'=>$x0,'y'=>$y1]];
    $side=fn($id,$a,$b)=>['id'=>"$name-$id",'a'=>"$name-$a",'b'=>"$name-$b",'baseMode'=>'fixed','base'=>$base,'height'=>$height,'sight'=>'pass','movement'=>'block',...$extra];
    return ['nodes'=>$nodes,'segments'=>[$side('north','nw','ne'),$side('east','ne','se'),$side('south','se','sw'),$side('west','sw','nw')]];
}
function climbModel(array $parts,array $roofs=[]): array {
    $nodes=[];$segments=[];
    foreach($parts as $part){array_push($nodes,...$part['nodes']);array_push($segments,...$part['segments']);}
    return ['version'=>1,'nodes'=>$nodes,'segments'=>$segments,'roofs'=>$roofs];
}
function climbScene(array $parts,array $roofs=[],array $levels=[]): array {
    return ['mapLevels'=>['levels'=>$levels],'environment'=>['walls'=>['revision'=>1,'value'=>climbModel($parts,$roofs)]]];
}
$tick=['climbable'=>true];
$allowed=function(array $from,array $to,array $config,string $kind='walk',bool $climb=false,bool $gm=false): bool {
    try{WallMovement::assertAllowed($from,$to,WallCubes::withTemplates($config,[]),$kind,[],$gm,null,$climb);return true;}catch(InvalidArgumentException $e){return false;}
};
$hero=['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>4,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0'];$into=[...$hero,'column'=>5];

// ---- the setting
climbCheck(WallMovement::climbable(['climbable'=>true])&&!WallMovement::climbable([])&&!WallMovement::climbable(['climbable'=>'yes'])&&!WallMovement::climbable(['climbable'=>true,'interaction'=>'door']),'Only a plain true on a wall that is not a door or window');
$valid=function(array $model): bool {try{SceneEnvironment::validate('walls',$model);return true;}catch(InvalidArgumentException $e){return false;}};
climbCheck($valid(climbModel([climbRing('rock',5,2,0,1.58,$tick)])),'A wall may be set climbable');
climbCheck(!$valid(climbModel([climbRing('rock',5,2,0,1.58,['climbable'=>'yes'])])),'The setting is true or false, nothing else');
$seen=SceneEnvironment::project(['walls'=>['revision'=>1,'value'=>climbModel([climbRing('rock',5,2,0,1.58,$tick)])]]);
climbCheck(($seen['walls']['value']['segments'][0]['climbable']??null)===true,'A player\'s copy of the walls keeps the setting: his page is what asks');
echo "PASS the setting is a plain yes or no on a wall, checked, and reaches a player's page\n";

// ---- a rock taller than a square
$plain=climbScene([climbRing('rock',5,2,0,1.58)]);$ticked=climbScene([climbRing('rock',5,2,0,1.58,$tick)]);
climbCheck(!$allowed($hero,$into,$plain,'walk',true),'Without the tick a rock 1.58 tall is a wall, yes or no');
climbCheck(!$allowed($hero,$into,$ticked)&&$allowed($hero,$into,$ticked,'walk',true)&&$allowed($hero,$into,$ticked,'shift',true),'With it he is asked, and climbs on a yes');
climbCheck(!$allowed($hero,$into,$ticked,'forced',true),'A push into it still hits it');
foreach([3.,10.] as $tall)climbCheck($allowed($hero,$into,climbScene([climbRing('tor',5,2,0,$tall,$tick)]),'walk',true),"Any height: $tall");
$boxes=WallBoxes::boxes(climbModel([climbRing('rock',5,2,12,1.58,$tick),climbRing('tor',8,2,12,6.,$tick,2.)]));
climbCheck(count($boxes)===2&&abs($boxes[0]['height']-13.58)<1e-9&&$boxes[1]['height']===18.&&!empty($boxes[0]['climbable']),'A ring of climbable walls is a box of any height, its top at its real height');
$mixed=climbRing('mixed',5,2,0,1.58,$tick);unset($mixed['segments'][2]['climbable']);
climbCheck(WallBoxes::boxes(climbModel([$mixed]))===[],'Three sides ticked and one not is no box above a square high');
climbCheck(!$allowed($hero,$into,climbScene([climbRing('ledge',5,2,.6,2.,$tick)]),'walk',true),'One whose base is more than half a square above his feet refuses');
echo "PASS a climbable rock of any height is asked and climbed; without the tick it is a wall\n";

// ---- a climbable line
$fence=function(array $extra): array {return ['mapLevels'=>['levels'=>[]],'environment'=>['walls'=>['revision'=>1,'value'=>['version'=>1,'nodes'=>[['id'=>'a','x'=>5,'y'=>1],['id'=>'b','x'=>5,'y'=>4]],'segments'=>[['id'=>'fence','a'=>'a','b'=>'b','baseMode'=>'fixed','base'=>0,'height'=>3,'movement'=>'block',...$extra]]]]]];};
climbCheck(!$allowed($hero,$into,$fence([]),'walk',true),'A fence three squares high that is not ticked is a wall');
climbCheck(!$allowed($hero,$into,$fence($tick))&&$allowed($hero,$into,$fence($tick),'walk',true),'Ticked, it is crossed on a yes');
climbCheck(!$allowed($hero,$into,$fence([...$tick,'interaction'=>'door']),'walk',true),'A shut door is not climbed');
echo "PASS a climbable line is crossed on a yes whatever its height\n";

// ---- through the store
$run=function(array $config,array $hero,callable $steps): void {
    $db=sys_get_temp_dir().'/vtt-climbable-'.bin2hex(random_bytes(8)).'.sqlite';
    try{
        $store=new SyncV2Store($db);$board=['placements'=>['scene'=>[$hero]],'sceneState'=>['scene'=>$config]];$store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
        $s=$store->getSnapshot();$store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'climbable-environment','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$config['environment']['walls']['value']]],'GM',true);
        $n=0;
        $move=function(array $payload,bool $gm=false)use(&$store,&$n): array {
            $s=$store->getSnapshot();$id='climbable-move-number-'.(++$n);$refused=null;
            try{$store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>'hero','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'payload'=>$payload],$gm?'GM':'cal',$gm);}
            catch(InvalidArgumentException $e){$refused=$e->getMessage();}
            $state=$store->getSnapshot()['state'];$p=$state['placements']['scene']['hero'];
            $falls=array_values(array_filter($store->collisionEffects(['operationId'=>$id],'GM',true),fn($r)=>$r['kind']==='fall'));
            return ['refused'=>$refused,'column'=>$p['column'],'level'=>$p['levelId']??'level-0','support'=>$p['_supportSurfaceId']??null,'height'=>WallMovement::height($p,WallCubes::withTemplates($state['sceneConfig']['scene'],$state['templates']['scene']??[])),'fall'=>$falls[0]['details']['squares']??null,'walked'=>$falls[0]['details']['movementKind']??null];
        };
        $steps($move);
    }finally{unset($store);@unlink($db);}
};
$walk=fn(int $column,int $row,bool $yes=false)=>['column'=>$column,'row'=>$row,'movementKind'=>'walk',...($yes?['climbLow'=>true]:[])];
$island=['id'=>'mid','kind'=>'floor','levelId'=>'mid-level','height'=>12,'points'=>[['x'=>5,'y'=>38],['x'=>25,'y'=>38],['x'=>25,'y'=>46],['x'=>5,'y'=>46]],'holes'=>[]];
$levels=[['id'=>'mid-level','elevationSquares'=>12,'cutouts'=>[]]];
$islander=[...$hero,'column'=>13,'row'=>44,'levelId'=>'mid-level','_supportSurfaceId'=>'mid'];
// Brandon's pair on the Orchard's mid island: a rock 1.58 tall at 14,44 and one 0.61 tall at 15,44.
$pair=fn(array $extra)=>climbScene([climbRing('tall',14,44,12,1.58,$extra),climbRing('low',15,44,12,.61,$extra)],[$island],$levels);
$run($pair([]),$islander,function(callable $move)use($walk){
    $r=$move($walk(17,44,true));climbCheck($r['refused']!==null&&$r['column']===13,'As he found it: the tall rock is a wall and the drag across both is refused, yes or no');
});
$run($pair($tick),$islander,function(callable $move)use($walk){
    $r=$move($walk(17,44));climbCheck($r['refused']!==null&&$r['column']===13,'Ticked: the drag across both is refused until he says yes');
    $r=$move($walk(17,44,true));climbCheck($r['refused']===null&&$r['column']===17&&$r['support']==='mid'&&$r['height']===12.,'With one yes he crosses both and stands on the island beyond');
    $r=$move($walk(14,44,true));climbCheck($r['refused']===null&&$r['support']===WallBoxes::BOX_TOP.'tall-east'&&abs($r['height']-13.58)<1e-9&&$r['level']==='mid-level','Onto the tall rock from the far side: across the low one, and he stands at its real top');
    $r=$move($walk(13,44));climbCheck($r['refused']===null&&$r['level']==='mid-level'&&$r['height']===12.&&$r['fall']===2&&$r['walked']==='walk','Stepping off a rock 1.58 tall onto the island is the fall rule as it is: a drop of 2 he walked off, which the fall panel can turn into a climb down');
});
// A tall climbable thing is stood on, and he does not fall through the floor it stands on when he steps off.
$run(climbScene([climbRing('tor',14,44,12,5.,$tick)],[$island],$levels),$islander,function(callable $move)use($walk){
    $r=$move($walk(14,44,true));climbCheck($r['support']===WallBoxes::BOX_TOP.'tor-east'&&$r['height']===17.,'Five squares up, on a yes');
    $r=$move($walk(15,44));climbCheck($r['refused']===null&&$r['level']==='mid-level'&&$r['height']===12.&&$r['fall']===5,'Off the far side he lands on the island, five squares down, not on the ground under it');
    $r=$move($walk(14,44),true);climbCheck($r['refused']===null&&$r['height']===17.,'The Director\'s own walk puts him on it without the question');
});
echo "PASS through the store: Brandon's pair crossed on one yes; a tall rock stood on; coming down is the fall rule\n";
