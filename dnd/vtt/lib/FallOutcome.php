<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
require_once __DIR__.'/WallObjects.php';
/** Server-owned fall geometry; damage remains an explicitly reviewed outcome. */
final class FallOutcome {
 public static function plan(array $from,array $to,array $config,string $kind,array $path=[],?string $cause=null):?array {
  if(!isset($from['column'],$from['row'],$to['column'],$to['row']))return null;
  if(in_array($kind,['undo','teleport'],true)||FloorGeometry::isAirborne($to))return null;
  $landing=WallMovement::height($to,$config);$top=null;
  if(FloorGeometry::isAirborne($from))$top=(float)($from['flightHeight']??WallMovement::height($from,$config));
  // Leaving a floor plate for no plate is a drop from the plate, unless the creature left it onto
  // a stair or ramp that now carries it: going down a ramp is not a fall, however far in one move.
  elseif($cause==='fall'||(!empty($from['_supportSurfaceId'])&&empty($to['_supportSurfaceId'])&&!FloorGeometry::carriedByStair($to,$config['mapLevels']??[])))$top=WallMovement::height($from,$config);
  // Teleport only checks its landing support; never treat the skipped chord as a fall.
  elseif($kind!=='teleport'){
   $terrain=fn($x,$y)=>WallMovement::terrain($x,$y,$config);$standing=fn($p)=>WallMovement::height($p,$config);
   $previous=$from;
   foreach([...$path,$to] as $point){
    $dx=$point['column']-$previous['column'];$dy=$point['row']-$previous['row'];$d=max(abs($dx),abs($dy));
    $at=fn($s)=>[...$previous,'column'=>$previous['column']+$dx*$s/$d,'row'=>$previous['row']+$dy*$s/$d];
    $contact=$d>1e-7?TerrainContact::first($previous,$point,$terrain,$standing,-1):null;
    // The top of a fall is the middle of the square the creature left, the same place a climb up
    // the face is measured from, so one face is the same height going up and coming down.
    if($contact!==null)$top=max($top??-INF,$standing($at(floor($contact+1e-6))));
    // A face gentler than the sharp drop looked for above can still be a climb of two squares or
    // more going up (a 1.9-high bank). Coming down it is then a fall of the same height.
    elseif($d>1e-7){
     for($i=0;$i<ceil($d-1e-6);$i++){
      $upper=$at($i);$lower=$at(min($d,$i+1));$high=$standing($upper);
      if($high-$standing($lower)>=1.5-1e-6&&TerrainContact::first($lower,$upper,$terrain,$standing)!==null){$top=max($top??-INF,$high);break;}
     }
    }
    $previous=[...$previous,...$point];
   }
  }
  if($top===null||$top-$landing<.999999)return null;
  // The nearest whole square, as a climb up the same face is counted (stepRise in terrain-math.mjs):
  // a 3.75-high face is 4 squares both ways. A drop of less than one square is still no fall.
  return ['squares'=>max(1,(int)floor($top-$landing+.5+1e-6)),'fromHeight'=>$top,'landingHeight'=>$landing,'forcedDown'=>false];
 }
 private static function overlaps(array $a,array $b):bool {
  return ($a['levelId']??'level-0')===($b['levelId']??'level-0')&&$a['column']<$b['column']+($b['width']??1)-1e-7&&$a['column']+($a['width']??1)>$b['column']+1e-7&&$a['row']<$b['row']+($b['height']??1)-1e-7&&$a['row']+($a['height']??1)>$b['row']+1e-7;
 }
 /** A landing this close in height to the one fallen to is the same fall. */
 public const LANDING_STEP=.5;
 /**
  * Where a falling creature ends up, and what it lands on.
  * - On another creature: both are hit and the faller is put in the nearest free square.
  * - On a thing that can be broken (a wall with a material running through the square): it stays
  *   there and `breaks` lists that thing's walls. They are broken when the fall is confirmed.
  * - On a thing that cannot be broken: the nearest free square, so no creature is left walled in.
  */
 public static function landing(array $to,array $others,array $config):array {
  $others=array_values(array_filter($others,fn($p)=>($p['id']??'')!==($to['id']??'')&&!FloorGeometry::isAirborne($p)));
  $hit=array_values(array_filter($others,fn($p)=>self::overlaps($to,$p)));
  $under=WallObjects::under($to,$config);
  $solid=array_filter($under,fn($edge)=>!WallObjects::breakable($edge));
  if(!$hit&&!$solid)return ['placement'=>$to,'collidedIds'=>[],'relocated'=>false,...($under?['breaks'=>WallObjects::whole($under,$config)]:[])];
  // The walls under the faller are what it is leaving; they do not bar the way off them.
  $model=$config['environment']['walls']['value']??['nodes'=>[],'segments'=>[]];
  if($under){$leaving=array_column($under,'id');$model['segments']=array_values(array_filter($model['segments']??[],fn($edge)=>!in_array($edge['id'],$leaving,true)));}
  $candidates=[];for($r=1;$r<=20;$r++){
   for($x=-$r;$x<=$r;$x++)for($y=-$r;$y<=$r;$y++)if(max(abs($x),abs($y))===$r)$candidates[]=[$x,$y];
   usort($candidates,fn($a,$b)=>($a[0]**2+$a[1]**2)<=>($b[0]**2+$b[1]**2));
   foreach($candidates as [$x,$y]){
    $p=[...$to,'column'=>round($to['column'])+$x,'row'=>round($to['row'])+$y];
    if($p['column']<0||$p['row']<0||array_filter($others,fn($other)=>self::overlaps($p,$other)))continue;
    if(FloorGeometry::fallingDestination($p,$config['mapLevels']??[],FloorSupport::surfaces($config['environment']['walls']['value']??[]))!==null)continue;
    if(abs(WallMovement::height($p,$config)-WallMovement::height($to,$config))>=self::LANDING_STEP)continue;
    if(WallObjects::under($p,$config))continue;
    if(!empty($model['segments'])&&WallMovement::blocked($model,$to,$p,$config))continue;
    return ['placement'=>$p,'collidedIds'=>array_column($hit,'id'),'relocated'=>true];
   }$candidates=[];
  }
  // A packed room must not reject an already valid fall or invent a remote landing.
  return ['placement'=>$to,'collidedIds'=>array_column($hit,'id'),'relocated'=>false,'needsPlacementReview'=>true];
 }
}
