<?php
declare(strict_types=1);
/** Positive-area footprint support on floor polygons minus holes and cutouts. */
final class FloorSupport {
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
 public static function supported(array $p,array $surfaces,array $cuts=[]):?bool {
  $floors=array_values(array_filter($surfaces,fn($s)=>($s['kind']??'')==='floor'&&($s['levelId']??'level-0')===($p['levelId']??'level-0')));
  if(!$floors)return null;
  foreach($floors as $s)if(($s['levelId']??'level-0')===($p['levelId']??'level-0')&&self::intersects($p,$s,$cuts))return true;
  return false;
 }
 /** Contact tolerance for nearly flush imported paving; never a full-square climb. */
 public static function terrainContact(array $p,array $surfaces,array $mapLevels,float $ground):?array {
  $levels=array_column($mapLevels['levels']??[],null,'id');$best=null;
  foreach($surfaces as $surface){
   $level=$levels[$surface['levelId']??'']??null;$height=(float)($surface['height']??0);
   if(($surface['kind']??'')!=='floor'||!$level||($level['hidden']??false)||$height<$ground-1e-6||$height>$ground+.1+1e-6)continue;
   if(self::intersects($p,$surface,$level['cutouts']??[])&&(!$best||$height>$best['height']))$best=$surface;
  }
  return $best;
 }

}
