<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function checkGroup(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
foreach (['success','edit','move','delete','geometry','permission','later-undone'] as $scenario) {
    $database=sys_get_temp_dir().'/vtt-group-undo-'.bin2hex(random_bytes(8)).'.sqlite';
    $store=new SyncV2Store($database);
    try {
        $board=['placements'=>['scene'=>[
            ['id'=>'pc','name'=>'Cal','profileId'=>'cal','team'=>'ally','column'=>0,'row'=>0,'levelId'=>'upper'],
            ['id'=>'ally','team'=>'ally','column'=>1,'row'=>0,'levelId'=>'level-0'],
        ]], 'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[
            ['id'=>'upper','zIndex'=>1,'cutouts'=>[['column'=>3,'row'=>2,'width'=>2,'height'=>2]]],
        ]]]]];
        $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
        $batch=function(array $actions, string $operation, string $actor='cal', bool $gm=false) use (&$store): array {
            return $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>$operation,
                'baseRevision'=>$store->getSnapshot()['revision'],'payload'=>['actions'=>$actions]],$actor,$gm);
        };
        $batch([
            ['kind'=>'patch','sceneId'=>'scene','placementId'=>'pc','entityRevision'=>0,'patch'=>['column'=>3,'row'=>2]],
            ['kind'=>'patch','sceneId'=>'scene','placementId'=>'ally','entityRevision'=>0,'patch'=>['column'=>4,'row'=>2]],
        ], 'group-original');
        if (in_array($scenario,['edit','move','permission','later-undone'],true)) {
            $patch=match($scenario) { 'edit'=>['name'=>'Changed'], 'permission'=>['team'=>'enemy'], default=>['column'=>6] };
            $batch([['kind'=>'patch','sceneId'=>'scene','placementId'=>'ally','entityRevision'=>1,'patch'=>$patch]],'group-intervene', in_array($scenario,['permission','edit'],true)?'GM':'cal',in_array($scenario,['permission','edit'],true));
            if ($scenario==='later-undone') {
                $snapshot=$store->getSnapshot();
                $store->acceptTokenMove(['type'=>'token.move','operationId'=>'group-later-undo','sceneId'=>'scene','entityId'=>'ally',
                    'baseRevision'=>$snapshot['revision'],'entityRevision'=>2,'payload'=>['undoRevision'=>2,'column'=>0,'row'=>0]],'cal',false);
            }
        } elseif ($scenario==='delete') {
            $batch([['kind'=>'remove','sceneId'=>'scene','placementId'=>'ally','entityRevision'=>1]],'group-delete','GM',true);
        } elseif ($scenario==='geometry') {
            $snapshot=$store->getSnapshot();
            $store->acceptBoardDomainCommand(['type'=>'levels.set','operationId'=>'group-geometry','sceneId'=>'scene',
                'baseRevision'=>$snapshot['revision'],'entityRevision'=>$snapshot['state']['sceneConfig']['scene']['_revision'],
                'payload'=>['mapLevels'=>['levels'=>[['id'=>'upper','zIndex'=>1,'hidden'=>true]]]]],'GM',true);
        }
        $before=$store->getSnapshot();
        $command=['type'=>'movement.undoGroup','operationId'=>'group-undo-command','sceneId'=>'scene','entityId'=>'pc',
            'baseRevision'=>$before['revision'],'entityRevision'=>1,'payload'=>['actions'=>[['placementId'=>'forged','patch'=>['column'=>999]]]]];
        $wrong=false;
        try { $store->undoMovementGroup($command,'GM',true); } catch (InvalidArgumentException $e) { $wrong=true; }
        checkGroup($wrong && $store->getSnapshot()===$before,'Another actor cannot undo even as GM.');
        if (!in_array($scenario,['success','later-undone'],true)) {
            $rejected=false;
            try { $store->undoMovementGroup($command,'cal',false); } catch (InvalidArgumentException $e) { $rejected=true; }
            checkGroup($rejected && $store->getSnapshot()===$before,'Invalid member must leave every member unchanged: '.$scenario);
            continue;
        }
        $result=$store->undoMovementGroup($command,'cal',false);
        $after=$store->getSnapshot();
        checkGroup($result['status']==='accepted' && $after['revision']===$before['revision']+1,'One atomic revision.');
        checkGroup(count($result['event']['payload']['mutations'])===2,'Exactly the original members restored.');
        checkGroup($result['event']['payload']['movementKind']==='undo' && !isset($result['event']['payload']['zoneEntryReceipts']),'Undo cannot produce fresh zone entry evidence.');
        foreach (['pc'=>0,'ally'=>1] as $id=>$column) {
            $token=$after['state']['placements']['scene'][$id];
            checkGroup((float)$token['column']===(float)$column && (float)$token['row']===0.0 && $token['levelId']===($id==='pc'?'upper':'level-0'),'Server restores original position.');
            checkGroup($token['_movementUndo']['history']===[],'Receipt popped, not recorded as a new move.');
        }
        checkGroup($after['state']['sceneConfig']['scene']['userLevelState']['cal']['levelId']==='upper','Linked player follows the restored floor atomically.');
        unset($store); $store=new SyncV2Store($database);
        checkGroup($store->undoMovementGroup($command,'cal',false)['idempotent']===true && $store->getSnapshot()===$after,'Retry survives database reopening without another undo.');
    } finally {
        unset($e, $batch, $store);
        foreach (['','-wal','-shm'] as $suffix) if (is_file($database.$suffix)) unlink($database.$suffix);
    }
}
echo "Atomic group undo checks passed.\n";
