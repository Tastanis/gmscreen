<?php
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/competency-fixture.php';
require dirname(__DIR__).'/lib/helpers.php';
require dirname(__DIR__).'/lib/competencies.php';
require dirname(__DIR__).'/lib/data.php';
function check($ok,$label) { if (!$ok) throw new RuntimeException($label); echo "PASS $label\n"; }
function rejected($fn,$label) { try { $fn(); } catch (Throwable $e) { check(true,$label); return; } throw new RuntimeException($label); }
$pdo=new CompetencyFixturePDO(':memory:'); competency_fixture_schema($pdo);
$bundle=aslhub_competency_bundle();
$users=$pdo->query('SELECT * FROM users')->fetchAll();
rejected(fn()=>aslhub_import_competencies($pdo,fn()=>throw new RuntimeException('backup failed')),'failed backup aborts');
check(!aslhub_competencies_installed($pdo) && aslhub_target_count($pdo,1)===0,'failed backup leaves data untouched');
$pdo->exec("CREATE TRIGGER fail_curriculum BEFORE INSERT ON asl_learning_targets BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END");
rejected(fn()=>aslhub_import_competencies($pdo,fn()=>null),'mid-import failure rolls back');
check((int)$pdo->query('SELECT COUNT(*) FROM asl_calendar_days')->fetchColumn()===0 && !aslhub_competencies_installed($pdo),'calendar and marker rolled back together');
$pdo->exec('DROP TRIGGER fail_curriculum');
$pdo->exec("INSERT INTO asl_learning_targets (id,target_code,active,asl_level) VALUES (999,'legacy',1,1)");
$pdo->exec("INSERT INTO user_learning_targets VALUES (2,999,4,'2026-09-14')");
$pdo->exec("INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at) VALUES (2,999,4,'2026-09-14')");
$backups=0; aslhub_import_competencies($pdo,function()use(&$backups){$backups++;});
check($backups===1 && aslhub_competencies_installed($pdo),'one setup backup and completed marker');
rejected(fn()=>aslhub_import_competencies($pdo,fn()=>throw new RuntimeException('unexpected backup')),'duplicate import rejected');
check($users===$pdo->query('SELECT * FROM users')->fetchAll(),'accounts and passwords unchanged');
check((int)$pdo->query('SELECT active FROM asl_learning_targets WHERE id=999')->fetchColumn()===0,'legacy target retired');
check((int)$pdo->query('SELECT score FROM user_learning_targets WHERE learning_target_id=999')->fetchColumn()===4,'legacy grade preserved');
foreach ([1=>89,2=>91,3=>91] as $level=>$count) {
    check(aslhub_target_count($pdo,$level)===$count,"ASL $level target count");
    $taxonomy=aslhub_taxonomy($pdo,$level);
    check(count($taxonomy[0]['standards'])===($level===1?15:16),"ASL $level competency metadata");
    $max=(int)$pdo->query("SELECT SUM(m) FROM (SELECT MAX(r.score) m FROM asl_learning_targets t JOIN asl_rubric_levels r ON t.id=r.learning_target_id WHERE t.active=1 AND t.asl_level=$level GROUP BY t.id)")->fetchColumn();
    check($max===[1=>356,2=>364,3=>352][$level],"ASL $level defined maximum");
}
$calendar=aslhub_calendar_parse(json_encode($bundle['calendar']));
check(array_sum(array_column($calendar['blocks'],'instructional_days'))===171 && count($calendar['blocks'])===18 && $calendar['blocks'][17]['instructional_days']===1,'171 days, seventeen full blocks plus one day');
foreach ($calendar['days'] as $d) if ($d['instructional']) check((int)date('N',strtotime($d['date']))<=5,'instructional weekday '.$d['date']);
$code=aslhub_competency_target_code(1,'sentences','declarative','expression');
$q=$pdo->prepare('SELECT * FROM asl_learning_targets WHERE target_code=?'); $q->execute([$code]); $t=$q->fetch();
check(str_contains($t['description'],'basic declarative statements') && !str_contains($t['description'],'the intended ASL construction'),'underlined slot substituted with grammatical casing');
$pdo->prepare("INSERT INTO user_learning_targets VALUES (2,?,4,'2026-09-14')")->execute([$t['id']]);
$pdo->prepare("INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at) VALUES (2,?,4,'2026-09-14')")->execute([$t['id']]);
$before=$pdo->query('SELECT * FROM user_learning_target_score_history')->fetchAll();
$bundle['courses'][0]['competencies'][0]['title']='Revised title';
$bundle['courses'][0]['competencies'][0]['number']=42;
$bundle['courses'][0]['competencies'][0]['rubric']['3'][0]['text']='Revised prose ';
$pdo->beginTransaction(); aslhub_write_competencies($pdo,$bundle); $pdo->commit();
$q->execute([$code]); check($q->fetch()['id']===$t['id'],'wording and numbering changes retain target ID');
check($before===$pdo->query('SELECT * FROM user_learning_target_score_history')->fetchAll(),'wording changes preserve complete history');
$receptive=aslhub_competency_target_code(1,'sentences','declarative','reception'); $q->execute([$receptive]); $r=$q->fetch();
check($r['id']!==$t['id'] && !array_key_exists($r['id'],aslhub_student_scores($pdo,2)),'Expression score independent of Reception');
$pdo->exec("UPDATE asl_reporting_blocks SET finalized_at='2026-09-15' WHERE block_index=1");
$changed=$calendar; $changed['blocks'][0]['end_date']='2026-10-01';
rejected(fn()=>aslhub_calendar_apply($pdo,$changed),'finalized block remapping refused');
check(!$pdo->inTransaction(),'calendar failure closes owned transaction');
$changed=$calendar;
foreach ($changed['days'] as &$day) {
    if ($day['date']==='2026-09-15') $day['instructional']=false;
    if ($day['date']==='2026-09-19') $day['instructional']=true;
}
unset($day);
rejected(fn()=>aslhub_calendar_apply($pdo,$changed),'same-count finalized interior day swap refused');
echo "All competency integration tests passed.\n";
