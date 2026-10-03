<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/competency-fixture.php';
require dirname(__DIR__).'/lib/helpers.php';
require dirname(__DIR__).'/lib/competencies.php';
require dirname(__DIR__).'/lib/data.php';
require dirname(__DIR__).'/lib/teacher_layout.php';
function check($ok,$label) { if (!$ok) throw new RuntimeException($label); echo "PASS $label\n"; }
$pdo=new CompetencyFixturePDO(':memory:'); competency_fixture_schema($pdo);
aslhub_import_competencies($pdo,fn()=>null);
$teacher=$pdo->query('SELECT * FROM users WHERE id=1')->fetch();
$roster=fn()=>aslhub_scoped_students($pdo,$teacher,['teacher'=>'harms']);
$ready=fn()=>aslhub_ready_for_review($pdo,$roster());
$id=(int)$pdo->query('SELECT id FROM asl_learning_targets WHERE asl_level=1 AND active=1 LIMIT 1')->fetchColumn();
$pdo->exec("INSERT INTO asl_self_assessments VALUES (2,$id,2)");
check(count($ready())===1 && (int)$ready()[0]['teacher_score']===1,'missing teacher score uses baseline one');
$pdo->exec("INSERT INTO user_learning_targets VALUES (2,$id,0,NULL)");
check(count($ready())===1,'saved zero uses baseline one');
$pdo->exec("UPDATE user_learning_targets SET score=3");
check(!$ready(),'teacher above student clears readiness');
$pdo->exec('UPDATE asl_self_assessments SET score=3');
check(!$ready(),'matching self rating stays clear');
$pdo->exec('UPDATE asl_self_assessments SET score=4');
check(count($ready())===1,'later higher self rating reappears');
$pdo->exec('UPDATE asl_self_assessments SET score=2');
check(!$ready(),'lowering self rating clears readiness');
$pdo->exec('UPDATE asl_self_assessments SET score=4');
check(!aslhub_ready_for_review($pdo,[]),'empty roster leaks nothing');
$other=$pdo->query('SELECT * FROM users WHERE id=4')->fetch();
check(!aslhub_ready_for_review($pdo,aslhub_scoped_students($pdo,$other)),'other teacher cannot see readiness');
check(!aslhub_ready_for_review($pdo,aslhub_scoped_students($pdo,$teacher,['level'=>3])),'level filter respected');
$pdo->exec('UPDATE users SET level=3 WHERE id=2');
check(!$ready(),'former course skills excluded');
$pdo->exec('UPDATE users SET level=1,is_active=0 WHERE id=2');
check(!$ready(),'inactive students excluded');
$pdo->exec('UPDATE users SET is_active=1 WHERE id=2');
$pdo->exec("UPDATE asl_learning_targets SET active=0 WHERE id=$id");
check(!$ready(),'retired skills excluded');
