<?php
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/competency-fixture.php';
require dirname(__DIR__).'/lib/helpers.php';
require dirname(__DIR__).'/lib/competencies.php';
$dir=sys_get_temp_dir().'/asl-competency-'.bin2hex(random_bytes(6)); mkdir($dir);
$source=dirname(__DIR__);
foreach (['lib','css','js','api','teacher','data','tests'] as $sub) mkdir($dir.'/'.$sub);
foreach (['dashboard.php','teacher/dashboard.php','teacher/grading.php','api/save_score.php','api/import_competencies.php',
    'lib/helpers.php','lib/data.php','lib/calendar.php','lib/competencies.php','lib/teacher_layout.php','lib/backup.php','lib/xlsx.php',
    'css/asl-style.css','css/hub.css','css/competencies.css','js/competencies.js','js/dashboard-chart-math.js',
    'data/competencies-2026.json','tests/competency-fixture.php'] as $f) copy($source.'/'.$f,$dir.'/'.$f);
file_put_contents($dir.'/config.php', <<<'PHP'
<?php
session_start();
require __DIR__.'/tests/competency-fixture.php';
require __DIR__.'/lib/helpers.php';
date_default_timezone_set('America/Los_Angeles');
$pdo=new CompetencyFixturePDO(__DIR__.'/fixture.sqlite');
PHP);
// Fixture-only identity switch; never copied into the application.
file_put_contents($dir.'/session.php', <<<'PHP'
<?php
require __DIR__.'/config.php';
$_SESSION['user_id']=(int)($_GET['id'] ?? 2);
if (isset($_GET['reset'])) { $pdo->exec('DELETE FROM user_learning_targets'); $pdo->exec('DELETE FROM user_learning_target_score_history'); }
if (isset($_GET['reset_import'])) $pdo->exec("DELETE FROM asl_settings WHERE setting_key='competencies_installed'");
echo json_encode(['csrf'=>aslhub_csrf_token()]);
PHP);
$pdo=new CompetencyFixturePDO($dir.'/fixture.sqlite'); competency_fixture_schema($pdo);
aslhub_import_competencies($pdo,fn()=>null);
echo $dir;
