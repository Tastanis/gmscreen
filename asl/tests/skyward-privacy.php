<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__).'/lib/skyward_privacy.php';
require_once dirname(__DIR__).'/lib/account_auth.php';
function verify_privacy(bool $ok,string $label): void { if (!$ok) throw new RuntimeException($label); echo "PASS $label\n"; }
function refuse_privacy(callable $fn,string $label): void { try { $fn(); } catch (RuntimeException $e) { verify_privacy(true,$label); return; } throw new RuntimeException($label); }
$file=tempnam(sys_get_temp_dir(),'asl-privacy-');
$connect=fn()=>new PDO('sqlite:'.$file,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
try {
    $db=$connect();
    $db->exec('CREATE TABLE users (id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT,email TEXT,password TEXT,is_active INTEGER,is_unclaimed INTEGER,is_teacher INTEGER,skyward_student_id TEXT)');
    $add=$db->prepare('INSERT INTO users VALUES (?,?,?,?,?,1,0,0,?)');
    foreach ([1=>'SYNTHETIC-ONE',2=>'SYNTHETIC-TWO',3=>null] as $id=>$skyward) $add->execute([$id,'Student'.$id,'Fixture',null,password_hash('personal',PASSWORD_DEFAULT),$skyward]);
    $tables=['user_learning_targets','user_learning_target_score_history','asl_student_meetings','asl_student_block_metrics','asl_self_assessments','user_goals'];
    foreach ($tables as $table) {
        $db->exec("CREATE TABLE $table (user_id INTEGER,value TEXT)");
        $db->exec("INSERT INTO $table VALUES (1,'original data'),(2,'original history')");
    }
    $snapshot=function()use(&$db,$tables){ $s=[];foreach(['users',...$tables] as $t)$s[$t]=$db->query("SELECT * FROM $t ORDER BY 1")->fetchAll();return $s; };
    $before=$snapshot();$destination=['database'=>'synthetic'];
    $plan=aslhub_skyward_purge_plan($db,$destination);
    verify_privacy($before===$snapshot() && $plan['affected_accounts']===2,'aggregate preview is read only');
    verify_privacy(!str_contains(json_encode($plan),'SYNTHETIC-ONE')&&!str_contains(json_encode($plan),'SYNTHETIC-TWO'),'preview never prints school numbers');
    refuse_privacy(fn()=>aslhub_purge_skyward_ids($db,$destination,'stale'),'stale review refused');
    refuse_privacy(fn()=>aslhub_purge_skyward_ids($db,['database'=>'other'],$plan['review_sha256']),'wrong destination refused');
    $db->exec("CREATE TRIGGER stop_purge AFTER UPDATE ON users BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    refuse_privacy(fn()=>aslhub_purge_skyward_ids($db,$destination,$plan['review_sha256']),'purge failure rolls back');
    verify_privacy($before===$snapshot(),'failure preserves every field and relationship');
    $db->exec('DROP TRIGGER stop_purge');
    verify_privacy(aslhub_purge_skyward_ids($db,$destination,$plan['review_sha256'])===2,'only the two populated external ID fields cleared');
    $db=null;$db=$connect();
    foreach($before['users'] as &$row)$row['skyward_student_id']=null;unset($row);
    verify_privacy($before===$snapshot(),'after reconnect all internal IDs, accounts and related data preserved exactly except Skyward values');
    verify_privacy(aslhub_authenticate($db,'Student1','Fixture','personal')['id']===1,'existing personal login still works');
    $empty=aslhub_skyward_purge_plan($db,$destination);
    verify_privacy($empty['affected_accounts']===0 && aslhub_purge_skyward_ids($db,$destination,$empty['review_sha256'])===0,'repeat purge is harmless no-op');
} finally { $add=null;$db=null;unlink($file); }
