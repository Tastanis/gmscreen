<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
define('VTT_SCENES_API_INCLUDE_ONLY', true);
require_once __DIR__ . '/../scenes.php';
try {
    $auth = vttSyncV2RequireGm('Only the GM may import scenes.');
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') vttSyncV2Respond(405,['success'=>false,'error'=>'Method not allowed.']);
    $raw = file_get_contents('php://input', false, null, 0, 33554433);
    if ($raw === false || strlen($raw)>33554432) throw new InvalidArgumentException('Scene request is too large (32 MB maximum).');
    try { $request = json_decode($raw,true,128,JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new InvalidArgumentException('The file is not valid scene JSON.'); }
    if (!is_array($request['package'] ?? null) || !is_string($request['operationId'] ?? null)) throw new InvalidArgumentException('A scene package and operation ID are required.');
    if (($request['allowPlayerBrowsing'] ?? null) !== true) throw new InvalidArgumentException('Confirm that players may browse the imported scene.');
    $result = withVttBoardStateLock(static function () use ($request,$auth): array {
        $store = vttSyncV2Store();
        $catalog = SceneImportCatalog::recover($store,loadScenesPayload(),'persistScenes');
        $result = $store->installScenePackage($request['package'],$request['operationId'],(string)($auth['user'] ?? 'gm'),true);
        if (!isset($store->getSnapshot()['state']['sceneConfig'][$result['scene']['id']])) throw new InvalidArgumentException('This import was already completed and its scene was later deleted. Choose the file again to create a new copy.');
        SceneImportCatalog::recover($store,$catalog,'persistScenes');
        return $result;
    });
    SyncV2PusherTransport::publishAudiences($result['event'],vttSyncV2ProjectEventForUser($result['event'],['isGM'=>false]));
    vttSyncV2Respond(200,['success'=>true,'scene'=>$result['scene'],'idempotent'=>$result['idempotent']]);
} catch (Throwable $error) { vttSyncV2HandleFailure($error); }
