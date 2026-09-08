<?php
declare(strict_types=1);
require_once __DIR__ . '/ZoneEntryReceipt.php';

/** Durable, world-scoped entry reservations. Reserving never executes an effect. */
final class ZoneEntryClaims
{
    public function __construct(private PDO $pdo, private string $worldId)
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS vtt_zone_entry_claims (
            world_id TEXT NOT NULL, claim_id TEXT NOT NULL, scene_id TEXT NOT NULL,
            zone_id TEXT NOT NULL, placement_id TEXT NOT NULL, boundary TEXT NOT NULL,
            movement_operation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
            status TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at INTEGER NOT NULL,
            PRIMARY KEY(world_id, claim_id),
            UNIQUE(world_id, scene_id, zone_id, placement_id, boundary)
        )');
    }

    /** Caller holds BEGIN IMMEDIATE and has validated identity and current state. */
    public function reserve(array $receipt, array $zone, string $movementOperationId, string $actorId): array
    {
        $key=[$this->worldId,$receipt['sceneId'],$zone['id'],$receipt['placementId'],$receipt['boundary']];
        $claimId=hash('sha256',json_encode($key,JSON_THROW_ON_ERROR));
        $query=$this->pdo->prepare('SELECT claim_id,status,created_at FROM vtt_zone_entry_claims WHERE world_id=? AND claim_id=?');
        $query->execute([$this->worldId,$claimId]);
        $existing=$query->fetch(PDO::FETCH_ASSOC);
        if($existing)return ['claimed'=>false,'claimId'=>$claimId,'status'=>$existing['status'],'createdAt'=>(int)$existing['created_at']];
        $now=(int)floor(microtime(true)*1000);
        $insert=$this->pdo->prepare('INSERT INTO vtt_zone_entry_claims
            (world_id,claim_id,scene_id,zone_id,placement_id,boundary,movement_operation_id,actor_id,status,evidence_json,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $insert->execute([$this->worldId,$claimId,$receipt['sceneId'],$zone['id'],$receipt['placementId'],$receipt['boundary'],
            $movementOperationId,$actorId,'pending',json_encode(['receipt'=>$receipt,'zone'=>$zone],JSON_THROW_ON_ERROR),$now]);
        return ['claimed'=>true,'claimId'=>$claimId,'status'=>'pending','createdAt'=>$now];
    }

    public function unresolved(string $actorId, bool $isGm): array
    {
        $sql="SELECT claim_id,scene_id,zone_id,placement_id,actor_id,status,evidence_json,created_at FROM vtt_zone_entry_claims WHERE world_id=? AND status IN ('pending','needs_review')";
        $args=[$this->worldId];
        if (!$isGm) {$sql.=' AND lower(actor_id)=?';$args[]=strtolower(trim($actorId));}
        $query=$this->pdo->prepare($sql.' ORDER BY created_at ASC,claim_id ASC LIMIT 200');$query->execute($args);
        $results=[];
        foreach ($query->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $evidence=json_decode($row['evidence_json'],true,512,JSON_THROW_ON_ERROR);
            $results[]=['claimId'=>$row['claim_id'],'sceneId'=>$row['scene_id'],'zoneId'=>$row['zone_id'],
                'placementId'=>$row['placement_id'],'actorId'=>$row['actor_id'],'status'=>$row['status'],
                'createdAt'=>(int)$row['created_at'],'zone'=>$evidence['zone'],'movement'=>$evidence['receipt']];
        }
        return $results;
    }

    /** Acknowledges a client outcome or explicit GM review; never replays effects. */
    public function finish(string $claimId,string $status,string $actorId,bool $isGm): array
    {
        if (!preg_match('/^[a-f0-9]{64}$/',$claimId) || !in_array($status,['completed','needs_review','dismissed'],true)) throw new InvalidArgumentException('Invalid claim outcome.');
        $query=$this->pdo->prepare('SELECT actor_id,status FROM vtt_zone_entry_claims WHERE world_id=? AND claim_id=?');
        $query->execute([$this->worldId,$claimId]);$row=$query->fetch(PDO::FETCH_ASSOC);
        if (!$row || (!$isGm && strtolower($row['actor_id'])!==strtolower(trim($actorId)))) throw new InvalidArgumentException('Claim is unavailable.');
        if ($status==='dismissed' && !$isGm) throw new InvalidArgumentException('Only the GM may dismiss an unresolved entry.');
        if ($row['status']===$status) {
            return ['claimId'=>$claimId,'status'=>$status,'idempotent'=>true];
        }
        if (in_array($row['status'],['completed','dismissed'],true)) throw new InvalidArgumentException('Claim already has a final outcome.');
        $update=$this->pdo->prepare('UPDATE vtt_zone_entry_claims SET status=? WHERE world_id=? AND claim_id=? AND status=?');
        $update->execute([$status,$this->worldId,$claimId,$row['status']]);
        if ($update->rowCount()!==1) throw new RuntimeException('Claim changed during acknowledgement.');
        return ['claimId'=>$claimId,'status'=>$status,'idempotent'=>false];
    }

    public static function enters(array $zone,array $from,array $to): bool
    {
        $floor=self::level($zone);
        $rects=is_array($zone['squares'] ?? null)&&$zone['squares']!==[]
            ?array_map(static fn($s)=>is_array($s)?[...$s,'width'=>1,'height'=>1]:[], $zone['squares'])
            :[$zone['template'] ?? []];
        $rects=array_values(array_filter($rects,static fn($r)=>is_array($r)&&self::validRect($r)));
        $overlaps=static function(array $p) use($floor,$rects): bool {
            if(self::level($p)!==$floor)return false;
            foreach($rects as $r)if($p['column']<$r['column']+$r['width']&&$p['column']+$p['width']>$r['column']
                &&$p['row']<$r['row']+$r['height']&&$p['row']+$p['height']>$r['row'])return true;
            return false;
        };
        if(!self::validRect($from)||!self::validRect($to)||$overlaps($from))return false;
        if($overlaps($to))return true;
        if(self::level($from)!==$floor||self::level($to)!==$floor)return false;
        foreach($rects as $r) {
            $enter=0.0;$exit=1.0;
            foreach([['column','width'],['row','height']] as [$axis,$size]) {
                $start=(float)$from[$axis];$delta=(float)$to[$axis]-$start;
                $min=(float)$r[$axis]-(float)$from[$size];$max=(float)$r[$axis]+(float)$r[$size];
                if($delta===0.0){if($start<=$min||$start>=$max){$exit=-1;break;}continue;}
                $a=($min-$start)/$delta;$b=($max-$start)/$delta;
                $enter=max($enter,min($a,$b));$exit=min($exit,max($a,$b));
                if($enter>=$exit)break;
            }
            if($enter<$exit)return true;
        }
        return false;
    }

    public static function level(array $record): string
    {
        $id=$record['levelId'] ?? $record['template']['levelId'] ?? 'level-0';
        return is_string($id)&&trim($id)!==''?trim($id):'level-0';
    }

    private static function validRect(array $r): bool
    {
        foreach(['column','row','width','height'] as $key)if(!isset($r[$key])||!is_numeric($r[$key])||!is_finite((float)$r[$key]))return false;
        return $r['width']>0&&$r['height']>0;
    }
}
