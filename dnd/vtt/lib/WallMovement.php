<?php
declare(strict_types=1);
require_once __DIR__.'/FlightHeight.php';
require_once __DIR__.'/TerrainContact.php';

/** Canonical counterpart of wall-properties.mjs. No mutation or damage side effects. */
final class WallMovement
{
    public static function assertAllowed(array $from, array $to, array $config, string $kind, array $path, bool $isGm): void
    {
        // Preserve the GM's ordinary placement override; forced movement still collides.
        if ($kind==='teleport' || ($isGm && in_array($kind,['walk','shift'],true))) return;
        if($kind==='forced'){
            $previous=$from;
            foreach([...$path,$to] as $point){
                if(TerrainContact::first($previous,$point,fn($x,$y)=>self::terrain($x,$y,$config),fn($p)=>self::height($p,$config))!==null)throw new InvalidArgumentException('Forced movement blocked by a steep uphill slope.');
                $previous=[...$previous,...$point];
            }
        }
        $model=$config['environment']['walls']['value']??[];
        if (empty($model['segments'])) return;
        $previous=$from;
        foreach ([...$path,$to] as $point) {
            $next=[...$previous,'column'=>$point['column'],'row'=>$point['row']];
            if (self::blocked($model,$previous,$next,$config)) throw new InvalidArgumentException('Movement blocked by a wall or closed door/window.');
            $previous=self::movementPlacement($previous,$next,$config);
        }
    }

    public static function terrain(float $x,float $y,array $config): float
    {
        return FlightHeight::ground(['column'=>$x,'row'=>$y,'width'=>0,'height'=>0,'levelId'=>'level-0'],$config);
    }

    private static function inside(float $x,float $y,array $ring): bool
    {
        $inside=false;$j=count($ring)-1;
        foreach($ring as $i=>$p){$q=$ring[$j];
            if(($p['y']>$y)!==($q['y']>$y) && $x<($q['x']-$p['x'])*($y-$p['y'])/($q['y']-$p['y'])+$p['x'])$inside=!$inside;
            $j=$i;
        }
        return $inside;
    }

    public static function height(array $token,array $config): float
    {
        $level=$token['levelId']??'level-0';
        $base=(float)(FloorGeometry::elevations($config['mapLevels']??[])[$level]??0);
        if(FloorGeometry::isAirborne($token))return max($base,(float)($token['flightHeight']??(FlightHeight::ground($token,$config)+1)));
        $surface=FloorSupport::retained($token,FloorSupport::surfaces($config['environment']['walls']['value']??[]),$config['mapLevels']??[]);
        // A creature carried by a stair stands at the stair's height, even while the floor it came
        // from still lies under it (the lower floor of a building runs on under its stairs).
        // Otherwise the plate it is known to stand on decides.
        if($surface&&!FloorGeometry::carriedByStair($token,$config['mapLevels']??[]))return (float)$surface['height'];
        $x=$token['column']+($token['width']??1)/2;$y=$token['row']+($token['height']??1)/2;
        $model=$config['environment']['walls']['value']??[];
        foreach($model['ramps']??[] as $s){
            if($x<$s['left']-1e-7||$x>$s['right']+1e-7||$y<$s['top']-1e-7||$y>$s['bottom']+1e-7)continue;
            $direction=$s['direction']??'north';
            $distance=match($direction){'west'=>$s['right']-$x,'east'=>$x-$s['left'],'south'=>$y-$s['top'],default=>$s['bottom']-$y};
            $entry=$token['_floorTraversal']['entry']??null;
            $supported=$level===($s['toLevel']??null)||($level===($s['fromLevel']??null)&&$entry!=='barrier'&&($entry==='red'||(!isset($token['_floorTraversal'])&&$distance<=2+1e-7)));
            if($supported){$length=in_array($direction,['west','east'],true)?$s['right']-$s['left']:$s['bottom']-$s['top'];return $s['base']+($s['height']-$s['base'])*$distance/$length;}
            break; // Client rampAt uses the first intersecting ramp too.
        }
        // Carried by a stair that has no ramp here to give a height: the plate under it decides after all.
        if($surface)return (float)$surface['height'];
        // Only maps with canonical floor plates use imported-map terrain fallback.
        if($level!=='level-0'){
            $cuts=[];foreach($config['mapLevels']['levels']??[] as $floor)if($floor['id']===$level){$cuts=$floor['cutouts']??[];break;}
            if(FloorSupport::supported($token,FloorSupport::surfaces($model),$cuts)===false)return self::terrain($x,$y,$config);
        }
        if($level==='level-0'){
            $ground=self::terrain($x,$y,$config);
            $contact=empty($token['_floorTraversal'])?FloorSupport::terrainContact($token,FloorSupport::surfaces($model),$config['mapLevels']??[],$ground):null;
            return $contact?(float)$contact['height']:$ground;
        }
        return $base;
    }

