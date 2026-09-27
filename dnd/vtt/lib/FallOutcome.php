<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
/** Server-owned fall geometry; damage remains an explicitly reviewed outcome. */
final class FallOutcome {
 public static function plan(array $from,array $to,array $config,string $kind,array $path=[],?string $cause=null):?array {
  if(!isset($from['column'],$from['row'],$to['column'],$to['row']))return null;
  if(in_array($kind,['undo','teleport'],true)||FloorGeometry::isAirborne($to))return null;
  $landing=WallMovement::height($to,$config);$top=null;
  if(FloorGeometry::isAirborne($from))$top=(float)($from['flightHeight']??WallMovement::height($from,$config));
  elseif($cause==='fall'||(!empty($from['_supportSurfaceId'])&&empty($to['_supportSurfaceId'])))$top=WallMovement::height($from,$config);
  // Teleport only checks its landing support; never treat the skipped chord as a fall.
  elseif($kind!=='teleport'){
   $previous=$from;
   foreach([...$path,$to] as $point){
    $contact=TerrainContact::first($previous,$point,fn($x,$y)=>WallMovement::terrain($x,$y,$config),fn($p)=>WallMovement::height($p,$config),-1);
    if($contact!==null){$dx=$point['column']-$previous['column'];$dy=$point['row']-$previous['row'];$d=max(abs($dx),abs($dy));$edge=[...$previous,'column'=>$previous['column']+$dx*$contact/$d,'row'=>$previous['row']+$dy*$contact/$d];$top=max($top??-INF,WallMovement::height($edge,$config));}
    $previous=[...$previous,...$point];
   }
  }
  if($top===null||$top-$landing<.999999)return null;
  return ['squares'=>max(0,(int)floor($top-$landing+1e-6)),'fromHeight'=>$top,'landingHeight'=>$landing,'forcedDown'=>false];
 }
 private static function overlaps(array $a,array $b):bool {
  return ($a['levelId']??'level-0')===($b['levelId']??'level-0')&&$a['column']<$b['column']+($b['width']??1)-1e-7&&$a['column']+($a['width']??1)>$b['column']+1e-7&&$a['row']<$b['row']+($b['height']??1)-1e-7&&$a['row']+($a['height']??1)>$b['row']+1e-7;
 }
 public static function landing(array $to,array $others,array $config):array {
  $others=array_values(array_filter($others,fn($p)=>($p['id']??'')!==($to['id']??'')&&!FloorGeometry::isAirborne($p)));
  $hit=array_values(array_filter($others,fn($p)=>self::overlaps($to,$p)));
  if(!$hit)return ['placement'=>$to,'collidedIds'=>[],'relocated'=>false];
  $candidates=[];for($r=1;$r<=20;$r++){
   for($x=-$r;$x<=$r;$x++)for($y=-$r;$y<=$r;$y++)if(max(abs($x),abs($y))===$r)$candidates[]=[$x,$y];
   usort($candidates,fn($a,$b)=>($a[0]**2+$a[1]**2)<=>($b[0]**2+$b[1]**2));
   foreach($candidates as [$x,$y]){
    $p=[...$to,'column'=>round($to['column'])+$x,'row'=>round($to['row'])+$y];
    if($p['column']<0||$p['row']<0||array_filter($others,fn($other)=>self::overlaps($p,$other)))continue;
    if(FloorGeometry::fallingDestination($p,$config['mapLevels']??[],$config['environment']['walls']['value']['roofs']??[])!==null)continue;
    if(abs(WallMovement::height($p,$config)-WallMovement::height($to,$config))>.03)continue;
    if(WallMovement::blocked($config['environment']['walls']['value']??['nodes'=>[],'segments'=>[]],$to,$p,$config))continue;
    return ['placement'=>$p,'collidedIds'=>array_column($hit,'id'),'relocated'=>true];
   }$candidates=[];
  }
  // A packed room must not reject an already valid fall or invent a remote landing.
  return ['placement'=>$to,'collidedIds'=>array_column($hit,'id'),'relocated'=>false,'needsPlacementReview'=>true];
 }
}
