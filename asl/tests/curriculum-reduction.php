<?php
require __DIR__.'/competency-fixture.php';
require dirname(__DIR__).'/lib/helpers.php';
require dirname(__DIR__).'/lib/curriculum_reduction.php';
require dirname(__DIR__).'/lib/data.php';
function verifyReduction($ok,$label) { if (!$ok) throw new RuntimeException($label); echo "PASS $label\n"; }
function rejectReduction(callable $f,string $label) { try {$f();} catch (Throwable $e) {verifyReduction(true,$label);return;} throw new RuntimeException($label); }
$db=new CompetencyFixturePDO(':memory:'); competency_fixture_schema($db);
$db->beginTransaction(); aslhub_write_competencies($db,aslhub_competency_bundle(true)); $db->commit();
aslhub_set_setting($db,'competencies_installed','competencies-2026-v1');
$getId=function($level,$key,$element,$mode='expression')use($db) {$q=$db->prepare('SELECT id FROM asl_learning_targets WHERE target_code=?');$q->execute([aslhub_competency_target_code($level,$key,$element,$mode)]);return (int)$q->fetchColumn();};
$event=function($user,$target,$score,$date)use($db) {
    $db->prepare('INSERT INTO user_learning_targets (user_id,learning_target_id,score,completed_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),completed_at=VALUES(completed_at)')->execute([$user,$target,$score,$date]);
    $db->prepare('INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at,scored_by) VALUES (?,?,?,?,1)')->execute([$user,$target,$score,$date]);
};
foreach ([1,2,3] as $level) {
    $event(2,$getId($level,'modification','manner'),2,'2026-09-10 12:00:00');
    $event(2,$getId($level,'modification','degree'),3,'2026-09-22 12:00:00');
    $event(2,$getId($level,'modification','degree'),1,'2026-09-25 12:00:00');
    $event(2,$getId($level,'modification','manner','reception'),4,'2026-09-12 12:00:00');
    $event(3,$getId($level,'time','frame'),2,'2026-09-12 12:00:00');
    $event(3,$getId($level,'time','frequency'),2,'2026-09-12 12:00:00');
    $event(2,$getId($level,'formation','compound'),3,'2026-09-11 12:00:00');
    $event(2,$getId($level,'formation','nounverb'),2,'2026-09-12 12:00:00');
    $event(2,$getId($level,'formation','numeral'),4,'2026-09-13 12:00:00');
    $event(2,$getId($level,'history','education','single'),3,'2026-09-13 12:00:00');
}
$source=$getId(1,'modification','manner');
$db->prepare('INSERT INTO asl_self_assessments VALUES (?,?,?)')->execute([2,$source,4]);
$db->prepare('INSERT INTO asl_learning_target_resources (id,learning_target_id) VALUES (1,?)')->execute([$source]);
$db->prepare('INSERT INTO asl_self_assessments VALUES (?,?,?)')->execute([2,$getId(1,'modification','degree'),2]);
$before=aslhub_reduction_snapshot($db); $destination=['database'=>'disposable'];
$plan=aslhub_reduction_plan($db,$destination);
verifyReduction($before===aslhub_reduction_snapshot($db),'preview is read only');
verifyReduction(array_column($plan['courses'],'targets')===[62,64,64],'reduced course sizes');
verifyReduction(count(array_filter($plan['retired_without_transfer'],fn($r)=>count($r['graded_records'])>0))===3,'preview flags unexpected grades on retired-only elements');
rejectReduction(fn()=>aslhub_apply_reduction($db,$destination,'stale',fn()=>null),'stale preview rejected');
rejectReduction(fn()=>aslhub_apply_reduction($db,$destination,$plan['review_digest'],fn()=>throw new RuntimeException('failed backup')),'backup failure prevents writes');
verifyReduction($before===aslhub_reduction_snapshot($db),'failed operations preserve originals');
$db->exec("CREATE TRIGGER reject_merge BEFORE INSERT ON user_learning_targets WHEN NEW.learning_target_id > 271 BEGIN SELECT RAISE(ABORT,'test rollback'); END");
rejectReduction(fn()=>aslhub_apply_reduction($db,$destination,$plan['review_digest'],fn()=>null),'partial migration rolls back');
verifyReduction($before===aslhub_reduction_snapshot($db),'rollback includes taxonomy, resources and history');
$db->exec('DROP TRIGGER reject_merge');
aslhub_apply_reduction($db,$destination,$plan['review_digest'],fn()=>null);
foreach ([1=>62,2=>64,3=>64] as $level=>$n) {
    verifyReduction(aslhub_target_count($db,$level)===$n,'active target count '.$level);
    $id=$getId($level,'modification','manner_intensity');
    $q=$db->prepare('SELECT score,scored_at FROM user_learning_target_score_history WHERE learning_target_id=? ORDER BY scored_at');$q->execute([$id]);$history=$q->fetchAll();
    verifyReduction(array_column($history,'score')===[2,3,2],'highest current score replay preserves corrections');
    verifyReduction(array_column($history,'scored_at')===['2026-09-10 12:00:00','2026-09-22 12:00:00','2026-09-25 12:00:00'],'original dates, no migration-day improvement');
    $retired=$getId($level,'history','education','single');
    $q=$db->prepare('SELECT active FROM asl_learning_targets WHERE id=?');$q->execute([$retired]);
    verifyReduction((int)$q->fetchColumn()===0,'retired-only element excluded without score transfer');
    $scores=aslhub_student_scores($db,2);
    verifyReduction($scores[$id]===2 && $scores[$getId($level,'modification','manner_intensity','reception')]===4,'modes remain independent');
    verifyReduction($scores[$getId($level,'formation','whole')]===3,'word formation merges highest into accuracy');
    $numeral=$getId($level,'formation','numeral');
    $q=$db->prepare('SELECT standard_id FROM asl_learning_targets WHERE id=?');$q->execute([$numeral]);
    verifyReduction($scores[$numeral]===4 && $q->fetchColumn()==='C'.$level.'.manual','numeral keeps identity and grade when moved');
}
foreach ($before['user_learning_targets'] as $row) {
    $q=$db->prepare('SELECT * FROM user_learning_targets WHERE user_id=? AND learning_target_id=?');$q->execute([$row['user_id'],$row['learning_target_id']]);
    verifyReduction($row===$q->fetch(),'original current score retained');
}
foreach ($before['user_learning_target_score_history'] as $row) {
    $q=$db->prepare('SELECT * FROM user_learning_target_score_history WHERE id=?');$q->execute([$row['id']]);
    verifyReduction($row===$q->fetch(),'original historical row retained');
}
$merged=$getId(1,'modification','manner_intensity');
verifyReduction((int)$db->query('SELECT learning_target_id FROM asl_learning_target_resources WHERE id=1')->fetchColumn()===$merged,'resource remains attached to merged skill');
verifyReduction(((array)aslhub_student_self_assessments($db,2))[$merged]===4,'self assessment carried separately');
rejectReduction(fn()=>aslhub_apply_reduction($db,$destination,$plan['review_digest'],fn()=>null),'reapplying does not duplicate history');
echo "ALL CURRICULUM REDUCTION TESTS PASSED\n";
