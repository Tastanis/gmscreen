<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/SyncV2Store.php';
if(!isset($argv[1])||!is_file($argv[1]))throw new InvalidArgumentException('Pass a local scene package to read.');
$package=json_decode(file_get_contents($argv[1]),true,512,JSON_THROW_ON_ERROR);$config=($package['package']??$package)['domains']['sceneConfig'];
$path=sys_get_temp_dir().DIRECTORY_SEPARATOR.'vtt-benchmark-'.bin2hex(random_bytes(8)).'.sqlite';
function medianMs(callable $call,int $iterations=25):float{$values=[];for($i=0;$i<$iterations;$i++){$start=hrtime(true);$call();$values[]=(hrtime(true)-$start)/1e6;}sort($values);return $values[intdiv(count($values),2)];}
try{
 $store=new SyncV2Store($path);$property=new ReflectionProperty(SyncV2Store::class,'pdo');$pdo=$property->getValue($store);
 $state=['sceneConfig'=>[]];for($i=0;$i<8;$i++)$state['sceneConfig']['benchmark-scene-'.$i]=$config;
 // Saved through the store itself, so it lands wherever the store keeps the world (SyncV2Layout).
 $json=json_encode($state,JSON_THROW_ON_ERROR);$save=new ReflectionMethod(SyncV2Store::class,'updateWorldState');$save->invoke($store,0,$state,(int)floor(microtime(true)*1000));
 // Every read unpacking the whole world from the file, as it was before the request cache: a new store each time.
 $uncached=static function(PDO $db)use($path):array{return (new SyncV2Store($path))->getSnapshot();};
 $legacyIdle=medianMs(fn()=>$uncached($pdo));$idle=medianMs(fn()=>$store->replayAfter(0));
 $store->getSnapshot();$cached=medianMs(fn()=>$store->getSnapshot());
 $legacyRequest=medianMs(function()use($path,$property,$uncached){$s=new SyncV2Store($path);$uncached($property->getValue($s));},10);
 $request=medianMs(function()use($path){$s=new SyncV2Store($path);$s->replayAfter(0);},10);
 echo json_encode(['worldJsonBytes'=>strlen($json),'scenes'=>8,'legacyIdleDecodeMedianMs'=>$legacyIdle,'revisionOnlyIdleMedianMs'=>$idle,'cachedProjectionSnapshotMedianMs'=>$cached,'legacyRequestStoreAndIdleMedianMs'=>$legacyRequest,'requestStoreAndIdleMedianMs'=>$request],JSON_PRETTY_PRINT)."\n";
}finally{unset($save,$pdo,$store);foreach(['','-wal','-shm'] as $suffix)if(is_file($path.$suffix))unlink($path.$suffix);}
