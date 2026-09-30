<?php
declare(strict_types=1);
// Read-only size/count metadata; never opens the authority or emits saved content.
$path=isset($argv[1])?realpath($argv[1]):false;if($path===false||!is_file($path))throw new InvalidArgumentException('Pass an existing SQLite database.');
$pdo=new PDO('sqlite:file:'.str_replace('\\','/',$path).'?mode=ro',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);$pdo->exec('PRAGMA query_only=ON');
$tables=[];
foreach($pdo->query("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'vtt_%'")->fetchAll() as $row){
 $name=$row['name'];if(!preg_match('/^[a-zA-Z0-9_]+$/',$name))continue;
 $columns=array_column($pdo->query('PRAGMA table_info("'.$name.'")')->fetchAll(),'name');$jsonColumns=array_values(array_intersect($columns,['state_json','payload_json','event_json','catalog_json','details']));
 $sizes=[];foreach($jsonColumns as $column)$sizes[$column]=(int)$pdo->query('SELECT COALESCE(SUM(LENGTH("'.$column.'")),0) FROM "'.$name.'"')->fetchColumn();
 $tables[$name]=['rows'=>(int)$pdo->query('SELECT COUNT(*) FROM "'.$name.'"')->fetchColumn(),'textBytes'=>$sizes];
}
$allocated=[];try{foreach($pdo->query('SELECT name,SUM(pgsize) AS bytes FROM dbstat GROUP BY name')->fetchAll() as $row)$allocated[$row['name']]=(int)$row['bytes'];}catch(PDOException $error){}
echo json_encode(['databaseBytes'=>filesize($path),'walBytes'=>is_file($path.'-wal')?filesize($path.'-wal'):0,'pageSize'=>(int)$pdo->query('PRAGMA page_size')->fetchColumn(),'pageCount'=>(int)$pdo->query('PRAGMA page_count')->fetchColumn(),'freePages'=>(int)$pdo->query('PRAGMA freelist_count')->fetchColumn(),'tables'=>$tables,'allocatedBytes'=>$allocated],JSON_PRETTY_PRINT)."\n";
