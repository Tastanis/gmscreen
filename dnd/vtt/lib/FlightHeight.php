<?php
declare(strict_types=1);
require_once __DIR__.'/FloorGeometry.php';

/** Retained absolute flight elevation, shared by command acknowledgments and recovery. */
final class FlightHeight
{
    public static function validate($height): void
    {
        if ($height!==null && ((!is_int($height)&&!is_float($height)) || !is_finite((float)$height) || $height<0 || $height>1000000)) throw new InvalidArgumentException('Flight height must be between 0 and 1000000.');
    }

    public static function ground(array $token,array $config): float
    {
        $level=$token['levelId']??'level-0';
        $base=(float)(FloorGeometry::elevations($config['mapLevels']??[])[$level]??0);
        $field=$config['environment']['terrain']['value']??null;
        if($level!=='level-0'||!is_array($field)||!isset($field['bounds']))return $base;
        $b=$field['bounds'];$n=$field['n'];$m=$field['m'];$h=$field['h'];
        $x=max(0,min(1,($token['column']+($token['width']??1)/2-$b['left'])/$b['width']))*($n-1);
        $y=max(0,min(1,($token['row']+($token['height']??1)/2-$b['top'])/$b['height']))*($m-1);
        $a=(int)floor($x);$c=min($a+1,$n-1);$d=(int)floor($y);$e=min($d+1,$m-1);$fx=$x-$a;$fy=$y-$d;
        return $fx+$fy<=1 ? $h[$d*$n+$a]*(1-$fx-$fy)+$h[$d*$n+$c]*$fx+$h[$e*$n+$a]*$fy
            : $h[$d*$n+$c]*(1-$fy)+$h[$e*$n+$c]*($fx+$fy-1)+$h[$e*$n+$a]*(1-$fx);
    }

    public static function resolve(array $from,array $to,array $config,string $kind='walk',array $path=[]): ?float
    {
        if(!FloorGeometry::isAirborne($to))return null;
        $z=max(0,(float)($to['flightHeight']??$from['flightHeight']??(self::ground($from,$config)+1)));
        if($kind==='undo')return $z; // Restore the receipt; do not traverse intervening terrain again.
        if($kind==='teleport')return max($z,self::ground($to,$config));
        $previous=$from;
        foreach([...$path,$to] as $point){
            $dx=$point['column']-$previous['column'];$dy=$point['row']-$previous['row'];
            $steps=max(1,min(8192,(int)ceil(max(abs($dx),abs($dy))*8)));
            for($i=1;$i<=$steps;$i++)$z=max($z,self::ground([...$previous,'column'=>$previous['column']+$dx*$i/$steps,'row'=>$previous['row']+$dy*$i/$steps],$config));
            $previous=[...$previous,...$point];
        }
        return max($z,self::ground($to,$config));
    }
}
