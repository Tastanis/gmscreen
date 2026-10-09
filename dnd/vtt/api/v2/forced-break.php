<?php
declare(strict_types=1);
// What a push would break if it were told to break through, asked before the push is made so
// the pop-up can show it. Reads only; the push itself is an ordinary movement command.
require_once __DIR__.'/_common.php';
$auth=vttSyncV2RequireAuthenticated();
if(($_SERVER['REQUEST_METHOD']??'')!=='POST')vttSyncV2Respond(405,['success'=>false,'error'=>'POST required.']);
try{
 $request=vttSyncV2ReadJson();
 foreach(['sceneId','placementId'] as $key)if(!is_string($request[$key]??null)||$request[$key]===''||strlen($request[$key])>160)throw new InvalidArgumentException('Invalid break-through request.');
 $offer=vttSyncV2Store()->forcedBreakOffer($request['sceneId'],$request['placementId'],$request['destination']??null,(bool)$auth['isGM']);
 vttSyncV2Respond(200,['success'=>true,'result'=>$offer]);
}catch(InvalidArgumentException $e){vttSyncV2Respond(422,['success'=>false,'error'=>$e->getMessage()]);}
catch(Throwable $e){error_log('[VTT] Break-through offer: '.$e->getMessage());vttSyncV2Respond(500,['success'=>false,'error'=>'Break-through offer is unavailable.']);}
