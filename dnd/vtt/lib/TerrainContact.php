<?php
declare(strict_types=1);
final class TerrainContact {
 public const GRADE=2.;public const FACE_RISE=1.;public const FACE_RUN=.25;
 public static function first(array $from,array $to,callable $ground,?callable $support=null,int $sign=1):?float {
  $dx=$to['column']-$from['column'];$dy=$to['row']-$from['row'];$d=max(abs($dx),abs($dy));if($d<1e-7)return null;
  $ux=$dx/$d;$uy=$dy/$d;$air=in_array($from['movementMode']??'ground',['fly','hover'],true);$alt=$from['flightHeight']??0;
  $sample=function($s)use($from,$ux,$uy,$ground,$support,$air,$alt,$sign){$p=[...$from,'column'=>$from['column']+$ux*$s,'row'=>$from['row']+$uy*$s];$z=$ground($p['column']+($p['width']??1)/2,$p['row']+($p['height']??1)/2);return ['z'=>$sign*($air?max($alt,$z):$z),'on'=>$air||!$support||abs($support($p)-$z)<=.03];};
  for($k=0;$k<=ceil($d*8);$k++){
   $start=$k/8;$a=$sample($start);if(!$a['on'])continue;
   // One-square uphill faces use the existing 2:1 grade; downhill falls retain their policy.
   $windows=[[1,self::GRADE],[self::FACE_RUN,self::FACE_RISE]];
   if($sign>0)$windows[]=[self::FACE_RISE/self::GRADE,self::FACE_RISE];
   foreach($windows as [$run,$rise]){
    $b=$sample($start+$run);if(!$b['on']||$b['z']-$a['z']<$rise-1e-6)continue;
    $previous=$a;
    for($j=1;$j<=ceil($run*8);$j++){
     $end=$start+min($run,$j/8);$next=$sample($end);
     if($next['z']>$previous['z']+1e-7){$lo=$end-1/8;$hi=$end;for($n=0;$n<24;$n++){$mid=($lo+$hi)/2;if($sample($mid)['z']>$previous['z']+1e-7)$hi=$mid;else $lo=$mid;}if($lo<$d-1e-6)return max(0,$lo);break;}
     $previous=$next;
    }
   }
  }
  return null;
 }
}