    public static function movementHeight(array $from,array $to,array $config): float
    {
        return self::height(self::movementPlacement($from,$to,$config),$config);
    }

    private static function movementPlacement(array $from,array $to,array $config): array
    {
        $surface=FloorSupport::walkContact($from,$to,[],FloorSupport::surfaces($config['environment']['walls']['value']??[]),$config['mapLevels']??[],fn($p)=>self::terrain($p['column']+($p['width']??1)/2,$p['row']+($p['height']??1)/2,$config));
         $surface??=FloorSupport::cubeStepDown($from,$to,FloorSupport::surfaces($config['environment']['walls']['value']??[]),$config['mapLevels']??[]);
        return $surface?[...$to,'levelId'=>$surface['levelId'],'_supportSurfaceId'=>$surface['id']??null]:$to;
    }

    public static function blocked(array $model,array $from,array $to,array $config): bool
    {
        $w=max(1,(float)($from['width']??1));$h=max(1,(float)($from['height']??1));
        $ox=$from['column']+$w/2;$oy=$from['row']+$h/2;$dx=$to['column']-$from['column'];$dy=$to['row']-$from['row'];
        if(!$dx&&!$dy)return false;
        $nodes=array_column($model['nodes'],null,'id');
        foreach($model['segments'] as $edge){
            $e=[...['movement'=>'block','movementDirection'=>'both','interaction'=>'none','open'=>false,'baseMode'=>'terrain','base'=>0,'height'=>2,'topMode'=>'follow'],...$edge];
            // A broken wall is still stored, so it can be repaired, but it stops nothing.
            if($e['movement']==='pass'||($e['open']&&$e['interaction']!=='none')||($edge['broken']??false)===true)continue;
            $a=$nodes[$e['a']];$b=$nodes[$e['b']];$vx=$b['x']-$a['x'];$vy=$b['y']-$a['y'];
            if($vx*$vx+$vy*$vy<1e-16)continue;
            $side=$vx*($oy-$a['y'])-$vy*($ox-$a['x']);
            if($e['movementDirection']!=='both'&&abs($side)>=1e-8&&($e['movementDirection']==='left'?$side<=0:$side>=0))continue;
            $lo=0.;$hi=1.;
            foreach([[1,0],[0,1],[-$vy,$vx]] as [$ax,$ay]){
                $length=hypot($ax,$ay);if(!$length)continue;$nx=$ax/$length;$ny=$ay/$length;
                $r=abs($nx)*$w/2+abs($ny)*$h/2;$c=$ox*$nx+$oy*$ny;$d=$dx*$nx+$dy*$ny;
                $min=min($a['x']*$nx+$a['y']*$ny,$b['x']*$nx+$b['y']*$ny)-$r+1e-7;
                $max=max($a['x']*$nx+$a['y']*$ny,$b['x']*$nx+$b['y']*$ny)+$r-1e-7;
                if(abs($d)<1e-9){if($c<=$min||$c>=$max){$hi=-1;break;}}
                else{$q=($min-$c)/$d;$s=($max-$c)/$d;$lo=max($lo,min($q,$s));$hi=min($hi,max($q,$s));}
            }
            if($lo>=$hi||$hi<0||$lo>1)continue;
            $steps=max(1,min(8192,(int)ceil(hypot($dx,$dy)*($hi-$lo)*8)));
            for($i=0;$i<=$steps;$i++){
                $t=$lo+($hi-$lo)*($i+.5)/($steps+1);
                $token=[...$from,'column'=>$from['column']+$dx*$t,'row'=>$from['row']+$dy*$t];
                $px=$token['column']+$w/2;$py=$token['row']+$h/2;
                $u=max(0,min(1,(($px-$a['x'])*$vx+($py-$a['y'])*$vy)/($vx*$vx+$vy*$vy)));
                $base=$e['baseMode']==='fixed'?$e['base']:self::terrain($a['x']+$vx*$u,$a['y']+$vy*$u,$config)+$e['base'];
                $top=$e['baseMode']==='fixed'||$e['topMode']==='follow'?$base+$e['height']:max(self::terrain($a['x'],$a['y'],$config),self::terrain($b['x'],$b['y'],$config))+$e['base']+$e['height'];
                $z=self::movementHeight($from,$token,$config);
                if($z<$top-1e-7&&$z+max($w,$h)>$base+1e-7)return true;
            }
        }
        return false;
    }
}
