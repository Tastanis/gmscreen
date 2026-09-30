<?php
require_once __DIR__.'/../../../lib/FloorSupport.php';
function compiledSupportCheck(bool $ok,string $message):void {if(!$ok)throw new RuntimeException($message);}
$ring=static fn($x,$y,$w,$h)=>[['x'=>$x,'y'=>$y],['x'=>$x+$w,'y'=>$y],['x'=>$x+$w,'y'=>$y+$h],['x'=>$x,'y'=>$y+$h]];
$surface=['points'=>$ring(0,0,40,40),'holes'=>[$ring(10,10,4,4),$ring(12,10,4,4)]];
$cuts=[];for($x=0;$x<38;$x++)for($y=0;$y<38;$y++)if($x<8||$x>20||$y<8||$y>20)$cuts[]=['column'=>$x,'row'=>$y,'width'=>1,'height'=>1];
compiledSupportCheck(count($cuts)>1000,'Fixture exercises large imported cutout list');
compiledSupportCheck(FloorSupport::intersects(['column'=>8.5,'row'=>8.5,'width'=>1,'height'=>1],$surface,$cuts),'Clear interior supported despite many unrelated cuts');
compiledSupportCheck(!FloorSupport::intersects(['column'=>2,'row'=>2,'width'=>1,'height'=>1],$surface,$cuts),'Indexed cutout removes fully covered footprint');
compiledSupportCheck(FloorSupport::intersects(['column'=>7.5,'row'=>8.5,'width'=>1,'height'=>1],$surface,$cuts),'Fractional footprint retains positive uncut support');
compiledSupportCheck(!FloorSupport::intersects(['column'=>12.5,'row'=>10.5,'width'=>1,'height'=>1],$surface,$cuts),'Overlapping native holes subtract their union once');
compiledSupportCheck(FloorSupport::intersects(['column'=>15.5,'row'=>10.5,'width'=>1,'height'=>1],$surface,$cuts),'Partially overlapping hole preserves remaining support');
$editable=[['column'=>8,'row'=>8,'width'=>1,'height'=>1]];
compiledSupportCheck(!FloorSupport::intersects(['column'=>8,'row'=>8],$surface,$editable),'Initial compiled cut removes support');
$editable[0]['column']=9;
compiledSupportCheck(FloorSupport::intersects(['column'=>8,'row'=>8],$surface,$editable),'Editing cutout invalidates compiled content');
$fraction=[['column'=>3.9,'row'=>3.9,'width'=>.2,'height'=>.2]];
compiledSupportCheck(!FloorSupport::intersects(['column'=>4,'row'=>4,'width'=>.05,'height'=>.05],$surface,$fraction),'Fractional cut indexed across grid boundary');
$wide=[['column'=>0,'row'=>0,'width'=>10000,'height'=>10000]];
compiledSupportCheck(!FloorSupport::intersects(['column'=>8,'row'=>8],$surface,$wide),'Very large cuts use bounded global fallback');
compiledSupportCheck(!FloorSupport::intersects(['column'=>40,'row'=>4],$surface),'Touching plate edge supplies no positive area');
compiledSupportCheck(FloorSupport::intersects(['column'=>39.99,'row'=>4],$surface),'Thin positive overlap stays supported');
for($i=0;$i<80;$i++){
 $s=['points'=>$ring($i,0,2,2),'holes'=>[]];
 compiledSupportCheck(FloorSupport::intersects(['column'=>$i+.5,'row'=>.5],$s),'Bounded cache preserves new geometry');
}
compiledSupportCheck(!FloorSupport::intersects(['column'=>12.5,'row'=>10.5],$surface,$cuts),'Cache eviction preserves existing geometry on recompile');
$largeRing=[];for($i=0;$i<300;$i++){$theta=$i*2*M_PI/300;$largeRing[]=['x'=>20+10*cos($theta),'y'=>20+10*sin($theta)];}
compiledSupportCheck(FloorSupport::intersects(['column'=>19,'row'=>19],['points'=>$largeRing]),'Large native rings use exact local fallback');
$manyWide=[];for($i=0;$i<100;$i++)$manyWide[]=['column'=>0,'row'=>100+$i,'width'=>128,'height'=>1];
compiledSupportCheck(!FloorSupport::intersects(['column'=>10,'row'=>199],['points'=>$ring(0,0,128,250)],$manyWide),'Total index budget fallback retains every cutout');
$crossed=[];for($i=0;$i<125;$i++){$theta=($i*62%125)*2*M_PI/125;$crossed[]=['x'=>20+10*cos($theta),'y'=>20+10*sin($theta)];}
compiledSupportCheck(FloorSupport::intersects(['column'=>19,'row'=>19],['points'=>$crossed]),'Crossing budget fallback retains exact self-crossing ring support');
$tiny=['points'=>$ring(0,0,2e-7,1)];$tinyToken=['column'=>0,'row'=>0,'width'=>2e-7,'height'=>1];
compiledSupportCheck(FloorSupport::intersects($tinyToken,$tiny),'Tiny unsplit plate retains positive area above epsilon');
$farSplit=[['column'=>7e-8,'row'=>100,'width'=>7e-8,'height'=>1]];
compiledSupportCheck(!FloorSupport::intersects($tinyToken,$tiny,$farSplit),'Distant cut vertices preserve original sub-epsilon x partitions');
$farSplit[0]['column']=3e-7;
compiledSupportCheck(FloorSupport::intersects($tinyToken,$tiny,$farSplit),'Edited distant x boundaries invalidate cached partitions');
echo "Compiled support: large/fractional/overlapping cutouts, edits, bounded fallbacks and edge contact passed.\n";
