<?php
declare(strict_types=1);
require_once __DIR__ . '/../_common.php';
$path=sys_get_temp_dir().'/vtt-layout-'.bin2hex(random_bytes(8)).'.sqlite'; putenv('VTT_SYNC_V2_DATABASE='.$path);
function verifyLayout(bool $ok,string $message):void {if(!$ok)throw new RuntimeException($message);}
try {
    $store=vttSyncV2Store();
    $board=['placements'=>['scene'=>[['id'=>'hero','profileId'=>'cal','team'=>'ally','column'=>2,'row'=>2,'levelId'=>'upper','hp'=>9]],'other'=>[['id'=>'other-token','column'=>1,'row'=>1]]],
        'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper'],['id'=>'secret','hidden'=>true,'mapUrl'=>'/secret-map.jpg']]],'grid'=>['size'=>50],
            'fogOfWar'=>['byLevel'=>['upper'=>['enabled'=>true,'revealedCells'=>['2,2'=>true]]]]]],
        'drawings'=>['scene'=>[['id'=>'saved-line','levelId'=>'upper','points'=>[['x'=>1,'y'=>1],['x'=>2,'y'=>2]]]]],
        'templates'=>['scene'=>[['id'=>'saved-zone','type'=>'circle','levelId'=>'upper','center'=>['column'=>2,'row'=>2],'radius'=>3]]]];
    $store->migrateLegacyPlacements($board);$store->migrateLegacyBoardDomains($board);
    $saved=$store->getSnapshot();$checkpoint=$store->sceneCheckpoints()->capture('layout-checkpoint','Before edits','scene',$saved,'GM');
    $sequence=0;
    $command=function(string $type,array $payload,?string $id=null)use($store,&$sequence){
        $s=$store->getSnapshot();$domain=str_starts_with($type,'drawing.')?'drawings':(str_starts_with($type,'template.')?'templates':'sceneConfig');
        $revision=$id===null?($s['state']['sceneConfig']['scene']['_revision']??0):($s['state'][$domain]['scene'][$id]['_entityRevision']??0);
        return $store->acceptBoardDomainCommand(['type'=>$type,'operationId'=>'layout-change-'.++$sequence,'sceneId'=>'scene','entityId'=>$id,'baseRevision'=>$s['revision'],'entityRevision'=>$revision,'payload'=>$payload],'GM',true);
    };
    $command('levels.set',['mapLevels'=>['levels'=>[['id'=>'new-floor']]]]);
    $s=$store->getSnapshot();
    $store->acceptPlacementBatch(['type'=>'placement.batch','operationId'=>'layout-token-edits','baseRevision'=>$s['revision'],'payload'=>['actions'=>[
        ['kind'=>'patch','sceneId'=>'scene','placementId'=>'hero','entityRevision'=>$s['state']['placements']['scene']['hero']['_entityRevision']??0,'patch'=>['column'=>7,'row'=>8,'levelId'=>'level-0','hp'=>22,'conditions'=>['Grabbed']]],
        ['kind'=>'add','sceneId'=>'scene','placementId'=>'newer','placement'=>['id'=>'newer','column'=>4,'row'=>5,'levelId'=>'new-floor','hp'=>30]],
    ]]],'GM',true);
    $command('grid.set',['grid'=>['size'=>75]]);
    $command('drawing.remove',[],'saved-line');
    $command('drawing.upsert',['drawing'=>['id'=>'new-line','points'=>[['x'=>4,'y'=>4],['x'=>5,'y'=>5]]]],'new-line');
    $command('template.upsert',['template'=>['id'=>'saved-zone','type'=>'circle','levelId'=>'level-0','center'=>['column'=>4,'row'=>4],'radius'=>1]],'saved-zone');
    $command('level.user.set',['userId'=>'sharon','entry'=>['levelId'=>'new-floor','followToken'=>false]]);
    $before=$store->getSnapshot();$preview=$store->previewCheckpointLayout($checkpoint);
    verifyLayout($store->getSnapshot()===$before,'Preview is read-only.');
    verifyLayout($preview['content']['drawings']===['added'=>1,'removed'=>1,'updated'=>0] && $preview['content']['templates']['updated']===1,'Preview reports lost and newer content precisely.');
    verifyLayout($preview['newerTokensPreserved']===1 && count($preview['changes'])===2,'Preview preserves and explicitly relocates a newer token from a removed floor.');
    $restore=['type'=>'checkpoint.restoreLayout','operationId'=>'layout-restore-001','payload'=>['checkpointId'=>$checkpoint['id'],'reviewedRevision'=>$preview['baseRevision']]];
    $denied=false;try{$store->restoreCheckpointLayout($restore,'cal',false);}catch(InvalidArgumentException $error){$denied=true;}
    verifyLayout($denied && $store->getSnapshot()===$before,'Players cannot restore layouts.');
    $stale=$restore;$stale['payload']['reviewedRevision']--;
    verifyLayout($store->restoreCheckpointLayout($stale,'GM',true)['status']==='conflict' && $store->getSnapshot()===$before,'Stale preview cannot restore.');
    $fault=new PDO('sqlite:'.$path);
    $fault->exec("CREATE TRIGGER fail_layout BEFORE INSERT ON vtt_events WHEN NEW.event_type = 'scene.layoutRestored' BEGIN SELECT RAISE(ABORT,'interrupted'); END");
    $failed=false;try{$store->restoreCheckpointLayout($restore,'GM',true);}catch(PDOException $error){$failed=true;}
    verifyLayout($failed && $store->getSnapshot()===$before,'Interrupted transaction rolls back every scene domain.');$fault->exec('DROP TRIGGER fail_layout');
    $accepted=$store->restoreCheckpointLayout($restore,'GM',true);$after=$store->getSnapshot();$state=$after['state'];
    verifyLayout($after['revision']===$before['revision']+1,'Layout restoration is one world revision.');
    verifyLayout($state['placements']['scene']['hero']['hp']===22 && $state['placements']['scene']['hero']['conditions']===['Grabbed'],'Current stamina and conditions survive restoration.');
    verifyLayout($state['placements']['scene']['hero']['levelId']==='upper' && (float)$state['placements']['scene']['hero']['column']===2.0,'Existing token returns to the saved floor and coordinates.');
    verifyLayout($state['placements']['scene']['newer']['levelId']==='level-0' && $state['placements']['scene']['newer']['hp']===30,'Newer token survives with the previewed fallback.');
    verifyLayout($state['sceneConfig']['scene']['userLevelState']['cal']['levelId']==='upper' && $state['sceneConfig']['scene']['userLevelState']['sharon']['levelId']==='level-0' && $state['sceneConfig']['scene']['userLevelState']['sharon']['followToken']===false,'Linked following and removed-floor browse repair match the preview.');
    verifyLayout($state['sceneConfig']['scene']['grid']['size']===50 && isset($state['drawings']['scene']['saved-line']) && !isset($state['drawings']['scene']['new-line']) && $state['templates']['scene']['saved-zone']['radius']===3,'Saved grid and content replace edited layout.');
    verifyLayout($state['placements']['other']===$before['state']['placements']['other'] && ($state['routing']??null)===($before['state']['routing']??null),'Other scene and routing remain untouched.');
    $player=vttSyncV2ProjectEventForUser($accepted['event'],['isGM'=>false,'user'=>'cal']);
    verifyLayout(!str_contains(json_encode($player),'/secret-map.jpg'),'Hidden restored floors are not delivered to players.');
    $store->sceneCheckpoints()->remove($checkpoint['id']);
    verifyLayout($store->restoreCheckpointLayout($restore,'GM',true)['idempotent'] && $store->getSnapshot()===$after,'Accepted retry remains idempotent after archive deletion.');
    echo json_encode(['before'=>$before,'after'=>$after,'event'=>$accepted['event'],'playerEvent'=>$player]);
}finally{unset($store,$fault);foreach(['','-wal','-shm']as$suffix)if(is_file($path.$suffix))@unlink($path.$suffix);}
