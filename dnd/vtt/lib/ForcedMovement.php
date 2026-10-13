<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
require_once __DIR__.'/WallObjects.php';
/** Pure collision planning against the current canonical scene. */
final class ForcedMovement
{
 public static function resolve(array $from,array $to,array $others,array $config): array {
  $dx=$to['column']-$from['column'];$dy=$to['row']-$from['row'];$distance=max(abs($dx),abs($dy));
  if(!$distance)return ['column'=>$to['column'],'row'=>$to['row'],'damage'=>0,'collidedIds'=>[],'wall'=>false];
  $stop=1.;$ids=[];$wall=false;
  $at=fn($t)=>[...$from,'column'=>$from['column']+$dx*$t,'row'=>$from['row']+$dy*$t];
  $travel=new TravelPath($from,$config,'forced');
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
   // The mover's height where it would meet the other creature is the height it is travelling
   // at, so a creature pushed off an island does not hit one standing on the ground under it.
   $z=$travel->heightAt($at($lo));$oz=WallMovement::height($other,$config);
   if($z>=$oz+max($other['width']??1,$other['height']??1)-1e-8||$oz>=$z+max($from['width']??1,$from['height']??1)-1e-8)continue;
   if($lo<$stop-1e-8){$stop=$lo;$ids=[];}$ids[]=$other['id'];
  }
  $blocked=function($point)use($from,$config,$travel){try{WallMovement::assertAllowed($from,$point,$config,'forced',[],true,$travel);return false;}catch(InvalidArgumentException $e){return true;}};
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
 /** The book's Hurling Through Objects: forced movement a square of each material costs to break. */
 public const BREAK_COST=WallObjects::STAMINA;
 /** And the damage the creature hurled through it takes: in every row of the book's table, the cost plus 2. */
 public const BREAK_DAMAGE=['glass'=>3,'wood'=>5,'stone'=>8,'metal'=>11];
 public const BREAK_EXTRA=2;

