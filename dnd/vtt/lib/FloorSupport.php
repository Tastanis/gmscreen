<?php
declare(strict_types=1);
/** Positive-area footprint support on floor polygons minus holes and cutouts. */
final class FloorSupport {
 public const GROUND_CLEARANCE = .125;
 private static function levels(array $mapLevels):array {return ['level-0'=>['id'=>'level-0','cutouts'=>[]],...array_column($mapLevels['levels']??[],null,'id')];}
 public static function contains(array $ring,float $x,float $y):bool {
  $inside=false;$j=count($ring)-1;foreach($ring as $i=>$p){$q=$ring[$j];if(($p['y']>$y)!==($q['y']>$y)&&$x<($q['x']-$p['x'])*($y-$p['y'])/($q['y']-$p['y'])+$p['x'])$inside=!$inside;$j=$i;}return $inside;
 }
 private static function bands(array $ring,float $x):array {
  $ys=[];$j=count($ring)-1;foreach($ring as $i=>$a){$b=$ring[$j];if(($a['x']>$x)!==($b['x']>$x))$ys[]=$a['y']+($x-$a['x'])*($b['y']-$a['y'])/($b['x']-$a['x']);$j=$i;}sort($ys,SORT_NUMERIC);$bands=[];for($i=0;$i+1<count($ys);$i+=2)$bands[]=[$ys[$i],$ys[$i+1]];return $bands;
 }
 public static function intersects(array $p,array $surface,array $cuts=[]):bool {
  $left=(float)$p['column'];$right=$left+($p['width']??1);$top=(float)$p['row'];$bottom=$top+($p['height']??1);
  $holes=$surface['holes']??[];
  foreach($cuts as $c){$x=$c['column'];$y=$c['row'];$w=$c['width'];$h=$c['height'];$holes[]=[['x'=>$x,'y'=>$y],['x'=>$x+$w,'y'=>$y],['x'=>$x+$w,'y'=>$y+$h],['x'=>$x,'y'=>$y+$h]];}
  $outer=$surface['points']??[];if(count($outer)<3)return false;
  $rings=[$outer,...$holes];$xs=[$left,$right];$edges=[];
  foreach($rings as $ring){$j=count($ring)-1;foreach($ring as $i=>$a){$b=$ring[$j];$j=$i;if(max($a['x'],$b['x'])>$left&&min($a['x'],$b['x'])<$right&&max($a['y'],$b['y'])>$top&&min($a['y'],$b['y'])<$bottom)$edges[]=[$a,$b];if($a['x']>$left&&$a['x']<$right)$xs[]=$a['x'];foreach([$top,$bottom] as $y)if(($a['y']>$y)!==($b['y']>$y)){$x=$a['x']+($y-$a['y'])*($b['x']-$a['x'])/($b['y']-$a['y']);if($x>$left&&$x<$right)$xs[]=$x;}}}
  // Boundary intersections partition overlapping holes without double subtraction.
  for($i=0;$i<count($edges);$i++)for($j=$i+1;$j<count($edges);$j++){
   [$a,$b]=$edges[$i];[$c,$d]=$edges[$j];$vx=$b['x']-$a['x'];$vy=$b['y']-$a['y'];$wx=$d['x']-$c['x'];$wy=$d['y']-$c['y'];$den=$vx*$wy-$vy*$wx;if(abs($den)<1e-12)continue;
   $t=(($c['x']-$a['x'])*$wy-($c['y']-$a['y'])*$wx)/$den;$u=(($c['x']-$a['x'])*$vy-($c['y']-$a['y'])*$vx)/$den;
   if($t>=0&&$t<=1&&$u>=0&&$u<=1){$x=$a['x']+$t*$vx;if($x>$left&&$x<$right)$xs[]=$x;}
  }
  sort($xs,SORT_NUMERIC);
  for($i=1;$i<count($xs);$i++){
   if($xs[$i]-$xs[$i-1]<=1e-7)continue;$x=($xs[$i]+$xs[$i-1])/2;$blocked=[];foreach($holes as $hole)foreach(self::bands($hole,$x) as $band)$blocked[]=$band;usort($blocked,fn($a,$b)=>$a[0]<=>$b[0]);
   foreach(self::bands($outer,$x) as [$a,$b]){$cursor=max($top,$a);$end=min($bottom,$b);if($end-$cursor<=1e-7)continue;foreach($blocked as [$c,$d]){if($d<=$cursor)continue;if($c>$cursor+1e-7)return true;$cursor=max($cursor,$d);if($cursor>=$end-1e-7)break;}if($end-$cursor>1e-7)return true;}
  }
  return false;
 }
 /** Resolve both imported polygon plates and node-authored roofs. */
 public static function surfaces(array $model):array {
  $surfaces=$model['roofs']??[];
  if(!array_filter($surfaces,fn($s)=>!isset($s['points'])))return $surfaces;
  $nodes=array_column($model['nodes']??[],null,'id');
  return array_map(static function($surface)use($nodes){
   if(!isset($surface['points']))$surface['points']=array_values(array_filter(array_map(fn($id)=>$nodes[$id]??null,$surface['nodes']??[])));
   return $surface;
  },$surfaces);
 }
 public static function supported(array $p,array $surfaces,array $cuts=[]):?bool {
  $matching=array_values(array_filter($surfaces,fn($s)=>($s['levelId']??'level-0')===($p['levelId']??'level-0')&&empty($s['templateCube'])));
  $floors=array_values(array_filter($matching,fn($s)=>($s['kind']??'')==='floor'));
  // A roof-only level is bounded by its authored roof, not an infinite legacy plane.
  // Where a real floor exists, its support remains independent of the roof above it.
  if(!$floors)$floors=array_values(array_filter($matching,fn($s)=>($s['kind']??'roof')==='roof'));
  if(!$floors)return null;
  foreach($floors as $s)if(($s['levelId']??'level-0')===($p['levelId']??'level-0')&&self::intersects($p,$s,$cuts))return true;
  return false;
 }
 /** Contact tolerance for nearly flush imported paving; never a full-square climb. */
 public static function terrainContact(array $p,array $surfaces,array $mapLevels,float $ground):?array {
  $levels=self::levels($mapLevels);$best=null;
  foreach($surfaces as $surface){
   $level=$levels[$surface['levelId']??'']??null;$height=(float)($surface['height']??0);
   if(($surface['kind']??'')!=='floor'||!$level||($level['hidden']??false)||$height<$ground-1e-6||$height>$ground+self::GROUND_CLEARANCE+1e-6)continue;
   if(self::intersects($p,$surface,$level['cutouts']??[])&&(!$best||$height>$best['height']))$best=$surface;
  }
  return $best;
 }

