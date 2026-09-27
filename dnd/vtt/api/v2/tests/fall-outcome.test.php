<?php
require __DIR__.'/../../../lib/SyncV2Store.php';
function fallCheck($ok,$message){if(!$ok)throw new RuntimeException($message);}
$s=new SyncV2Store(':memory:');
$s->migrateLegacyPlacements(['placements'=>['scene'=>[['id'=>'falling','column'=>0,'row'=>0,'levelId'=>'upper','profileId'=>'cal'],['id'=>'landing','column'=>2,'row'=>0,'levelId'=>'level-0']]],'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','elevationSquares'=>5,'cutouts'=>[['column'=>2,'row'=>0,'width'=>2,'height'=>2]]]]]]]]);
$s->migrateLegacyBoardDomains(['sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','elevationSquares'=>5,'cutouts'=>[['column'=>2,'row'=>0,'width'=>2,'height'=>2]]]]]]]]);
$before=$s->getSnapshot();$r=$s->acceptTokenMove(['type'=>'token.move','operationId'=>'floor-fall-review','sceneId'=>'scene','entityId'=>'falling','baseRevision'=>$before['revision'],'entityRevision'=>0,'payload'=>['column'=>2,'row'=>0,'movementKind'=>'walk']],'cal',false);
$records=$s->collisionEffects(['operationId'=>'floor-fall-review'],'cal',false);fallCheck(count($records)===1&&$records[0]['kind']==='fall','Fall recorded atomically');
$details=$records[0]['details'];fallCheck($details['squares']===5&&$details['collidedIds']===['landing']&&$details['relocated'],'Fall distance, target and free landing');
fallCheck($s->collisionEffects(['operationId'=>'floor-fall-review'],'sharon',false)===[],'Only actor and GM see review');
$key=['operationId'=>$records[0]['operationId'],'targetId'=>'falling'];
$claim=$s->collisionEffects([...$key,'action'=>'start'],'cal',false,true);fallCheck($claim['granted'],'Actor reserves fall');
fallCheck(!$s->collisionEffects([...$key,'action'=>'start'],'cal',false,true)['granted'],'No repeated reservation');
$s->collisionEffects([...$key,'action'=>'finish','status'=>'needs_review'],'cal',false,true);
fallCheck(!$s->collisionEffects([...$key,'action'=>'start'],'cal',false,true)['granted'],'Uncertain fall never replays');
$air=['id'=>'fly','column'=>0,'row'=>0,'movementMode'=>'fly','flightHeight'=>7];
fallCheck(FallOutcome::plan($air,[...$air,'movementMode'=>'ground'],[],'forced')['squares']===7,'Interrupted flight');
fallCheck(FallOutcome::plan($air,$air,[],'forced')===null,'Flying stays airborne');
fallCheck(FallOutcome::plan($air,[...$air,'movementMode'=>'ground'],[],'teleport')===null,'Teleport fall policy remains deferred');
// Upgrade existing pre-fall ledgers without losing completed damage.
$pdo=new PDO('sqlite::memory:');$pdo->exec('CREATE TABLE vtt_collision_effects(world_id TEXT,operation_id TEXT,target_id TEXT,scene_id TEXT,actor_id TEXT,amount INTEGER,status TEXT,PRIMARY KEY(world_id,operation_id,target_id))');
$pdo->exec("INSERT INTO vtt_collision_effects VALUES('w','old','p','scene','cal',4,'completed')");
$ledger=new CollisionEffects($pdo,'w');$rows=$ledger->list('cal',false,'old');fallCheck(count($rows)===1&&$rows[0]['status']==='completed'&&$rows[0]['kind']==='collision','Legacy receipt preserved');
echo "Fall geometry, relocation, actor privacy, interruption, reservation and legacy ledger migration passed.\n";
