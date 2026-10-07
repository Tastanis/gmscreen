<?php
declare(strict_types=1);

/** Shared map design. Revisions belong to each independently editable field. */
final class SceneEnvironment
{
    public static function project(array $environment): array
    {
        foreach ($environment['walls']['value']['segments'] ?? [] as $i => $edge) {
            if (($edge['secret'] ?? false) && !($edge['open'] ?? false)) {
                $edge['interaction'] = 'none';
                unset($edge['open'], $edge['locked']);
            }
            unset($edge['secret']);
            $environment['walls']['value']['segments'][$i] = $edge;
        }
        // GM-only zones never reach a player browser.
        if (isset($environment['zones']['value']['zones']) && is_array($environment['zones']['value']['zones'])) {
            $environment['zones']['value']['zones'] = array_values(array_filter($environment['zones']['value']['zones'], static fn($zone)=>!is_array($zone) || ($zone['gmOnly'] ?? false) !== true));
        }
        return $environment;
    }

    public static function portal(array $current, array $payload): array
    {
        if (($payload['expectedRevision'] ?? null) !== ($current['walls']['revision'] ?? 0)) throw new InvalidArgumentException('Walls changed. Reload before changing the door.');
        if (!is_bool($payload['open'] ?? null)) throw new InvalidArgumentException('Invalid portal state.');
        foreach ($current['walls']['value']['segments'] ?? [] as $i=>$edge) {
            if (($edge['id'] ?? null) !== ($payload['segmentId'] ?? null)) continue;
            if (!in_array($edge['interaction'] ?? '', ['door','window'], true) || ($edge['locked'] ?? false)) throw new InvalidArgumentException('Portal is locked or unavailable.');
            $current['walls']['value']['segments'][$i]['open']=$payload['open'];
            $current['walls']['revision']++;
            return $current;
        }
        throw new InvalidArgumentException('Portal does not exist.');
    }

    public static function terrainPatch(array $current, array $payload): array
    {
        $field=$current['terrain'] ?? null;
        if (!$field || ($payload['expectedRevision'] ?? null)!==$field['revision']) throw new InvalidArgumentException('Terrain changed. Reload before editing.');
        $value=$field['value'];$patch=$payload['patch'] ?? [];
        foreach(['i0','j0','i1','j1'] as $key) if(!is_int($patch[$key] ?? null)||$patch[$key]<0) throw new InvalidArgumentException('Invalid terrain patch bounds.');
        if($patch['i1']<$patch['i0']||$patch['j1']<$patch['j0']||$patch['i1']>=$value['n']||$patch['j1']>=$value['m']) throw new InvalidArgumentException('Terrain patch outside grid.');
        $values=$patch['values'] ?? null;
        if(!is_array($values)||!array_is_list($values)||count($values)!==($patch['i1']-$patch['i0']+1)*($patch['j1']-$patch['j0']+1)) throw new InvalidArgumentException('Invalid terrain patch samples.');
        $k=0;for($j=$patch['j0'];$j<=$patch['j1'];$j++)for($i=$patch['i0'];$i<=$patch['i1'];$i++){self::number($values[$k]);$value['h'][$j*$value['n']+$i]=$values[$k++];}
        $current['terrain']=['revision'=>$field['revision']+1,'value'=>$value];
        return $current;
    }

    public static function removeLevels(array $environment, array $removed): array
    {
        if(!$removed)return $environment;
        if(isset($environment['walls'])){
            $before=$environment['walls']['value'];$after=$before;
            foreach(['roofs','ramps'] as $key)if(isset($after[$key]))$after[$key]=array_values(array_filter($after[$key],static fn($item)=>!in_array($item['levelId']??null,$removed,true)&&!in_array($item['fromLevel']??null,$removed,true)&&!in_array($item['toLevel']??null,$removed,true)));
            if($before!==$after)$environment['walls']=['revision'=>$environment['walls']['revision']+1,'value'=>$after];
        }
        if(isset($environment['zones']['value']['zones'])){
            $before=$environment['zones']['value']['zones'];
            $after=array_values(array_filter($before,static fn($zone)=>!in_array($zone['levelId']??'level-0',$removed,true)));
            if($before!==$after){$environment['zones']['value']['zones']=$after;$environment['zones']['revision']=($environment['zones']['revision']??0)+1;}
        }
        return $environment;
    }
    public static function apply(array $current, array $payload): array
    {
        $field = $payload['field'] ?? '';
        if (!in_array($field, ['terrain', 'walls', 'exploration', 'zones'], true)) throw new InvalidArgumentException('Invalid environment field.');
        $revision = (int)($current[$field]['revision'] ?? 0);
        if (($payload['expectedRevision'] ?? null) !== $revision) throw new InvalidArgumentException('Map design changed. Reload the latest design before editing.');
        $value = $payload['value'] ?? null;
        if (!is_array($value)) throw new InvalidArgumentException('Missing map design.');
        self::validate($field, $value);
        $current[$field] = ['revision'=>$revision + 1, 'value'=>$value];
        return $current;
    }