 public static function retained(array $p,array $surfaces,array $mapLevels):?array {
  if(empty($p['_supportSurfaceId']))return null;
  $levels=self::levels($mapLevels);
  foreach($surfaces as $s)if(($s['id']??null)===$p['_supportSurfaceId']&&self::intersects($p,$s,$levels[$s['levelId']??'']['cutouts']??[]))return $s;
  return null;
 }

 public static function stairLanding(array $p,array $surfaces,array $mapLevels):?array {
  $id=$p['levelId']??'level-0';$levels=self::levels($mapLevels);$height=FloorGeometry::elevations($mapLevels)[$id]??0;$best=null;
  foreach($surfaces as $s){
   if(($s['kind']??'')!=='floor'||($s['levelId']??'level-0')!==$id||($levels[$id]['hidden']??false)||abs($s['height']-$height)>self::GROUND_CLEARANCE+1e-6)continue;
   if(self::intersects($p,$s,$levels[$id]['cutouts']??[])&&(!$best||$s['height']>$best['height']))$best=$s;
  }
  return $best;
 }

 /** Follow nearly flush floor edges, retaining support over excavated terrain.
  * Contact is acquired at an edge, never by comparing a distant endpoint with
  * the starting height. Teleports and stair traversal do not use this path.
  */
 public static function walkContact(array $from,array $to,array $path,array $surfaces,array $mapLevels,callable $terrain):?array {
  if(FloorGeometry::isAirborne($from)||!empty($from['_floorTraversal']))return null;
  $levels=self::levels($mapLevels);
  $floors=array_values(array_filter($surfaces,fn($s)=>(($s['kind']??'')==='floor'||!empty($s['templateCube']))&&isset($levels[$s['levelId']??''])&&!($levels[$s['levelId']]['hidden']??false)));
  if(!$floors)return null;
  $overlap=fn($p,$s)=>self::intersects($p,$s,$levels[$s['levelId']]['cutouts']??[]);
  $support=null;
  foreach($floors as $s)if(($from['_supportSurfaceId']??null)===($s['id']??null)&&$overlap($from,$s)){$support=$s;break;}
  if(!$support)foreach($floors as $s)if(($s['kind']??'')==='floor'&&($from['levelId']??'level-0')!=='level-0'&&$from['levelId']===$s['levelId']&&$overlap($from,$s)){$support=$s;break;}
  $support??=self::terrainContact($from,$floors,$mapLevels,$terrain($from));
  $previous=$from;
  foreach([...$path,$to] as $end){
   $start=$previous;$dx=$end['column']-$start['column'];$dy=$end['row']-$start['row'];
   $steps=max(1,min(8192,(int)ceil(max(abs($dx),abs($dy))*8)));
   for($i=1;$i<=$steps;$i++){
    $p=[...$from,'column'=>$start['column']+$dx*$i/$steps,'row'=>$start['row']+$dy*$i/$steps];
    $height=$support['height']??$terrain($previous);
    if(!$support||!$overlap($p,$support)){
     $priorSupport=$support;$support=null;
     foreach($floors as $s)if((!$overlap($previous,$s)||($priorSupport&&(!empty($priorSupport['templateCube'])||!empty($s['templateCube']))&&self::cubeTouches($priorSupport,$s)))&&$overlap($p,$s)&&abs($s['height']-$height)<=.1+1e-6&&$s['height']>=$terrain($p)-.1-1e-6&&(!$support||$s['height']>$support['height']))$support=$s;
    }
    $previous=$p;
   }
  }
  return $support;
 }

