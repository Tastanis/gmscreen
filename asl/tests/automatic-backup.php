<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/competency-fixture.php';
require dirname(__DIR__).'/lib/automatic_backup.php';
$directory = sys_get_temp_dir().'/asl-backup-test-'.bin2hex(random_bytes(6));
putenv('ASLHUB_BACKUP_DIR='.$directory);
$db = new CompetencyFixturePDO(':memory:');
competency_fixture_schema($db);
$db->exec("INSERT INTO asl_reporting_blocks (id,block_index,start_date,end_date,active) VALUES (1,1,'2026-09-08','2026-09-18',1),(2,2,'2026-09-21','2026-10-02',1)");
$db->exec('INSERT INTO user_learning_targets (user_id,learning_target_id,score) VALUES (2,5,3)');
$db->exec('INSERT INTO asl_student_block_metrics (user_id,block_id,absences,participation_points,participation_max,version) VALUES (2,1,2,24,27,1)');
function check($condition, $label) { if (!$condition) throw new RuntimeException($label); echo "PASS $label\n"; }
try {
    aslhub_automatic_backup($db, '2026-09-18');
    $block = $directory.'/automatic/block-2026-09-08.sql';
    $hash = hash_file('sha256', $block);
    aslhub_automatic_backup($db, '2026-09-18');
    check(count(glob($directory.'/automatic/*.sql'))===2, 'same-day requests do not duplicate backups');
    $db->exec('UPDATE user_learning_targets SET score=4');
    aslhub_automatic_backup($db, '2026-09-21');
    check(hash_file('sha256',$block)===$hash, 'later block does not overwrite earlier snapshot');
    check(is_file($directory.'/automatic/block-2026-09-21.sql'), 'new block has retained snapshot');
    $restore = new CompetencyFixturePDO(':memory:');
    $sql = str_replace(['SET FOREIGN_KEY_CHECKS=0;', 'SET FOREIGN_KEY_CHECKS=1;'], '', file_get_contents($block));
    $restore->exec($sql);
    check((int)$restore->query('SELECT score FROM user_learning_targets')->fetchColumn()===3, 'SQL snapshot restores skill points');
    $row = $restore->query('SELECT * FROM asl_student_block_metrics')->fetch();
    check((int)$row['absences']===2 && (int)$row['participation_points']===24 && (int)$row['version']===1, 'SQL snapshot restores attendance participation and versions');
    check((int)$restore->query('SELECT COUNT(*) FROM users')->fetchColumn()===4, 'snapshot includes student identities');
    for ($i=0;$i<65;$i++) {
        $day=(new DateTimeImmutable('2026-10-03'))->modify("+$i days")->format('Y-m-d');
        aslhub_automatic_backup($db,$day);
    }
    check(count(glob($directory.'/automatic/daily-*.sql'))===60, 'daily retention is bounded');
    check(hash_file('sha256',$block)===$hash, 'daily pruning preserves block snapshots');
} finally {
    foreach (glob($directory.'/automatic/*') ?: [] as $file) unlink($file);
    if (is_dir($directory.'/automatic')) rmdir($directory.'/automatic');
    foreach (['.htaccess','index.php'] as $file) if (is_file($directory.'/'.$file)) unlink($directory.'/'.$file);
    if (is_dir($directory)) rmdir($directory);
}