 /**
  * The same push, breaking through what it can on the way.
  *
  * At each wall that stops it: if every wall it strikes can be broken and enough of the push is
  * left to pay for them, they break, the push is shorter by what they cost, and it carries on.
  * A large creature that strikes two squares of wall pays for both. An object's walls (one
  * `group`) all go for the price of the side that was struck. Otherwise the push ends there as
  * an ordinary slam.
  *
  * Returns the plan `resolve` would give for the shortened push through the broken walls, plus:
  * breaks (the walls to mark broken), breakDamage (for the pushed creature alone), intent (where
  * the shortened push aims), steps (one line per break, for the pop-up) and stopped (the plain
  * plan, as if nothing could be broken). `breaks` is empty when nothing breaks.
  */
 public static function through(array $from,array $to,array $others,array $config): array {
  $stopped=self::resolve($from,$to,$others,$config);
  $dx=$to['column']-$from['column'];$dy=$to['row']-$from['row'];$distance=max(abs($dx),abs($dy));
  $plan=$stopped;$intent=['column'=>$to['column'],'row'=>$to['row']];$spent=0;$damage=0;$breaks=[];$steps=[];$open=$config;
  for($n=0;$n<8&&$distance&&$plan['wall'];$n++){
   $model=$open['environment']['walls']['value']??[];
   if(empty($model['segments']))break;
   $aim=[...$from,...$intent];
   $struck=WallMovement::struck($model,$from,$aim,$open,'forced');
   $travelled=max(abs($plan['column']-$from['column']),abs($plan['row']-$from['row']));
   // The wall must be what stopped it; a slope or a cliff ahead of the wall is not broken through.
   if($struck===null||$struck['distance']>$travelled+.75+1e-6)break;
   $need=0;$hurt=0;$materials=[];
   foreach($struck['walls'] as $wall){
    if(!WallObjects::breakable($wall['edge'])){$need=null;break;}
    // A wall with a stated Stamina is priced the way the book prices its four materials.
    $stamina=WallObjects::stamina($wall['edge']);$name=$wall['edge']['breakLabel']??$wall['edge']['material'];
    $need+=$stamina*$wall['squares'];$hurt+=($stamina+self::BREAK_EXTRA)*$wall['squares'];
    $materials[$name]=($materials[$name]??0)+$wall['squares'];
   }
   $left=(int)round(max(abs($intent['column']-$from['column']),abs($intent['row']-$from['row']))-$travelled);
   if($need===null||$left<$need-1e-6)break;
   $whole=WallObjects::whole(array_column($struck['walls'],'edge'),$open);$ids=array_column($whole,'id');
   foreach($open['environment']['walls']['value']['segments'] as $i=>$edge)if(in_array($edge['id'],$ids,true))$open['environment']['walls']['value']['segments'][$i]['broken']=true;
   $breaks=[...$breaks,...$whole];$spent+=$need;$damage+=$hurt;
   $steps[]=['materials'=>$materials,'cost'=>$need,'damage'=>$hurt,'left'=>$left];
   // What is left of the push carries the creature on from where it would have ended, less the cost.
   $reach=$distance-$spent;
   $intent=['column'=>(int)round($from['column']+$dx*$reach/$distance),'row'=>(int)round($from['row']+$dy*$reach/$distance)];
   $plan=self::resolve($from,[...$from,...$intent],$others,$open);
  }
  return [...$plan,'breaks'=>$breaks,'breakDamage'=>$damage,'breakCost'=>$spent,'intent'=>$intent,'steps'=>$steps,'stopped'=>$stopped];
 }
 public static function assertIntent($intent): void {
  if(!is_array($intent))throw new InvalidArgumentException('Invalid forced destination.');
  foreach(['column','row'] as $axis)if(!isset($intent[$axis])||!is_numeric($intent[$axis])||!is_finite((float)$intent[$axis])||$intent[$axis]<0||$intent[$axis]>100000)throw new InvalidArgumentException('Invalid forced destination coordinates.');
  if(array_key_exists('beyond',$intent)&&(!is_int($intent['beyond'])||$intent['beyond']<0||$intent['beyond']>self::MAX_BEYOND))throw new InvalidArgumentException('Invalid forced movement remaining.');
  if(array_key_exists('by',$intent)){$by=$intent['by'];if(!is_array($by)||array_diff(array_keys($by),['id','verb'])||!is_string($by['id']??null)||$by['id']===''||strlen($by['id'])>128||!in_array($by['verb']??null,['push','pull'],true))throw new InvalidArgumentException('Invalid forced movement source.');}
 }
 /**
  * The one straight line a push or a pull goes along. Brandon, October 12, 2026: "Ability pushes go in a straight
  * line, yes." The line runs from the pusher's middle through the target's middle and on (for a pull, from the
  * target's middle toward the puller's). This is its square `$squares` along from where the target stands,
  * rounded to a square, a half going outward; null when the two share a middle. Paired with forcedLineCell in
  * forced-move-cells.js, which is what the picker offers.
  */
 public static function lineCell(array $source,array $target,int $squares,string $verb): ?array {
  $middle=static fn(array $p):array=>[($p['column']??0)+max(1,$p['width']??1)/2,($p['row']??0)+max(1,$p['height']??1)/2];
  [$ax,$ay]=$middle($source);[$bx,$by]=$middle($target);$sign=$verb==='pull'?-1:1;
  $dx=($bx-$ax)*$sign;$dy=($by-$ay)*$sign;$reach=max(abs($dx),abs($dy));
  if($reach<1e-9)return null;
  $outward=static fn(float $v):int=>($v<=>0)*(int)floor(abs($v)+.5);
  return ['column'=>(int)floor($target['column'])+$outward($squares*$dx/$reach),'row'=>(int)floor($target['row'])+$outward($squares*$dy/$reach)];
 }
 /**
  * A forced move that says which creature's push or pull it is (`by`: its id and the verb) must aim along that
  * creature's line. One that names nobody is the Director's own forced drag, or a slide, and goes where it is put.
  * A pusher that is no longer on the map has no line to check against.
  */
 public static function assertLine(array $from,array $intent,array $others): void {
  $by=$intent['by']??null;if(!is_array($by))return;
  $source=null;foreach($others as $other)if(($other['id']??null)===$by['id']){$source=$other;break;}
  if($source===null||($source['id']??null)===($from['id']??null))return;
  $squares=(int)round(max(abs($intent['column']-floor($from['column'])),abs($intent['row']-floor($from['row']))));
  if($squares<1)return;
  $cell=self::lineCell($source,$from,$squares,$by['verb']);
  if($cell!==null&&(abs($cell['column']-$intent['column'])>1e-6||abs($cell['row']-$intent['row'])>1e-6))throw new InvalidArgumentException($by['verb']==='pull'?'A pull goes in a straight line toward the puller.':'A push goes in a straight line away from the pusher.');
 }
 /** The most squares a slide may still have to come after one of its legs. */
 public const MAX_BEYOND=1000;
 public static function plan(array $from,array $to,$intent,string $kind,array $others,array $config): array {
  if($kind!=='forced')throw new InvalidArgumentException('Invalid forced destination.');
  self::assertIntent($intent);
  self::assertLine($from,$intent,$others);
  $plan=self::resolve($from,$intent,$others,$config);
  if(abs($plan['column']-$to['column'])>1e-6||abs($plan['row']-$to['row'])>1e-6)throw new InvalidArgumentException('Collision changed. Recalculate the forced move.');
  // A slide is made leg by leg (forced-line.mjs). `beyond` is what was still to come after this leg: when
  // the leg is stopped short by a creature or a wall, the slide ends there and those squares are left over too.
  if(($intent['beyond']??0)>0&&($plan['wall']||$plan['collidedIds']))$plan['damage']+=$intent['beyond'];
  return $plan;
 }
 public static function assertClear(array $from,array $to,array $others,array $config): void {
  $r=self::resolve($from,$to,$others,$config);
  if(abs($r['column']-$to['column'])>1e-6||abs($r['row']-$to['row'])>1e-6)throw new InvalidArgumentException('Forced movement blocked. Recalculate against current obstacles.');
 }
}