 private static function cubeTouches(array $a,array $b):bool {
  $left=min(array_column($a['points'],'x'));$right=max(array_column($a['points'],'x'));$top=min(array_column($a['points'],'y'));$bottom=max(array_column($a['points'],'y'));
  return min(array_column($b['points'],'x'))<=$right+1e-7&&max(array_column($b['points'],'x'))>=$left-1e-7&&min(array_column($b['points'],'y'))<=$bottom+1e-7&&max(array_column($b['points'],'y'))>=$top-1e-7;
 }

 /** A step off a cube can land on a touching lower cube, never climb from terrain. */
 public static function cubeStepDown(array $from,array $to,array $surfaces,array $mapLevels):?array {
  $old=self::retained($from,$surfaces,$mapLevels);
  if(!$old||empty($old['templateCube'])||self::retained([...$from,...$to],$surfaces,$mapLevels))return null;
  $bounds=static fn($s)=>[min(array_column($s['points'],'x')),max(array_column($s['points'],'x')),min(array_column($s['points'],'y')),max(array_column($s['points'],'y'))];
  [$a,$b,$c,$d]=$bounds($old);$levels=self::levels($mapLevels);$best=null;
  foreach($surfaces as $s){
   if(empty($s['templateCube'])||$s['height']>$old['height']+1e-7||!self::intersects($to,$s,$levels[$s['levelId']]['cutouts']??[]))continue;
   [$e,$f,$g,$h]=$bounds($s);
   if($e>$b+1e-7||$a>$f+1e-7||$g>$d+1e-7||$c>$h+1e-7)continue;
   if(!$best||$s['height']>$best['height'])$best=$s;
  }
  return $best;
 }

 /** Highest supported visible surface below a descending flier. */
 public static function landing(array $p,array $surfaces,array $mapLevels,float $altitude,float $ground):array {
  $levels=self::levels($mapLevels);
  $best=['levelId'=>'level-0','height'=>$ground,'id'=>null];
  foreach($surfaces as $s){
   $id=$s['levelId']??'level-0';$level=$levels[$id]??null;
   if(($id!=='level-0'&&!$level)||($level['hidden']??false)||$s['height']>$altitude+1e-6||$s['height']<$best['height']-1e-6)continue;
   if(self::intersects($p,$s,$level['cutouts']??[]))$best=$s;
  }
  foreach(FloorGeometry::elevations($mapLevels) as $id=>$height){
   if($id==='level-0'||($levels[$id]['hidden']??false)||$height>$altitude+1e-6||$height<=$best['height'])continue;
   if(self::supported([...$p,'levelId'=>$id],$surfaces)===null&&!FloorGeometry::fullyUnsupported($p,$levels[$id]))$best=['levelId'=>$id,'height'=>$height,'id'=>null];
  }
  return $best;
 }

}
