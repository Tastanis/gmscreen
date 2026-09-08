<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') vttSyncV2Respond(405,['success'=>false,'error'=>'POST required.']);
$auth=vttSyncV2RequireAuthenticated();
if (!vttSyncV2DomainEnabled('placements') || !vttSyncV2DomainEnabled('token_movement')) vttSyncV2Respond(503,['success'=>false,'error'=>'Zone entry claims require Sync V2 movement.']);
try {
    $result=vttSyncV2Store()->claimZoneEntry(vttSyncV2ReadJson(),(string)($auth['user'] ?? ''),(bool)($auth['isGM'] ?? false));
    vttSyncV2Respond(200,['success'=>true,...$result]);
} catch (InvalidArgumentException $error) {
    vttSyncV2Respond(422,['success'=>false,'error'=>$error->getMessage()]);
} catch (Throwable $error) {
    error_log('[VTT] Zone entry claim failed: '.$error->getMessage());
    vttSyncV2Respond(500,['success'=>false,'error'=>'Unable to reserve zone entry.']);
}
