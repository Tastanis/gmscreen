<?php
declare(strict_types=1);
/** Durable per-target collision outcomes. A reservation never replays damage. */
final class CollisionEffects {
 public function __construct(private PDO $pdo,private string $world){$pdo->exec('CREATE TABLE IF NOT EXISTS vtt_collision_effects(world_id TEXT NOT NULL,operation_id TEXT NOT NULL,target_id TEXT NOT NULL,scene_id TEXT NOT NULL,actor_id TEXT NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,damage_type TEXT NOT NULL DEFAULT \'\',PRIMARY KEY(world_id,operation_id,target_id))');if(!in_array('damage_type',array_column($pdo->query('PRAGMA table_info(vtt_collision_effects)')->fetchAll(PDO::FETCH_ASSOC),'name'),true))$pdo->exec("ALTER TABLE vtt_collision_effects ADD COLUMN damage_type TEXT NOT NULL DEFAULT ''");}
 private function ensureFallColumns():void {
  $columns=array_column($this->pdo->query('PRAGMA table_info(vtt_collision_effects)')->fetchAll(PDO::FETCH_ASSOC),'name');
  foreach(['kind'=>"TEXT NOT NULL DEFAULT 'collision'",'details'=>"TEXT NOT NULL DEFAULT '{}'",'parent_operation'=>"TEXT NOT NULL DEFAULT ''"] as $name=>$definition)if(!in_array($name,$columns,true))$this->pdo->exec("ALTER TABLE vtt_collision_effects ADD COLUMN $name $definition");
 }
 public function recordFall(string $op,string $scene,string $actor,string $mover,array $fall):void {
  $this->ensureFallColumns();$key=$op.':fall:'.$mover;
  $q=$this->pdo->prepare('INSERT INTO vtt_collision_effects(world_id,operation_id,target_id,scene_id,actor_id,amount,status,kind,details,parent_operation) VALUES(?,?,?,?,?,?,?,?,?,?)');
  $q->execute([$this->world,$key,$mover,$scene,$actor,min(50,2*$fall['squares']),'pending','fall',json_encode($fall,JSON_THROW_ON_ERROR),$op]);
 }

 /** `$moverExtra` is damage for the moved creature alone: what it was hurled through. */
 public function record(string $op,string $scene,string $actor,string $mover,array $plan,string $damageType='',int $moverExtra=0):void {
  if($plan['damage']<=0&&$moverExtra<=0)return;
  $q=$this->pdo->prepare('INSERT INTO vtt_collision_effects(world_id,operation_id,target_id,scene_id,actor_id,amount,status,damage_type) VALUES(?,?,?,?,?,?,?,?)');
  foreach(array_unique([$mover,...$plan['collidedIds']]) as $id){
   $amount=$plan['damage']+($id===$mover?$moverExtra:0);
   if($amount>0)$q->execute([$this->world,$op,$id,$scene,$actor,$amount,'pending',$damageType]);
  }
 }
 public function list(string $actor,bool $gm,?string $op=null):array {
  $this->ensureFallColumns();
  $sql='SELECT operation_id AS operationId,target_id AS targetId,scene_id AS sceneId,actor_id AS actorId,amount,status,damage_type AS damageType,kind,details FROM vtt_collision_effects WHERE world_id=?';$args=[$this->world];
  if(!$gm){$sql.=' AND lower(actor_id)=?';$args[]=strtolower($actor);}
  if($op!==null){$sql.=' AND (operation_id=? OR parent_operation=?)';$args[]=$op;$args[]=$op;}else $sql.=" AND status NOT IN ('completed','dismissed')";
  $q=$this->pdo->prepare($sql.' ORDER BY operation_id,target_id LIMIT 200');$q->execute($args);$rows=$q->fetchAll(PDO::FETCH_ASSOC);foreach($rows as &$row)$row['details']=json_decode($row['details'],true);return $rows;
 }
 /** The walls a confirmed fall breaks, with the scene they are in; null when it breaks none. */
 public function breaks(string $op,string $id):?array {
  $this->ensureFallColumns();
  $q=$this->pdo->prepare("SELECT scene_id,details FROM vtt_collision_effects WHERE world_id=? AND operation_id=? AND target_id=? AND kind='fall'");$q->execute([$this->world,$op,$id]);$r=$q->fetch(PDO::FETCH_ASSOC);
  $ids=$r?array_values(array_filter(array_column(json_decode($r['details'],true)['breaks']??[],'id'),'is_string')):[];
  return $ids?['sceneId'=>$r['scene_id'],'ids'=>$ids]:null;
 }
 public function update(array $request,string $actor,bool $gm):array {
  $this->ensureFallColumns();
  $op=$request['operationId']??'';$id=$request['targetId']??'';$action=$request['action']??'';
  if(!is_string($op)||$op===''||strlen($op)>512||!is_string($id)||$id===''||strlen($id)>160||!in_array($action,['start','finish'],true))throw new InvalidArgumentException('Invalid collision outcome request.');
  $q=$this->pdo->prepare('SELECT * FROM vtt_collision_effects WHERE world_id=? AND operation_id=? AND target_id=?');$q->execute([$this->world,$op,$id]);$r=$q->fetch(PDO::FETCH_ASSOC);
  if(!$r||(!$gm&&strtolower($r['actor_id'])!==strtolower($actor)))throw new InvalidArgumentException('Collision outcome is unavailable.');
  if($action==='start'){
   if($r['status']!=='pending')return ['granted'=>false,'status'=>$r['status']];
   $next='executing';
  }else{
   $next=$request['status']??'';
   if(!in_array($next,['completed','needs_review','dismissed'],true)||($next==='dismissed'&&!$gm&&$r['kind']!=='fall'))throw new InvalidArgumentException('Invalid collision outcome.');
   if($r['status']===$next)return ['status'=>$next,'idempotent'=>true];
   if(in_array($r['status'],['completed','dismissed'],true))throw new InvalidArgumentException('Collision outcome is already final.');
   if($r['status']==='pending'&&!$gm&&!($r['kind']==='fall'&&$next==='dismissed'))throw new InvalidArgumentException('Damage has not been reserved.');
  }
  $q=$this->pdo->prepare('UPDATE vtt_collision_effects SET status=? WHERE world_id=? AND operation_id=? AND target_id=? AND status=?');$q->execute([$next,$this->world,$op,$id,$r['status']]);
  return ['granted'=>$action==='start','status'=>$next,'amount'=>(int)$r['amount'],'damageType'=>$r['damage_type']];
 }
}
