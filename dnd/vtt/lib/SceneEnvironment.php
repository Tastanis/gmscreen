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
        if(!$removed || !isset($environment['walls']))return $environment;
        $before=$environment['walls']['value'];$after=$before;
        foreach(['roofs','ramps'] as $key)if(isset($after[$key]))$after[$key]=array_values(array_filter($after[$key],static fn($item)=>!in_array($item['levelId']??null,$removed,true)&&!in_array($item['fromLevel']??null,$removed,true)&&!in_array($item['toLevel']??null,$removed,true)));
        if($before!==$after)$environment['walls']=['revision'=>$environment['walls']['revision']+1,'value'=>$after];
        return $environment;
    }
    public static function apply(array $current, array $payload): array
    {
        $field = $payload['field'] ?? '';
        if (!in_array($field, ['terrain', 'walls', 'exploration'], true)) throw new InvalidArgumentException('Invalid environment field.');
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
        // All nested coordinates and media references must remain passive data.
        $visit=function($item, int $depth=0) use (&$visit): void {
            if ($depth>16) throw new InvalidArgumentException('Map geometry too deeply nested.');
            if (is_array($item)) { foreach($item as $key=>$child) {
                if (in_array($key,['__proto__','prototype','constructor'],true)) throw new InvalidArgumentException('Unsupported map property.');
                if ($key==='imageId' && is_string($child) && !str_starts_with($child,'/dnd/vtt/')) throw new InvalidArgumentException('Upload roof images before sharing this map.');
                $visit($child,$depth+1);
            }} elseif (is_int($item)||is_float($item)) self::number($item);
            elseif (is_string($item)&&strlen($item)>2048) throw new InvalidArgumentException('Map field too long.');
        };
        $visit($value);
    }
}
