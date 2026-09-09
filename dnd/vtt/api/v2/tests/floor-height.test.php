<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$database = sys_get_temp_dir() . '/vtt-height-' . bin2hex(random_bytes(8)) . '.sqlite';
function checkHeight(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
 $store = new SyncV2Store($database);
 $board = ['placements'=>['scene'=>[['id'=>'hero','column'=>2,'row'=>3,'levelId'=>'upper']]],
   'sceneState'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','zIndex'=>0]]]]]];
 $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
 $before=$store->getSnapshot();
 $command=['type'=>'levels.set','operationId'=>'save-height','sceneId'=>'scene','baseRevision'=>$before['revision'],
 'entityRevision'=>$before['state']['sceneConfig']['scene']['_revision'],
 'payload'=>['mapLevels'=>['levels'=>[['id'=>'upper','zIndex'=>0,'elevationSquares'=>5]]]]];
 $store->acceptBoardDomainCommand($command,'GM',true);
 $saved=$store->getSnapshot();
 checkHeight($saved['state']['sceneConfig']['scene']['mapLevels']['levels'][0]['elevationSquares']===5,'Saved height');
 checkHeight($saved['state']['placements']===$before['state']['placements'],'Height editing does not change token data');
 checkHeight($store->acceptBoardDomainCommand($command,'GM',true)['idempotent'],'Retry is idempotent');
 unset($store); $store=new SyncV2Store($database);
 checkHeight($store->getSnapshot()===$saved,'Height survives reopening database');
 foreach ([null,true,'5',0,-1,1.5,1000001] as $index=>$invalid) {
  $attempt=$command; $attempt['operationId']='invalid-height-'.$index;
  $attempt['baseRevision']=$saved['revision'];
  $attempt['entityRevision']=$saved['state']['sceneConfig']['scene']['_revision'];
  $attempt['payload']['mapLevels']['levels'][0]['elevationSquares']=$invalid;
  $rejected=false;
  try { $store->acceptBoardDomainCommand($attempt,'GM',true); } catch (InvalidArgumentException $error) { $rejected=true; }
  checkHeight($rejected,'Reject invalid height '.json_encode($invalid));
  checkHeight($store->getSnapshot()===$saved,'Invalid height preserves entire state');
 }
 echo "PASS floor height save, reload, idempotency, and invalid input preservation\n";
} finally { unset($store); foreach ([$database,$database.'-wal',$database.'-shm'] as $file) if(is_file($file))unlink($file); }
