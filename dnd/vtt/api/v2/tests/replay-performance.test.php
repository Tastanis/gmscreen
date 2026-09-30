<?php
declare(strict_types=1);
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function replayCheck(bool $value,string $message):void{if(!$value)throw new RuntimeException($message);}
$path=sys_get_temp_dir().DIRECTORY_SEPARATOR.'vtt-replay-'.bin2hex(random_bytes(8)).'.sqlite';
try{
 $store=new SyncV2Store($path,'replay-test',100,1,2);
 $accept=static function(SyncV2Store $s,int $n):array{return $s->acceptShadowCommand(['type'=>'shadow.observe','operationId'=>'replay-operation-'.$n,'baseRevision'=>$s->getSnapshot()['revision'],'payload'=>['step'=>$n]],'GM');};
 for($n=1;$n<=3;$n++)$accept($store,$n);
 replayCheck($store->replayAfter(3)===['mode'=>'events','fromRevision'=>3,'revision'=>3,'events'=>[]],'Current cursor returns an empty event contract.');
 $events=$store->replayAfter(1);replayCheck(array_column($events['events'],'revision')===[2,3]&&$events['revision']===3,'Replay stays contiguous through declared cursor.');
 $limited=$store->replayAfter(0,1);replayCheck($limited['mode']==='snapshot'&&$limited['reason']==='event_limit_exceeded','Limit still returns a full authoritative snapshot.');
 $copy=$store->getSnapshot();$copy['state']['shadow']['observations'][0]['payload']['step']=999;
 replayCheck($store->getSnapshot()['state']['shadow']['observations'][0]['payload']['step']===1,'Caller mutation cannot alter cached canonical snapshot.');
 $other=new SyncV2Store($path,'replay-test',100,1,2);$accept($other,4);
 replayCheck($store->getSnapshot()['revision']===4,'Foreign canonical writer invalidates request cache.');
 $pdo=new PDO('sqlite:'.$path);$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
 // Migration metadata can write at the same revision and within one millisecond.
 $state=$store->getSnapshot()['state'];$state['migrationProbe']='fresh';$update=$pdo->prepare('UPDATE vtt_world_state SET state_json=? WHERE world_id=?');$update->execute([json_encode($state),'replay-test']);
 replayCheck(($store->getSnapshot()['state']['migrationProbe']??null)==='fresh','Foreign same-revision write invalidates cache.');
 $pdo->exec("DELETE FROM vtt_events WHERE world_id='replay-test' AND revision=2");
 $gap=$store->replayAfter(1);replayCheck($gap['mode']==='snapshot'&&$gap['snapshot']['revision']===4,'Missing internal revision never masquerades as complete events.');
 $pdo->exec("DELETE FROM vtt_events WHERE world_id='replay-test'");
 replayCheck($store->replayAfter(0)['mode']==='snapshot','Empty retained history still recovers authoritative state.');
 $duplicate=$store->acceptShadowCommand(['type'=>'shadow.observe','operationId'=>'replay-operation-1','baseRevision'=>0,'payload'=>['step'=>1]],'GM');
 replayCheck($duplicate['idempotent']&&$duplicate['event']['revision']===1&&$store->getSnapshot()['revision']===4,'Replay optimization never prunes operation authority.');
 $before=$store->getSnapshot();$pdo->exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON vtt_snapshots BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
 try{$accept($store,5);throw new RuntimeException('Rollback fixture accepted.');}catch(PDOException $error){replayCheck(str_contains($error->getMessage(),'fixture rollback'),'Expected injected rollback failure.');}
 replayCheck($store->getSnapshot()===$before,'Failed transaction does not leave a cached uncommitted world.');
 echo "Replay performance: idle cursor, contiguous/limited/gap recovery, cache isolation/foreign writes, rollback and durable retries passed.\n";
}finally{unset($error,$update,$pdo,$other,$store);foreach(['','-wal','-shm'] as $suffix)if(is_file($path.$suffix))unlink($path.$suffix);}
