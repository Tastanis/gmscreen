<?php
require_once __DIR__.'/../../../lib/ForcedMovement.php';
require_once __DIR__.'/../../../lib/WallMovement.php';
$field=json_decode(file_get_contents(__DIR__.'/fixtures/short-cliff-terrain.json'),true);
$config=['environment'=>['terrain'=>['value'=>$field]]];
$results=[];
foreach([[12,35,10,35],[12,36,10,36],[15,35,13,35],[10,35,12,35],[12,35,12,36]] as [$x,$y,$xx,$yy]){
 $from=['id'=>'qa','column'=>$x,'row'=>$y,'width'=>1,'height'=>1,'levelId'=>'level-0','movementMode'=>'ground'];
 $to=[...$from,'column'=>$xx,'row'=>$yy];
 $results[]=['contact'=>TerrainContact::first($from,$to,fn($x,$y)=>WallMovement::terrain($x,$y,$config),fn($p)=>WallMovement::height($p,$config)),
  'forced'=>ForcedMovement::resolve($from,$to,[],$config)];
}
echo json_encode($results);
