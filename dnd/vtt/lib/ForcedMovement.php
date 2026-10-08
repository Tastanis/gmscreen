<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
/** Pure collision planning against the current canonical scene. */
final class ForcedMovement
{
 public static function resolve(array $from,array $to,array $others,array $config): array {
  $dx=$to['column']-$from['column'];$dy=$to['row']-$from['row'];$distance=max(abs($dx),abs($dy));
  if(!$distance)return ['column'=>$to['column'],'row'=>$to['row'],'damage'=>0,'collidedIds'=>[],'wall'=>false];
  $stop=1.;$ids=[];$wall=false;
  $at=fn($t)=>[...$from,'column'=>$from['column']+$dx*$t,'row'=>$from['row']+$dy*$t];
  foreach($others as $other){
   if(($other['id']??null)===($from['id']??null))continue;
   // Different floor labels may still contain fliers at the same absolute height.
   if(($other['levelId']??'level-0')!==($from['levelId']??'level-0')&&!FloorGeometry::isAirborne($other)&&!FloorGeometry::isAirborne($from))continue;
   $lo=0.;$hi=1.;
   foreach([[$from['column'],$dx,$other['column']-($from['width']??1),$other['column']+($other['width']??1)],[$from['row'],$dy,$other['row']-($from['height']??1),$other['row']+($other['height']??1)]] as [$p,$d,$min,$max]){
    if(!$d){if($p<=$min+1e-8||$p>=$max-1e-8){$hi=-1;break;}}
    else{$a=($min-$p)/$d;$b=($max-$p)/$d;$lo=max($lo,min($a,$b));$hi=min($hi,max($a,$b));}
   }
   if($lo>=$hi-1e-8||$lo>$stop+1e-8)continue;
   if($from['column']<$other['column']+($other['width']??1)-1e-8&&$from['column']+($from['width']??1)>$other['column']+1e-8&&$from['row']<$other['row']+($other['height']??1)-1e-8&&$from['row']+($from['height']??1)>$other['row']+1e-8)continue;
   $z=WallMovement::height($at($lo),$config);$oz=WallMovement::height($other,$config);
   if($z>=$oz+max($other['width']??1,$other['height']??1)-1e-8||$oz>=$z+max($from['width']??1,$from['height']??1)-1e-8)continue;
   if($lo<$stop-1e-8){$stop=$lo;$ids=[];}$ids[]=$other['id'];
  }
  $blocked=function($point)use($from,$config){try{WallMovement::assertAllowed($from,$point,$config,'forced',[],true);return false;}catch(InvalidArgumentException $e){return true;}};
  if($blocked($at($stop))){$lo=0.;$hi=$stop;for($i=0;$i<32;$i++){$mid=($lo+$hi)/2;if($blocked($at($mid)))$hi=$mid;else $lo=$mid;}if($lo<$stop-1e-6)$ids=[];$stop=$lo;$wall=true;}
  if($wall){$travel=$distance*$stop;$whole=floor($travel+1e-6);$steps=$whole+($travel-$whole>=.75-1e-6?1:0);$stop=min(1,$steps/$distance);}
  // A creature stops the mover in the last whole square before contact, so no token is left between squares.
  $cell=null;
  if(!$wall&&$ids){
   $square=fn($n)=>['column'=>round($from['column']+$dx*$n/$distance),'row'=>round($from['row']+$dy*$n/$distance)];
   $overlaps=function($p)use($others,$ids,$from){
    foreach($others as $o){
     if(!in_array($o['id']??null,$ids,true))continue;
     if($p['column']<$o['column']+($o['width']??1)-1e-8&&$p['column']+($from['width']??1)>$o['column']+1e-8&&$p['row']<$o['row']+($o['height']??1)-1e-8&&$p['row']+($from['height']??1)>$o['row']+1e-8)return true;
    }
    return false;
   };
   $steps=(int)floor($distance*$stop+1e-6);
   while($steps>0&&$overlaps($square($steps)))$steps--;
   $cell=$square($steps);$stop=$steps/$distance;
  }
  return ['column'=>$cell?$cell['column']:($wall?round($from['column']+$dx*$stop):$from['column']+$dx*$stop),'row'=>$cell?$cell['row']:($wall?round($from['row']+$dy*$stop):$from['row']+$dy*$stop),'damage'=>max(0,(int)ceil($distance*(1-$stop)-1e-6))+($wall?2:0),'collidedIds'=>array_values(array_unique($ids)),'wall'=>$wall];
 }
 public static function plan(array $from,array $to,$intent,string $kind,array $others,array $config): array {
  if($kind!=='forced'||!is_array($intent))throw new InvalidArgumentException('Invalid forced destination.');
  foreach(['column','row'] as $axis)if(!isset($intent[$axis])||!is_numeric($intent[$axis])||!is_finite((float)$intent[$axis])||$intent[$axis]<0||$intent[$axis]>100000)throw new InvalidArgumentException('Invalid forced destination coordinates.');
  $plan=self::resolve($from,$intent,$others,$config);
  if(abs($plan['column']-$to['column'])>1e-6||abs($plan['row']-$to['row'])>1e-6)throw new InvalidArgumentException('Collision changed. Recalculate the forced move.');
  return $plan;
 }
 public static function assertClear(array $from,array $to,array $others,array $config): void {
  $r=self::resolve($from,$to,$others,$config);
  if(abs($r['column']-$to['column'])>1e-6||abs($r['row']-$to['row'])>1e-6)throw new InvalidArgumentException('Forced movement blocked. Recalculate against current obstacles.');
 }
}
