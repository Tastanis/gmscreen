<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
/** Pure template-to-obstacle derivation; never persists a second wall document. */
final class WallCubes {
 public static function validate(array $template):void {
  if(($template['type']??'')!=='wall')return;
  $squares=$template['squares']??null;
  if(!is_array($squares)||!array_is_list($squares)||count($squares)>1000)throw new InvalidArgumentException('A wall needs at most 1000 cubes.');
  $seen=[];
  foreach($squares as $s){
   if(!is_array($s))throw new InvalidArgumentException('Invalid wall cube.');
   foreach(['column','row','elevation'] as $key){$v=$s[$key]??($key==='elevation'?0:null);if(!is_numeric($v)||!is_finite((float)$v)||(float)$v!==floor((float)$v)||$v<0||$v>($key==='elevation'?1000:1000000))throw new InvalidArgumentException('Invalid wall cube '.$key);}
   $key=(int)$s['column'].','.(int)$s['row'].','.(int)($s['elevation']??0);if(isset($seen[$key]))throw new InvalidArgumentException('Duplicate wall cube.');$seen[$key]=true;
  }
 }
 public static function withTemplates(array $config,array $templates):array {
  $model=$config['environment']['walls']['value']??[];
  // Cube tops never become the base for another template; stacking is explicit.
  $floors=FloorSupport::surfaces($model);usort($floors,fn($a,$b)=>($b['height']??0)<=>($a['height']??0));
  $derived=[...$model,'nodes'=>$model['nodes']??[],'segments'=>$model['segments']??[],'roofs'=>$model['roofs']??[]];
  foreach($templates as $template){if(($template['type']??'')!=='wall')continue;
   foreach($template['squares']??[] as $s){
    $level=$template['levelId']??'level-0';$token=[...$s,'width'=>1,'height'=>1,'levelId'=>$level];
    $base=WallMovement::height($token,$config)+(float)($s['elevation']??0);
    // Authored floor plates are the support even when the terrain below is excavated.
    $cuts=[];foreach($config['mapLevels']['levels']??[] as $l)if($l['id']===$level)$cuts=$l['cutouts']??[];
    foreach($floors as $f)if(($f['kind']??'')==='floor'&&($f['levelId']??'level-0')===$level&&FloorSupport::intersects($token,$f,$cuts)){$base=(float)$f['height']+(float)($s['elevation']??0);break;}
    $id='template-cube:'.$template['id'].':'.$s['column'].','.$s['row'].','.($s['elevation']??0);
    $points=[];foreach([[0,0],[1,0],[1,1],[0,1]] as $i=>[$x,$y]){$p=['id'=>$id.':'.$i,'x'=>$s['column']+$x,'y'=>$s['row']+$y];$points[]=$p;$derived['nodes'][]=$p;}
    for($i=0;$i<4;$i++)$derived['segments'][]=['id'=>$id.':edge:'.$i,'a'=>$points[$i]['id'],'b'=>$points[($i+1)%4]['id'],'baseMode'=>'fixed','base'=>$base,'height'=>1,'topMode'=>'follow','sight'=>'block','movement'=>'block','interaction'=>'none','sightDirection'=>'both','movementDirection'=>'both'];
    $derived['roofs'][]=['id'=>$id,'kind'=>'roof','templateCube'=>true,'base'=>$base,'levelId'=>$level,'points'=>array_map(fn($p)=>['x'=>$p['x'],'y'=>$p['y']],$points),'holes'=>[],'height'=>$base+1];
   }
  }
  $config['environment']['walls']['value']=$derived;return $config;
 }
 /** Teleports and altitude edits must end outside solid cube volume. */
 public static function assertDestination(array $token,array $config):void {
  $z=WallMovement::height($token,$config);$top=$z+max($token['width']??1,$token['height']??1);
  foreach($config['environment']['walls']['value']['roofs']??[] as $cube){
   if(empty($cube['templateCube']))continue;
   if($z<$cube['height']-1e-7&&$top>($cube['base']??$cube['height']-1)+1e-7&&FloorSupport::intersects($token,$cube))throw new InvalidArgumentException('Destination is inside a solid wall cube.');
  }
 }

}
