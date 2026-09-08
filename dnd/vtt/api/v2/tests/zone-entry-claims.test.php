<?php
declare(strict_types=1);
require_once __DIR__.'/../../../lib/SyncV2Store.php';
$path=sys_get_temp_dir().'/vtt-zone-claims-'.bin2hex(random_bytes(8)).'.sqlite';
function checkClaim(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
function deniedClaim(callable $action): void {$denied=false;try{$action();}catch(InvalidArgumentException $e){$denied=true;}checkClaim($denied,'Invalid entry claim must be rejected.');}
try {
    $store=new SyncV2Store($path);
    $zone=['id'=>'zone-one','levelId'=>'level-0','triggers'=>['onEnter'],'createdAt'=>1,
        'template'=>['column'=>3,'row'=>0,'width'=>1,'height'=>1],'effects'=>[['kind'=>'damage','amount'=>3]]];
    $board=['placements'=>['scene'=>[
        ['id'=>'mover','team'=>'ally','column'=>0,'row'=>0,'width'=>1,'height'=>1,'hp'=>['current'=>20,'max'=>20]],
        ['id'=>'caster','team'=>'ally','column'=>9,'row'=>9,'persistentZones'=>[$zone]],
    ]],'sceneState'=>['scene'=>[]]];
    $store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
    $move=function(string $op,int $column,string $actor='cal',string $kind='walk')use(&$store):void{
        $s=$store->getSnapshot();$result=$store->acceptTokenMove(['type'=>'token.move','operationId'=>$op,'sceneId'=>'scene','entityId'=>'mover',
            'baseRevision'=>$s['revision'],'entityRevision'=>$s['state']['placements']['scene']['mover']['_entityRevision'],
            'payload'=>['column'=>$column,'row'=>0,'movementKind'=>$kind]],$actor,$actor==='GM');
        checkClaim($result['status']==='accepted','Fixture movement accepted.');
    };
    $move('claim-move-first',7);
    $request=['sceneId'=>'scene','placementId'=>'mover','zoneId'=>'zone-one','movementOperationId'=>'claim-move-first'];
    deniedClaim(fn()=>$store->claimZoneEntry($request,'sharon',false));
    deniedClaim(fn()=>$store->claimZoneEntry([...$request,'zoneId'=>'missing'],'cal',false));
    $before=$store->getSnapshot();$first=$store->claimZoneEntry($request,'cal',false);
    checkClaim($first['claimed']===true&&$first['status']==='pending','First valid entry is durably reserved.');
    checkClaim($store->getSnapshot()===$before,'Reservation never applies damage or changes board revision.');
    $again=$store->claimZoneEntry($request,'cal',false);
    checkClaim(!$again['claimed']&&$again['claimId']===$first['claimId'],'Retry cannot authorize effect replay.');
    unset($store);$store=new SyncV2Store($path);
    checkClaim(!$store->claimZoneEntry($request,'cal',false)['claimed'],'Reservation survives database reopening.');
    $move('claim-move-second',0,'GM');
    $second=[...$request,'movementOperationId'=>'claim-move-second'];
    checkClaim(!$store->claimZoneEntry($second,'GM',true)['claimed'],'Another client moving the same creature shares the round claim.');
    deniedClaim(fn()=>$store->claimZoneEntry($request,'cal',false));
    $s=$store->getSnapshot();$store->acceptCombatCommand(['type'=>'combat.start','sceneId'=>'scene','operationId'=>'claim-start-combat',
        'baseRevision'=>$s['revision'],'payload'=>['encounterId'=>'claim-encounter']], 'GM',true);
    deniedClaim(fn()=>$store->claimZoneEntry($second,'GM',true));
    $move('claim-round-one',7);
    $newRound=$store->claimZoneEntry([...$request,'movementOperationId'=>'claim-round-one'],'cal',false);
    checkClaim($newRound['claimed']&&$newRound['claimId']!==$first['claimId'],'New combat boundary has a separate claim.');
    $outcomeBefore=$store->getSnapshot();
    checkClaim(count($store->unresolvedZoneEntries('CAL',false))===2,'Claimant can recover entries across boundaries and actor case.');
    checkClaim($store->unresolvedZoneEntries('sharon',false)===[],'Other players cannot discover claims or stored evidence.');
    checkClaim(count($store->unresolvedZoneEntries('GM',true))===2,'GM can review all unresolved entries.');
    $recovered=$store->unresolvedZoneEntries('cal',false)[0];
    checkClaim($recovered['zone']===$zone && $recovered['movement']['placementId']==='mover','Recovery retains original effect and movement evidence.');
    $finish=['claimId'=>$first['claimId'],'status'=>'completed'];
    deniedClaim(fn()=>$store->finishZoneEntry($finish,'sharon',false));
    deniedClaim(fn()=>$store->finishZoneEntry([...$finish,'status'=>'dismissed'],'cal',false));
    deniedClaim(fn()=>$store->finishZoneEntry([...$finish,'status'=>'pending'],'cal',false));
    deniedClaim(fn()=>$store->finishZoneEntry([...$finish,'claimId'=>str_repeat('0',64)],'GM',true));
    deniedClaim(fn()=>$store->unresolvedZoneEntries('',true));
    $review=$store->finishZoneEntry([...$finish,'status'=>'needs_review'],'cal',false);
    checkClaim($review['status']==='needs_review','An uncertain result remains recoverable without replay.');
    checkClaim($store->finishZoneEntry([...$finish,'status'=>'needs_review'],'cal',false)['idempotent'],'Uncertain outcome acknowledgement can be retried safely.');
    unset($store);$store=new SyncV2Store($path);
    checkClaim($store->unresolvedZoneEntries('cal',false)[0]['status']==='needs_review','Review state survives reload.');
    $completed=$store->finishZoneEntry($finish,'CAL',false);
    checkClaim(!$completed['idempotent'] && $completed['status']==='completed','Claimant may acknowledge completion.');
    checkClaim($store->finishZoneEntry($finish,'cal',false)['idempotent'],'Lost completion response is safe to retry.');
    deniedClaim(fn()=>$store->finishZoneEntry([...$finish,'status'=>'needs_review'],'GM',true));
    deniedClaim(fn()=>$store->finishZoneEntry([...$finish,'status'=>'dismissed'],'GM',true));
    $dismiss=['claimId'=>$newRound['claimId'],'status'=>'dismissed'];
    checkClaim($store->finishZoneEntry($dismiss,'GM',true)['status']==='dismissed','GM may dismiss an unresolved entry after review.');
    checkClaim($store->finishZoneEntry($dismiss,'GM',true)['idempotent'],'Dismissal retry is safe.');
    deniedClaim(fn()=>$store->finishZoneEntry([...$dismiss,'status'=>'completed'],'cal',false));
    checkClaim($store->unresolvedZoneEntries('GM',true)===[],'Final outcomes leave the review queue.');
    checkClaim(!$store->claimZoneEntry([...$request,'movementOperationId'=>'claim-round-one'],'cal',false)['claimed'],'Dismissal does not release the reservation for another execution.');
    checkClaim($store->getSnapshot()===$outcomeBefore,'Review and outcome acknowledgements never mutate gameplay state.');
    $move('claim-forced-move',0,'GM','forced');
    deniedClaim(fn()=>$store->claimZoneEntry([...$request,'movementOperationId'=>'claim-forced-move'],'GM',true));
    $from=['column'=>0,'row'=>0,'width'=>1,'height'=>1,'levelId'=>'level-0'];
    checkClaim(!ZoneEntryClaims::enters(['squares'=>[['column'=>3,'row'=>3]]],[...$from,'row'=>4],[...$from,'column'=>4]),'Tangent corner does not enter.');
    echo "Zone claims: trusted actor/movement, durable round uniqueness, cross-client dedupe, stale/forced rejection and no effects passed.\n";
} finally {unset($store);foreach(['','-wal','-shm']as$suffix)if(is_file($path.$suffix))unlink($path.$suffix);}
