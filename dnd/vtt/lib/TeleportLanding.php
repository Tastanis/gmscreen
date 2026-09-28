<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
final class TeleportLanding {
 public static function surfaces(array $to,array $config,bool $gm):array {
  $heights=FloorGeometry::elevations($config['mapLevels']??[]);$surfaces=FloorSupport::surfaces($config['environment']['walls']['value']??[]);
  $result=[['height'=>WallMovement::terrain($to['column']+($to['width']??1)/2,$to['row']+($to['height']??1)/2,$config),'levelId'=>'level-0','surfaceId'=>null]];
  $hidden=[];
  foreach($config['mapLevels']['levels']??[] as $level){
   if(!$gm&&($level['hidden']??false)){$hidden[]=$level['id'];continue;}
   $p=[...$to,'levelId'=>$level['id']];$support=FloorSupport::supported($p,$surfaces,$level['cutouts']??[]);
   if($support??!FloorGeometry::fullyUnsupported($p,$level))$result[]=['height'=>$heights[$level['id']],'levelId'=>$level['id'],'surfaceId'=>null];
  }
  foreach($surfaces as $s){if(in_array($s['levelId']??'level-0',$hidden,true)||!isset($s['id'])||!FloorSupport::intersects($to,$s))continue;
   $result[]=['height'=>(float)$s['height'],'levelId'=>$s['levelId']??'level-0','surfaceId'=>$s['id']];
  }
  usort($result,fn($a,$b)=>$b['height']<=>$a['height']);return $result;
 }
 public static function resolve(array $from,array $to,array $config,array $choice,bool $gm):array {
  $height=$choice['height']??null;$range=$choice['range']??null;
  if((!is_int($height)&&!is_float($height))||!is_finite((float)$height)||$height< -1000000||$height>1000000)throw new InvalidArgumentException('Invalid teleport height.');
  $distance=max(abs($to['column']-$from['column']),abs($to['row']-$from['row']),abs($height-WallMovement::height($from,$config)));
  if(array_key_exists('allowOutOfRange',$choice)&&!is_bool($choice['allowOutOfRange']))throw new InvalidArgumentException('Invalid teleport range override.');
  if($range!==null&&((!is_int($range)&&!is_float($range))||!is_finite((float)$range)||$range<0))throw new InvalidArgumentException('Invalid teleport range.');
  if($range!==null&&$distance>$range+1e-6&&($choice['allowOutOfRange']??false)!==true)throw new InvalidArgumentException('Chosen teleport height exceeds the available distance.');
  $surfaces=self::surfaces($to,$config,$gm);$landing=null;
  foreach($surfaces as $surface)if($surface['height']<=$height+1e-6){$landing=$surface;break;}
  if(!$landing)throw new InvalidArgumentException('Teleport height is below the ground.');
  $to['levelId']=$landing['levelId'];$to['_floorTraversal']=null;$to['_supportSurfaceId']=$landing['surfaceId'];
  $fall=null;
  if(FloorGeometry::isAirborne($to)){$to['flightHeight']=$height;$to['_supportSurfaceId']=null;}
  elseif($height-$landing['height']>=.999999)$fall=['squares'=>(int)floor($height-$landing['height']+1e-6),'fromHeight'=>$height,'landingHeight'=>$landing['height'],'forcedDown'=>false];
  return ['placement'=>$to,'fall'=>$fall,'distance'=>$distance];
 }
 public static function retained(array $to,array $config):?array {
  return FloorSupport::retained($to,FloorSupport::surfaces($config['environment']['walls']['value']??[]),$config['mapLevels']??[]);
 }
}
