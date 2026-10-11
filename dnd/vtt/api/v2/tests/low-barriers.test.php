<?php
declare(strict_types=1);
// A low barrier (a rail, a fence, a parapet: one square high or less) is climbed over on a yes to the
// climb pop-up, and refuses a walk without it. Brandon, October 10, 2026, of the bathhouse balcony rails:
// "I want them to be breakable. But also climbable. If it asks to climb. I want players to be able to
// click yes and move to the top. Instead of it knocking them back like a wall." The browser's side is in
// low-barrier.test.mjs.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function lowCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function lowAllowed(array $from,array $to,array $config,string $kind='walk',bool $climb=false,bool $gm=false,array $path=[]): bool {
    try{WallMovement::assertAllowed($from,$to,$config,$kind,$path,$gm,null,$climb);return true;}catch(InvalidArgumentException $e){return false;}
}
// A wall along the line between column 2 and column 3, rows 1 to 5.
$scene=function(array ...$walls): array {
    $nodes=[];$segments=[];
    foreach($walls as $i=>$wall){
        $x=$wall['x']??3;unset($wall['x']);
        $nodes[]=['id'=>"a$i",'x'=>$x,'y'=>1];$nodes[]=['id'=>"b$i",'x'=>$x,'y'=>5];
        $segments[]=['id'=>"wall$i",'a'=>"a$i",'b'=>"b$i",'baseMode'=>'fixed','base'=>0,'movement'=>'block',...$wall];
    }
    return ['environment'=>['walls'=>['revision'=>1,'value'=>['version'=>1,'nodes'=>$nodes,'segments'=>$segments]]]];
};
$from=['id'=>'hero','column'=>2,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0','team'=>'ally'];$over=[...$from,'column'=>3];
$rail=['height'=>0.67,'material'=>'wood','sight'=>'pass'];

// ---- the rail
$config=$scene($rail);
lowCheck(!lowAllowed($from,$over,$config),'A walk is refused by a rail until the walker says yes');
lowCheck(lowAllowed($from,$over,$config,'walk',true),'On yes the walk goes over a rail 0.67 high');
lowCheck(lowAllowed($from,$over,$config,'shift',true)&&!lowAllowed($from,$over,$config,'shift'),'A shift is asked the same');
lowCheck(lowAllowed($over,$from,$config,'walk',true),'And back over it from the other side');
lowCheck(lowAllowed($from,[...$from,'column'=>5],$config,'walk',true),'A longer walk that crosses the rail on its way');
lowCheck(lowAllowed($from,$over,$scene(['height'=>1.0]),'walk',true),'Exactly one square high is still low');
echo "PASS a rail is climbed over on a yes, and refuses without it\n";

// ---- what is not a low barrier
lowCheck(!lowAllowed($from,$over,$scene(['height'=>1.2]),'walk',true),'A wall 1.2 high refuses either way');
lowCheck(!lowAllowed($from,$over,$scene([]),'walk',true),'A wall that gives no height is two squares, and refuses');
lowCheck(!lowAllowed($from,$over,$scene(['height'=>0.67,'x'=>3.04]),'walk',true),'The wall of an object inside a square is not a rail');
lowCheck(!lowAllowed($from,$over,$scene(['height'=>1.0,'interaction'=>'door']),'walk',true),'A closed low gate is opened, not climbed');
lowCheck(!lowAllowed($from,$over,$scene(['height'=>0.5,'base'=>0.4]),'walk',true),'A beam off the floor is not a rail to step over');
lowCheck(!lowAllowed($from,$over,$scene($rail,['base'=>0.67,'height'=>1.33]),'walk',true),'A window above the sill still stops him: over the rail he is at its top');
lowCheck(lowAllowed($from,$over,$scene($rail,['base'=>1.67,'height'=>1]),'walk',true),'A beam well overhead does not');
lowCheck(!lowAllowed($from,[...$from,'column'=>5],$scene($rail,['height'=>2,'x'=>4]),'walk',true),'A full wall further along the same walk refuses it');
echo "PASS taller walls, objects, gates and what stands above a rail refuse as before\n";

// ---- forced movement, and the Director
lowCheck(!lowAllowed($from,$over,$config,'forced',true),'A push into a rail hits it; the answer to the climb question is not for pushes');
lowCheck(lowAllowed($from,$over,$config,'walk',false,true),'The Director\'s own walk passes every wall, as always');
lowCheck(lowAllowed($from,$over,$config,'teleport'),'A teleport passes walls, as always');
echo "PASS a push still hits a rail; the Director and a teleport are as they were\n";

// ---- on an upper floor: the rail stands on the balcony, four squares up
$balcony=$scene(['height'=>0.67,'base'=>4]);$balcony['mapLevels']=['levels'=>[['id'=>'balcony','elevationSquares'=>4]]];
$up=[...$from,'levelId'=>'balcony'];
lowCheck(!lowAllowed($up,[...$up,'column'=>3],$balcony)&&lowAllowed($up,[...$up,'column'=>3],$balcony,'walk',true),'A rail on a balcony is low for a walker on that balcony');
lowCheck(lowAllowed($from,$over,$balcony),'And is nothing to a walker on the ground under it');
echo "PASS a rail is low for whoever stands on its own floor\n";

// ---- through the store: the answer travels with the move
$db=sys_get_temp_dir().'/vtt-low-barrier-'.bin2hex(random_bytes(8)).'.sqlite';
try{
    $hero=['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0'];
    $store=new SyncV2Store($db);$board=['placements'=>['scene'=>[$hero]],'sceneState'=>['scene'=>$config]];$store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
    $s=$store->getSnapshot();$store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'low-barrier-environment','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$config['environment']['walls']['value']]],'GM',true);
    $move=function(array $payload,string $id)use(&$store){$s=$store->getSnapshot();return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>'hero','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'payload'=>$payload],'cal',false);};
    $refused=false;try{$move(['column'=>3,'row'=>2,'movementKind'=>'walk'],'low-barrier-walk-no');}catch(InvalidArgumentException $e){$refused=str_contains($e->getMessage(),'blocked by a wall');}
    lowCheck($refused&&$store->getSnapshot()['state']['placements']['scene']['hero']['column']===2,'Without the answer the player\'s walk is refused and he stays');
    foreach(['yes',1,'true'] as $n=>$notYes){$kept=false;try{$move(['column'=>3,'row'=>2,'movementKind'=>'walk','climbLow'=>$notYes],'low-barrier-walk-odd-'.$n);}catch(InvalidArgumentException $e){$kept=true;}lowCheck($kept,'Only a plain true is a yes, not '.json_encode($notYes));}
    $move(['column'=>3,'row'=>2,'movementKind'=>'walk','climbLow'=>true],'low-barrier-walk-yes');
    lowCheck($store->getSnapshot()['state']['placements']['scene']['hero']['column']===3,'With the answer he is over the rail');
}finally{unset($store);@unlink($db);}
echo "PASS the answer travels with the move, and only a plain yes counts\n";
