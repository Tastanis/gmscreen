<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
if (!in_array($_SERVER['REQUEST_METHOD'] ?? '',['GET','POST'],true)) vttSyncV2Respond(405,['success'=>false,'error'=>'GET or POST required.']);
$auth=vttSyncV2RequireAuthenticated();
if (!vttSyncV2DomainEnabled('placements') || !vttSyncV2DomainEnabled('token_movement')) vttSyncV2Respond(503,['success'=>false,'error'=>'Zone entry claims require Sync V2 movement.']);
try {
    $actor=(string)($auth['user'] ?? '');$isGm=(bool)($auth['isGM'] ?? false);
    if ($_SERVER['REQUEST_METHOD']==='GET') vttSyncV2Respond(200,['success'=>true,'claims'=>vttSyncV2Store()->unresolvedZoneEntries($actor,$isGm),'limit'=>200]);
    $request=vttSyncV2ReadJson();$action=$request['action'] ?? 'claim';
    if (!in_array($action,['claim','finish'],true)) throw new InvalidArgumentException('Unknown claim action.');
    $result=$action==='finish'?vttSyncV2Store()->finishZoneEntry($request,$actor,$isGm):vttSyncV2Store()->claimZoneEntry($request,$actor,$isGm);
    vttSyncV2Respond(200,['success'=>true,...$result]);
} catch (InvalidArgumentException $error) {
    vttSyncV2Respond(422,['success'=>false,'error'=>$error->getMessage()]);
} catch (Throwable $error) {
    error_log('[VTT] Zone entry claim failed: '.$error->getMessage());
    vttSyncV2Respond(500,['success'=>false,'error'=>'Unable to process zone entry claims.']);
}
