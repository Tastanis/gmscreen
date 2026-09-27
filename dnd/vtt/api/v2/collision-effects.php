<?php
declare(strict_types=1);
require_once __DIR__.'/_common.php';
$auth=vttSyncV2RequireAuthenticated();
$method=$_SERVER['REQUEST_METHOD']??'';
if(!in_array($method,['GET','POST'],true))vttSyncV2Respond(405,['success'=>false,'error'=>'GET or POST required.']);
try{
 $request=$method==='GET'?$_GET:vttSyncV2ReadJson();
 $result=vttSyncV2Store()->collisionEffects($request,(string)$auth['user'],(bool)$auth['isGM'],$method==='POST');
 vttSyncV2Respond(200,['success'=>true,'result'=>$result]);
}catch(InvalidArgumentException $e){vttSyncV2Respond(422,['success'=>false,'error'=>$e->getMessage()]);}
catch(Throwable $e){error_log('[VTT] Collision outcome: '.$e->getMessage());vttSyncV2Respond(500,['success'=>false,'error'=>'Collision outcome is uncertain.']);}