    private static function number($value): void
    {
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || abs($value)>1000000) throw new InvalidArgumentException('Invalid geometry number.');
    }

    public static function validate(string $field, array $value): void
    {
        if ($field === 'exploration') {
            if (!is_string($value['resetId'] ?? null) || !preg_match('/^[a-zA-Z0-9-]{8,128}$/', $value['resetId'])) throw new InvalidArgumentException('Invalid exploration reset.');
            return;
        }
        if ($field === 'terrain') {
            $n=$value['n'] ?? 0; $m=$value['m'] ?? 0; $h=$value['h'] ?? null;
            if (!is_int($n)||!is_int($m)||$n<2||$m<2||$n>501||$m>501||!is_array($h)||!array_is_list($h)||count($h)!==$n*$m) throw new InvalidArgumentException('Invalid terrain grid.');
            foreach ($h as $height) self::number($height);
            if(isset($value['bounds'])) {
                if(!is_array($value['bounds']))throw new InvalidArgumentException('Invalid terrain bounds.');
                foreach(['left','top','width','height'] as $key)self::number($value['bounds'][$key]??null);
                if($value['bounds']['width']<=0||$value['bounds']['height']<=0)throw new InvalidArgumentException('Invalid terrain extent.');
            }
            return;
        }
        if ($field === 'zones') { self::validateZones($value); return; }
        if ($field !== 'walls' || ($value['version'] ?? null)!==1) throw new InvalidArgumentException('Invalid wall format.');
        $nodes=$value['nodes'] ?? null; $segments=$value['segments'] ?? null;
        if (!is_array($nodes)||!is_array($segments)||!array_is_list($nodes)||!array_is_list($segments)||count($nodes)>10000||count($segments)>20000) throw new InvalidArgumentException('Invalid wall collection.');
        foreach (['roofs','ramps'] as $list) if (isset($value[$list]) && (!is_array($value[$list]) || !array_is_list($value[$list]) || count($value[$list])>10000)) throw new InvalidArgumentException('Invalid surface collection.');
        $ids=[]; foreach ($nodes as $node) {
            $id=$node['id'] ?? null;
            if (!is_string($id)||$id===''||strlen($id)>128||isset($ids[$id])) throw new InvalidArgumentException('Invalid wall node ID.');
            self::number($node['x'] ?? null);self::number($node['y'] ?? null);$ids[$id]=true;
        }
        $edges=[];$pairs=[];foreach ($segments as $edge) {
            $id=$edge['id'] ?? null;
            if (!is_string($id)||$id===''||strlen($id)>128||isset($edges[$id])||!isset($ids[$edge['a'] ?? ''],$ids[$edge['b'] ?? ''])||$edge['a']===$edge['b']) throw new InvalidArgumentException('Invalid wall edge.');
            $edges[$id]=true;
            $pair=[$edge['a'],$edge['b']];sort($pair,SORT_STRING);$pair=json_encode($pair);
            if(isset($pairs[$pair]))throw new InvalidArgumentException('Duplicate wall node pair.');
            $pairs[$pair]=true;
            foreach (['base','height'] as $key) if (isset($edge[$key])) self::number($edge[$key]);
            if (isset($edge['height'])&&($edge['height']<0||$edge['height']>1000)) throw new InvalidArgumentException('Invalid wall height.');
            foreach (['sight'=>['block','pass','limited'],'movement'=>['block','pass'],'interaction'=>['none','door','window'],'baseMode'=>['fixed','terrain'],'topMode'=>['follow','level'],'sightDirection'=>['both','left','right'],'movementDirection'=>['both','left','right']] as $key=>$allowed) if (isset($edge[$key])&&!in_array($edge[$key],$allowed,true)) throw new InvalidArgumentException('Invalid wall property.');
            foreach (['open','locked','secret'] as $key) if (isset($edge[$key])&&!is_bool($edge[$key])) throw new InvalidArgumentException('Invalid wall flag.');
            if (($edge['open'] ?? false)&&($edge['locked'] ?? false)) throw new InvalidArgumentException('Locked wall cannot be open.');
        }
        foreach ($value['roofs'] ?? [] as $roof) {
            self::number($roof['height'] ?? null);
            foreach ($roof['nodes'] ?? [] as $nodeId) if (!isset($ids[$nodeId])) throw new InvalidArgumentException('Roof references missing node.');
            foreach ([$roof['points'] ?? [], ...($roof['holes'] ?? [])] as $ring) {
                if (!is_array($ring)||count($ring)>20000) throw new InvalidArgumentException('Invalid roof ring.');
                foreach ($ring as $point) {self::number($point['x'] ?? null);self::number($point['y'] ?? null);}
            }
        }
        foreach ($value['ramps'] ?? [] as $ramp) {
            foreach (['left','right','top','bottom','base','height'] as $key) self::number($ramp[$key] ?? null);
            if ($ramp['right']<=$ramp['left']||$ramp['bottom']<=$ramp['top']||!in_array($ramp['direction'] ?? 'north',['north','south','east','west'],true)) throw new InvalidArgumentException('Invalid ramp.');
        }
        self::passive($value);
    }

    /** All nested coordinates and media references must remain passive data. */
    private static function passive($item, int $depth=0): void
    {
        if ($depth>16) throw new InvalidArgumentException('Map geometry too deeply nested.');
        if (is_array($item)) { foreach($item as $key=>$child) {
            if (in_array($key,['__proto__','prototype','constructor'],true)) throw new InvalidArgumentException('Unsupported map property.');
            if ($key==='imageId' && is_string($child) && !str_starts_with($child,'/dnd/vtt/')) throw new InvalidArgumentException('Upload roof images before sharing this map.');
            self::passive($child,$depth+1);
        }} elseif (is_int($item)||is_float($item)) self::number($item);
        elseif (is_string($item)&&strlen($item)>2048) throw new InvalidArgumentException('Map field too long.');
    }

    public const ZONE_LIMIT = 200;
    public const ZONE_SQUARE_LIMIT = 20000;
    public const ZONE_TOTAL_SQUARE_LIMIT = 50000;
    public const ZONE_MAX_COST = 10;

    /**
     * Tagged terrain zones: named groups of grid squares ("blood", "water")
     * with a movement cost multiplier. Squares use token coordinates.
     */
    private static function validateZones(array $value): void
    {
        if (($value['version'] ?? null)!==1 || array_diff(array_keys($value),['version','zones'])) throw new InvalidArgumentException('Invalid zone format.');
        $zones=$value['zones'] ?? null;
        if (!is_array($zones)||!array_is_list($zones)||count($zones)>self::ZONE_LIMIT) throw new InvalidArgumentException('Invalid zone list.');
        $ids=[];$total=0;
        foreach ($zones as $zone) {
            if (!is_array($zone)||array_is_list($zone)||array_diff(array_keys($zone),['id','tag','label','levelId','surfaceHeight','cost','gmOnly','squares'])) throw new InvalidArgumentException('Invalid zone record.');
            $id=$zone['id'] ?? null;
            if (!is_string($id)||$id===''||strlen($id)>128||isset($ids[$id])) throw new InvalidArgumentException('Invalid zone ID.');
            $ids[$id]=true;
            if (!is_string($zone['tag'] ?? null)||!preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/',$zone['tag'])) throw new InvalidArgumentException('Invalid zone tag.');
            if (isset($zone['label'])&&(!is_string($zone['label'])||strlen($zone['label'])>80)) throw new InvalidArgumentException('Invalid zone label.');
            if (isset($zone['levelId'])&&(!is_string($zone['levelId'])||$zone['levelId']===''||strlen($zone['levelId'])>128)) throw new InvalidArgumentException('Invalid zone floor.');
            if (array_key_exists('surfaceHeight',$zone)) { self::number($zone['surfaceHeight']); if (abs($zone['surfaceHeight'])>1000) throw new InvalidArgumentException('Invalid zone height.'); }
            if (array_key_exists('cost',$zone)&&(!is_int($zone['cost'])||$zone['cost']<1||$zone['cost']>self::ZONE_MAX_COST)) throw new InvalidArgumentException('Zone cost must be a whole number from 1 to '.self::ZONE_MAX_COST.'.');
            if (array_key_exists('gmOnly',$zone)&&!is_bool($zone['gmOnly'])) throw new InvalidArgumentException('Invalid zone flag.');
            $squares=$zone['squares'] ?? null;
            if (!is_array($squares)||!array_is_list($squares)||!$squares||count($squares)>self::ZONE_SQUARE_LIMIT) throw new InvalidArgumentException('Invalid zone squares.');
            $total+=count($squares);
            if ($total>self::ZONE_TOTAL_SQUARE_LIMIT) throw new InvalidArgumentException('Too many zone squares.');
            $seen=[];
            foreach ($squares as $square) {
                if (!is_array($square)||!array_is_list($square)||count($square)!==2||!is_int($square[0])||!is_int($square[1])||$square[0]<0||$square[1]<0||$square[0]>10000||$square[1]>10000) throw new InvalidArgumentException('Zone squares must be whole [column, row] pairs.');
                $key=$square[0]*10001+$square[1];
                if (isset($seen[$key])) throw new InvalidArgumentException('Zone repeats a square.');
                $seen[$key]=true;
            }
        }
        self::passive($value);
    }

    /** Every zone must sit on the ground floor or on a floor that exists. */
    public static function assertZoneLevels(array $environment, array $mapLevels): void
    {
        $zones=$environment['zones']['value']['zones'] ?? [];
        if (!$zones) return;
        $levels=['level-0'=>true];
        foreach ($mapLevels['levels'] ?? [] as $level) if (is_string($level['id'] ?? null)) $levels[$level['id']]=true;
        foreach ($zones as $zone) if (!isset($levels[$zone['levelId'] ?? 'level-0'])) throw new InvalidArgumentException('A zone uses a missing floor.');
    }
}
