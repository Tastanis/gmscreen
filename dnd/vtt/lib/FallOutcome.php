<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
require_once __DIR__.'/WallObjects.php';
require_once __DIR__.'/MapLabels.php';
/** Server-owned fall geometry; damage remains an explicitly reviewed outcome. */
final class FallOutcome {
 public static function plan(array $from,array $to,array $config,string $kind,array $path=[],?string $cause=null,bool $climbedDown=false):?array {
  if(!isset($from['column'],$from['row'],$to['column'],$to['row']))return null;
  if(in_array($kind,['undo','teleport'],true)||FloorGeometry::isAirborne($to))return null;
  $landing=WallMovement::height($to,$config);$top=null;
  if(FloorGeometry::isAirborne($from))$top=(float)($from['flightHeight']??WallMovement::height($from,$config));
  // A creature that changed floors by walking the length of a stair, ramp or vine walked down it.
  // Without this, coming down one that ends on the ground (no plate at its foot) in a single move
  // was a fall of its whole height: 12 squares for the Orchard's vine from the ground to a mid island.
  elseif($cause==='stairs')$top=null;
  // Leaving a floor plate for no plate is a drop from the plate, unless the creature left it onto
  // a stair or ramp that now carries it: going down a ramp is not a fall, however far in one move.
  elseif($cause==='fall'||(!empty($from['_supportSurfaceId'])&&empty($to['_supportSurfaceId'])&&!FloorGeometry::carriedByStair($to,$config['mapLevels']??[]))){
   $top=WallMovement::height($from,$config);
   // ...and unless it walked off the plate onto land. Where its square leaves the plate, ground
   // less than a square below the plate is land the plate rests on (the head of a stair, a bank),
   // not a drop: from there the move is over ground, and is judged as any move over ground is.
   // It used to be measured from the plate to wherever the move ended, so one drag from a walkway
   // down the stair at its end was a fall of the stair's whole height.
   $left=$kind==='teleport'?null:self::leavesPlate($from,$to,$path,$config);
   if($left!==null&&$top-WallMovement::terrain($left[0]['column']+($left[0]['width']??1)/2,$left[0]['row']+($left[0]['height']??1)/2,$config)<1-1e-6)$top=self::groundTop($left[0],$left[1],$config);
  }
  // Teleport only checks its landing support; never treat the skipped chord as a fall.
  elseif($kind!=='teleport')$top=self::groundTop($from,[...$path,$to],$config);
  // It lands on the highest thing below where it fell from: a box top, a step, a deck (Brandon, November 8, 2026),
  // never on the ground inside an object it fell into.
  $onto=$top!==null?self::surfaceBelow($to,$top,$config):null;
  $ground=$landing;
  if($onto&&$onto['height']>$landing+1e-6)$landing=(float)$onto['height'];else $onto=null;
  if($top===null||$top-$landing<.999999)return null;
  // Onto a breakable thing hard enough to break it (Brandon, November 10, 2026): through it, on down to what is under it.
  $through=$onto&&!$climbedDown?self::breakThrough($to,$top,$onto,$ground,$config):null;
  if($through){$onto=$through['onto'];$landing=$through['landing'];}
  // The nearest whole square, as a climb up the same face is counted (stepRise in terrain-math.mjs):
  // a 3.75-high face is 4 squares both ways. A drop of less than one square is still no fall.
  return ['squares'=>max(1,(int)floor($top-$landing+.5+1e-6)),'fromHeight'=>$top,'landingHeight'=>$landing,'forcedDown'=>false,...($onto?['landsOn'=>['id'=>$onto['id'],'levelId'=>$onto['levelId']]]:[]),
   ...($through?['breaks'=>$through['breaks'],'breakThrough'=>$through['pieces'],...($onto?[]:['throughToGround'=>true])]:[])];
 }
 /**
  * A fall onto the top of a breakable object, hard enough to break it: the squares fallen onto it at least the
  * object's Stamina (the forced movement a push pays to break it: glass 1, wood 3, stone 6, metal 9), times the rules
  * table's fallBreakSquares. It breaks (every wall of it, as a push breaks it) and the creature falls on to the next
  * surface under it, or the ground; that may break too. Damage for each break is the book's (Stamina + 2), times
  * fallBreakDamage, on top of the fall's own. Null when it does not break: it lands on the top.
  */
 private static function breakThrough(array $to,float $top,array $onto,float $ground,array $config):?array {
  $model=$config['environment']['walls']['value']??[];$per=MovementRules::get('fallBreakSquares');$times=MovementRules::get('fallBreakDamage');
  if($per<=0)return null;
  $segments=array_column($model['segments']??[],null,'id');$boxes=array_column(WallBoxes::boxes($model),null,'id');
  $broken=[];$pieces=[];$skip=[];$landing=null;
  $plates=[];foreach($model['roofs']??[] as $index=>$roof)if(is_string($roof['id']??null)&&FloorSupport::breakablePlate($roof))$plates[$roof['id']]=$index;
  for($i=0;$i<10&&$onto;$i++){
   $box=$boxes[$onto['id']]??null;
   if($box){
    $edges=array_values(array_filter(array_map(fn($id)=>$segments[$id]??null,$box['edges']??[])));
    if(!$edges||array_filter($edges,fn($e)=>!WallObjects::breakable($e)))break;
    $stamina=max(array_map(fn($e)=>WallObjects::stamina($e),$edges));
    if($top-(float)$onto['height']+1e-6<$stamina*$per)break;
    foreach(WallObjects::whole($edges,$config) as $wall)$broken[$wall['id']]=$wall;
    $pieces[]=['id'=>$onto['id'],'material'=>$edges[0]['material']??'stone','stamina'=>$stamina,'damage'=>(int)round(($stamina+2)*$times)];
    $skip[$onto['id']]=true;
   }
   // A breakable floor plate (plan part 4): the squares of it under the faller break, and are holes from then on.
   elseif(isset($plates[$onto['id']])){
    $roof=$model['roofs'][$plates[$onto['id']]];$roof['points']??=FloorSupport::surfaces(['nodes'=>$model['nodes']??[],'roofs'=>[$roof]])[0]['points']??[];
    $cuts=[];foreach($config['mapLevels']['levels']??[] as $level)if(($level['id']??null)===($roof['levelId']??null))$cuts=$level['cutouts']??[];
    $squares=FloorSupport::plateSquaresUnder($to,$roof,$cuts);
    $stamina=WallObjects::STAMINA[$roof['material']];
    if(!$squares||$top-(float)$onto['height']+1e-6<$stamina*$per)break;
    foreach($squares as [$c,$r]){$id=FloorSupport::squareId($roof['id'],$c,$r);$broken[$id]=['id'=>$id,'material'=>$roof['material']];$model['roofs'][$plates[$onto['id']]]['broken'][]=$c.','.$r;}
    $pieces[]=['id'=>$onto['id'],'material'=>$roof['material'],'stamina'=>$stamina,'damage'=>(int)round(($stamina+2)*$times),'squares'=>count($squares)];
   }
   else break;
   $landing=$ground;
   $surfaces=array_values(array_filter(FloorSupport::surfaces($model),fn($s)=>(($s['kind']??'')==='floor'||!empty($s['templateCube']))&&isset($s['id'])&&!isset($skip[$s['id']])));
   $best=$surfaces?FloorSupport::landing($to,$surfaces,$config['mapLevels']??[],(float)$onto['height']-1e-6,-INF):null;
   $landing=max($ground,(float)($best['height']??$ground));
   $onto=($best['id']??null)!==null&&(float)$best['height']>$ground+1e-6?['id'=>$best['id'],'levelId'=>$best['levelId']??'level-0','height'=>(float)$best['height']]:null;
  }
  return $pieces?['breaks'=>array_values($broken),'pieces'=>$pieces,'onto'=>$onto,'landing'=>$landing]:null;
 }
 /** The highest floor (a plate, a box top, a summoned cube) under a creature at or below a height, or null. */
 public static function surfaceBelow(array $at,float $top,array $config):?array {
  $surfaces=array_values(array_filter(FloorSupport::surfaces($config['environment']['walls']['value']??[]),fn($s)=>(($s['kind']??'')==='floor'||!empty($s['templateCube']))&&isset($s['id'])));
  if(!$surfaces)return null;
  $best=FloorSupport::landing($at,$surfaces,$config['mapLevels']??[],$top+1e-6,-INF);
  return ($best['id']??null)!==null?['id'=>$best['id'],'levelId'=>$best['levelId']??'level-0','height'=>(float)$best['height']]:null;
 }
 /** The height a move over ground falls from: the top of the sharpest drop it crosses, or null when it crosses none. */
 private static function groundTop(array $from,array $points,array $config):?float {
  $terrain=fn($x,$y)=>WallMovement::terrain($x,$y,$config);$standing=fn($p)=>WallMovement::height($p,$config);
  $previous=$from;$top=null;$smooth=MapLabels::noClimbSquares($config);
  foreach($points as $point){
   $dx=$point['column']-$previous['column'];$dy=$point['row']-$previous['row'];$d=max(abs($dx),abs($dy));
   $at=fn($s)=>[...$previous,'column'=>$previous['column']+$dx*$s/$d,'row'=>$previous['row']+$dy*$s/$d];
   // Ground the map marks no-climb is walked both ways (MapLabels::walkedBump): a sharp step down out of such a
   // square is passed over, and the rest of the move is looked at for a real drop.
   $contact=null;$skip=0;
   while($d>1e-7&&$skip<$d-1e-7){
    $hit=TerrainContact::first($at($skip),$point,$terrain,$standing,-1);if($hit===null)break;
    $step=$skip+floor($hit+1e-6);
    if(!MapLabels::walkedBump($at($step),$at(min($d,$step+1)),$standing,$smooth)){$contact=$step;break;}
    $skip=$step+1;
   }
   // The top of a fall is the middle of the square the creature left, the same place a climb up
   // the face is measured from, so one face is the same height going up and coming down.
   if($contact!==null)$top=max($top??-INF,$standing($at($contact)));
   // A face gentler than the sharp drop looked for above can still be a climb of two squares or
   // more going up (a 1.9-high bank). Coming down it is then a fall of the same height.
   elseif($d>1e-7){
    for($i=0;$i<ceil($d-1e-6);$i++){
     $upper=$at($i);$lower=$at(min($d,$i+1));$high=$standing($upper);
     if($high-$standing($lower)>=1.5-1e-6&&!MapLabels::walkedBump($upper,$lower,$standing,$smooth)&&TerrainContact::first($lower,$upper,$terrain,$standing)!==null){$top=max($top??-INF,$high);break;}
    }
   }
   $previous=[...$previous,...$point];
  }
  return $top;
 }
 /**
  * Where a creature moving off the plate it stands on leaves it: the first place along the move
  * where none of its square is over that plate (the same eighth-of-a-square steps the footing rule
  * walks, FloorSupport::walkContact). Returns the creature as it is there, on the ground with no
  * plate, and the points of the move still to come; null when it never leaves the plate.
  */
 private static function leavesPlate(array $from,array $to,array $path,array $config):?array {
  $mapLevels=$config['mapLevels']??[];
  $plate=FloorSupport::retained($from,FloorSupport::surfaces($config['environment']['walls']['value']??[]),$mapLevels);
  if(!$plate)return null;
  $cuts=[];foreach($mapLevels['levels']??[] as $level)if(($level['id']??null)===($plate['levelId']??null))$cuts=$level['cutouts']??[];
  $points=[...$path,$to];$previous=$from;
  foreach($points as $index=>$end){
   $dx=$end['column']-$previous['column'];$dy=$end['row']-$previous['row'];
   $steps=max(1,min(8192,(int)ceil(max(abs($dx),abs($dy))*8)));
   for($i=1;$i<=$steps;$i++){
    $p=[...$from,'column'=>$previous['column']+$dx*$i/$steps,'row'=>$previous['row']+$dy*$i/$steps];
    if(!FloorSupport::intersects($p,$plate,$cuts))return [[...$p,'levelId'=>'level-0','_supportSurfaceId'=>null,'_floorTraversal'=>null],array_slice($points,$index)];
   }
   $previous=[...$previous,...$end];
  }
  return null;
 }
 private static function overlaps(array $a,array $b):bool {
  return ($a['levelId']??'level-0')===($b['levelId']??'level-0')&&$a['column']<$b['column']+($b['width']??1)-1e-7&&$a['column']+($a['width']??1)>$b['column']+1e-7&&$a['row']<$b['row']+($b['height']??1)-1e-7&&$a['row']+($a['height']??1)>$b['row']+1e-7;
 }
 /** The landing's outcome with the walls the fall broke through added to the ones it lands in (one list, no repeats). */
 public static function withBreaks(array $fall,array $landing):array {
  if(empty($fall['breaks']))return $landing;
  $all=[];foreach([...($landing['breaks']??[]),...$fall['breaks']] as $wall)$all[$wall['id']]=$wall;
  return [...$landing,'breaks'=>array_values($all)];
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
