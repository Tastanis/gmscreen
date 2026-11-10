<?php
declare(strict_types=1);
// A low barrier (a rail, a fence, a parapet, a box: up to the rules table's stepUp, 1.5 squares, above the walker's
// feet) is a plain step: no question (Brandon, November 8, 2026: "up to 1.5 squares is a plain step with no
// question"). Before that, October 10, 2026, it asked to climb. Anything else in the way of a walk is a question,
// never a refusal: a climbable face asks to climb, a shut door and a wall ask "Move anyway"; the server refuses only
// a walk sent without the answer. The browser's side is in low-barrier.test.mjs.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function lowCheck(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function lowAllowed(array $from,array $to,array $config,string $kind='walk',bool $climb=false,bool $gm=false,array $path=[],bool $anyway=false): bool {
    try{WallMovement::assertAllowed($from,$to,$config,$kind,$path,$gm,null,$climb,$anyway);return true;}catch(InvalidArgumentException $e){return false;}
}
function lowRefusal(array $from,array $to,array $config): ?string {
    try{WallMovement::assertAllowed($from,$to,$config,'walk',[],false);return null;}catch(InvalidArgumentException $e){return $e->getMessage();}
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

// ---- the rail: a plain step
$config=$scene($rail);
lowCheck(lowAllowed($from,$over,$config),'A walk goes over a rail 0.67 high with no question');
lowCheck(lowAllowed($from,$over,$config,'shift')&&lowAllowed($over,$from,$config),'A shift too, and back');
lowCheck(lowAllowed($from,[...$from,'column'=>5],$config),'A longer walk that crosses the rail on its way');
lowCheck(lowAllowed($from,$over,$scene(['height'=>1.0]))&&lowAllowed($from,$over,$scene(['height'=>1.5])),'One square, and a square and a half, are plain steps');
lowCheck(lowAllowed($from,$over,$scene(['height'=>0.67,'x'=>3.04])),'The low wall of an object inside a square is a plain step too');
echo "PASS a wall up to a square and a half high is a plain step\n";

// ---- what is asked
lowCheck(lowRefusal($from,$over,$scene(['height'=>1.6]))===WallMovement::MET_WALL,'A wall 1.6 high is a wall: Move anyway');
lowCheck(lowRefusal($from,$over,$scene([]))===WallMovement::MET_WALL,'A wall that gives no height is two squares');
lowCheck(lowRefusal($from,$over,$scene(['height'=>2.5,'climbable'=>true]))===WallMovement::MET_CLIMB&&lowAllowed($from,$over,$scene(['height'=>2.5,'climbable'=>true]),'walk',true),'A climbable face over a plain step asks to climb, and goes on a yes');
lowCheck(lowRefusal($from,$over,$scene(['height'=>2.5,'climbable'=>true,'climbSide'=>'right']))===WallMovement::MET_WALL&&lowRefusal($over,$from,$scene(['height'=>2.5,'climbable'=>true,'climbSide'=>'right']))===WallMovement::MET_CLIMB,'A face climbable from one side is a wall from the other');
lowCheck(lowRefusal($from,$over,$scene(['height'=>1.0,'interaction'=>'door']))===WallMovement::MET_DOOR,'A shut low gate is a door: opened, not stepped over');
lowCheck(lowRefusal($from,$over,$scene(['height'=>0.5,'base'=>0.4]))===WallMovement::MET_WALL,'A beam off the floor is not a step');
lowCheck(!lowAllowed($from,$over,$scene($rail,['base'=>0.67,'height'=>1.33])),'A window above the sill still stops him: over the rail he is at its top');
lowCheck(lowAllowed($from,$over,$scene($rail,['base'=>1.67,'height'=>1])),'A beam well overhead does not');
lowCheck(!lowAllowed($from,[...$from,'column'=>5],$scene($rail,['height'=>2,'x'=>4])),'A full wall further along the same walk stops it');
foreach ([['height'=>2],['height'=>1.0,'interaction'=>'door','locked'=>true],['height'=>2.5,'climbable'=>true]] as $wall) lowCheck(lowAllowed($from,$over,$scene($wall),'walk',false,false,[],true),'Move anyway goes through anything: '.json_encode($wall));
$wide=[...$from,'width'=>2,'height'=>2];
lowCheck(lowAllowed($wide,[...$wide,'column'=>3],$scene(['base'=>1.4,'height'=>3])),'A size 2 walker passes under a beam over its body: head room is a warning only');
lowCheck(WallMovement::headRoom($wide,[...$wide,'column'=>3],$scene(['base'=>1.4,'height'=>3]))!==null&&WallMovement::headRoom($from,$over,$scene(['base'=>1.4,'height'=>3]))===null,'and is warned; a size 1 walker is not');
$question=WallMovement::question($from,$over,$scene(['height'=>2.5,'climbable'=>true]));
lowCheck($question['kind']==='climb'&&abs($question['rise']-2.5)<1e-6,'The question says what is met and how high');
lowCheck(WallMovement::question($from,$over,$scene(['height'=>1,'interaction'=>'door','locked'=>true]))['locked']===true,'and whether a door is locked');
echo "PASS walls, doors and climbs are questions; Move anyway goes; head room only warns\n";

// ---- forced movement, and the Director
lowCheck(!lowAllowed($from,$over,$config,'forced',true),'A push into a rail hits it');
lowCheck(lowAllowed($from,$over,$scene([]),'walk',false,true),'The Director\'s own walk passes every wall, as always');
lowCheck(lowAllowed($from,$over,$config,'teleport'),'A teleport passes walls, as always');
echo "PASS a push still hits a rail; the Director and a teleport are as they were\n";

// ---- on an upper floor: the wall stands on the balcony, four squares up
$balcony=$scene(['height'=>2,'base'=>4]);$balcony['mapLevels']=['levels'=>[['id'=>'balcony','elevationSquares'=>4]]];
$up=[...$from,'levelId'=>'balcony'];
lowCheck(!lowAllowed($up,[...$up,'column'=>3],$balcony),'A wall on a balcony stops a walker on that balcony');
lowCheck(lowAllowed($from,$over,$balcony),'And is nothing to a walker on the ground under it');
echo "PASS a wall is met by whoever stands on its own floor\n";

// ---- through the store: the answer travels with the move
$db=sys_get_temp_dir().'/vtt-low-barrier-'.bin2hex(random_bytes(8)).'.sqlite';
try{
    $config=$scene(['height'=>2]);
    $hero=['id'=>'hero','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>2,'width'=>1,'height'=>1,'levelId'=>'level-0'];
    $store=new SyncV2Store($db);$board=['placements'=>['scene'=>[$hero]],'sceneState'=>['scene'=>$config]];$store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
    $s=$store->getSnapshot();$store->acceptBoardDomainCommand(['type'=>'environment.set','sceneId'=>'scene','operationId'=>'low-barrier-environment','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$config['environment']['walls']['value']]],'GM',true);
    $move=function(array $payload,string $id)use(&$store){$s=$store->getSnapshot();return $store->acceptTokenMove(['type'=>'token.move','operationId'=>$id,'sceneId'=>'scene','entityId'=>'hero','baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision'],'payload'=>$payload],'cal',false);};
    $refused=false;try{$move(['column'=>3,'row'=>2,'movementKind'=>'walk'],'low-barrier-walk-no');}catch(InvalidArgumentException $e){$refused=$e->getMessage()===WallMovement::MET_WALL;}
    lowCheck($refused&&$store->getSnapshot()['state']['placements']['scene']['hero']['column']===2,'Without the answer the player\'s walk is refused and he stays');
    foreach(['yes',1,'true'] as $n=>$notYes){$kept=false;try{$move(['column'=>3,'row'=>2,'movementKind'=>'walk','moveAnyway'=>$notYes],'low-barrier-walk-odd-'.$n);}catch(InvalidArgumentException $e){$kept=true;}lowCheck($kept,'Only a plain true is a yes, not '.json_encode($notYes));}
    $move(['column'=>3,'row'=>2,'movementKind'=>'walk','moveAnyway'=>true],'low-barrier-walk-yes');
    lowCheck($store->getSnapshot()['state']['placements']['scene']['hero']['column']===3,'With Move anyway he is through the wall');
}finally{unset($store);@unlink($db);}
echo "PASS the answer travels with the move, and only a plain yes counts\n";
