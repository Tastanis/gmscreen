<?php
declare(strict_types=1);
require_once __DIR__.'/WallMovement.php';
require_once __DIR__.'/WallObjects.php';
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
   if(array_key_exists('broken',$s)&&!is_bool($s['broken']))throw new InvalidArgumentException('Invalid wall cube flag.');
   if(array_key_exists('rubble',$s)&&!isset(WallObjects::STAMINA[$s['rubble']]))throw new InvalidArgumentException('Invalid wall cube rubble.');
  }
  // What it takes to break a cube: one of the book's materials, or a Stamina for each square.
  if(array_key_exists('wallType',$template)&&!isset(WallObjects::STAMINA[$template['wallType']]))throw new InvalidArgumentException('Invalid wall type.');
  if(array_key_exists('wallStamina',$template)&&(!is_int($template['wallStamina'])||$template['wallStamina']<1||$template['wallStamina']>self::MAX_STAMINA))throw new InvalidArgumentException('Wall Stamina must be a whole number from 1 to '.self::MAX_STAMINA.'.');
 }
 public const MAX_STAMINA=999;
 /** What a wall is made of, from the colour it is drawn in (wallMaterial in wall-cubes.js). */
 public static function kind(array $template):string {
  $value=$template['wallColor']??'';
  return ['gray'=>'stone','brown'=>'dirt','green'=>'dirt','purple'=>'metal','blue'=>'ice','cyan'=>'ice','red'=>'fire'][$value]??(in_array($value,['stone','dirt','metal','ice','fire'],true)?$value:'stone');
 }
 /**
  * The Stamina of each cube, or null when the wall cannot be broken: it was given neither a
  * type nor a number, or it is fire, which a creature goes through and never breaks.
  */
 public static function stamina(array $template):?int {
  if(self::kind($template)==='fire')return null;
  if(is_int($template['wallStamina']??null)&&$template['wallStamina']>0)return $template['wallStamina'];
  return WallObjects::STAMINA[$template['wallType']??'']??null;
 }
 /** The heap of rubble a broken cube leaves: its type, or else what its colour says it is. */
 public static function rubble(array $template):string {
  return isset(WallObjects::STAMINA[$template['wallType']??''])?$template['wallType']:['stone'=>'stone','dirt'=>'wood','metal'=>'metal','ice'=>'glass','fire'=>'stone'][self::kind($template)];
 }
 /**
  * A template as it is stored. The type and Stamina are the GM's to know: a player who edits
  * their own wall does not have them, so they are kept from the stored copy. A broken cube is
  * given its rubble here, so every screen draws the same heap.
  */
 public static function settle(array $template,?array $current,bool $isGm):array {
  if(($template['type']??'')!=='wall')return $template;
  if(!$isGm&&$current!==null)foreach(['wallType','wallStamina'] as $key){unset($template[$key]);if(array_key_exists($key,$current))$template[$key]=$current[$key];}
  foreach($template['squares'] as $i=>$s){
   if(($s['broken']??false)!==true){unset($template['squares'][$i]['broken'],$template['squares'][$i]['rubble']);continue;}
   if(!isset($s['rubble']))$template['squares'][$i]['rubble']=self::rubble($template);
  }
  return $template;
 }
 /** What a player is sent: everything but what it takes to break the wall. */
 public static function forPlayer(array $template):array {
  unset($template['wallType'],$template['wallStamina']);return $template;
 }
 /** The cube a derived wall belongs to: [template id, 'column,row,elevation'], or null. */
 public static function cubeOf(string $segmentId):?array {
  return preg_match('/^template-cube:(.+):(-?\d+,-?\d+,\d+):edge:\d$/',$segmentId,$m)?[$m[1],$m[2]]:null;
 }
 /** Marks cubes broken. `$keys` are 'column,row,elevation'. Returns the template, or null when nothing changed. */
 public static function breakCubes(array $template,array $keys):?array {
  $changed=false;
  foreach($template['squares']??[] as $i=>$s){
   if(($s['broken']??false)===true||!in_array($s['column'].','.$s['row'].','.($s['elevation']??0),$keys,true))continue;
   $template['squares'][$i]['broken']=true;$template['squares'][$i]['rubble']=self::rubble($template);$changed=true;
  }
  return $changed?$template:null;
 }
 public static function withTemplates(array $config,array $templates):array {
  $model=$config['environment']['walls']['value']??[];
  // Cube tops never become the base for another template; stacking is explicit.
  $floors=FloorSupport::surfaces($model);usort($floors,fn($a,$b)=>($b['height']??0)<=>($a['height']??0));
  $derived=[...$model,'nodes'=>$model['nodes']??[],'segments'=>$model['segments']??[],'roofs'=>$model['roofs']??[]];
  foreach($templates as $template){if(($template['type']??'')!=='wall')continue;
   // A breakable cube is one object: its four walls share a group and carry its Stamina.
   $stamina=self::stamina($template);$breaks=$stamina===null?[]:['stamina'=>$stamina,'material'=>self::rubble($template),'breakLabel'=>isset($template['wallType'])&&!isset($template['wallStamina'])?$template['wallType']:'Stamina '.$stamina];
   foreach($template['squares']??[] as $s){
    // A broken cube is kept, to draw its rubble, but it stops nothing and holds nothing up.
    if(($s['broken']??false)===true)continue;
    $level=$template['levelId']??'level-0';$token=[...$s,'width'=>1,'height'=>1,'levelId'=>$level];
    $base=WallMovement::height($token,$config)+(float)($s['elevation']??0);
    // Authored floor plates are the support even when the terrain below is excavated.
    $cuts=[];foreach($config['mapLevels']['levels']??[] as $l)if($l['id']===$level)$cuts=$l['cutouts']??[];
    foreach($floors as $f)if(($f['kind']??'')==='floor'&&($f['levelId']??'level-0')===$level&&FloorSupport::intersects($token,$f,$cuts)){$base=(float)$f['height']+(float)($s['elevation']??0);break;}
    $id='template-cube:'.$template['id'].':'.$s['column'].','.$s['row'].','.($s['elevation']??0);
    $points=[];foreach([[0,0],[1,0],[1,1],[0,1]] as $i=>[$x,$y]){$p=['id'=>$id.':'.$i,'x'=>$s['column']+$x,'y'=>$s['row']+$y];$points[]=$p;$derived['nodes'][]=$p;}
    for($i=0;$i<4;$i++)$derived['segments'][]=['id'=>$id.':edge:'.$i,'a'=>$points[$i]['id'],'b'=>$points[($i+1)%4]['id'],'baseMode'=>'fixed','base'=>$base,'height'=>1,'topMode'=>'follow','sight'=>'block','movement'=>'block','interaction'=>'none','sightDirection'=>'both','movementDirection'=>'both',...($breaks?[...$breaks,'group'=>$id]:[])];
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
