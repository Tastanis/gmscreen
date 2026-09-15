<?php
/** CLI only. Private roster input and SQL backups must stay outside the web checkout. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/roster.php';
require_once dirname(__DIR__) . '/lib/account_reset.php';
require_once dirname(__DIR__) . '/lib/backup.php';
$options = getopt('', ['rosters:', 'apply:', 'backup-dir:']);
$roster = aslhub_read_rosters($options['rosters'] ?? '');
$c = require dirname(__DIR__) . '/config.local.php';
$pdo = new PDO("mysql:host={$c['host']};port=" . ($c['port'] ?? 3306) . ";dbname={$c['dbname']};charset=utf8mb4", $c['user'], $c['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
// Read-only preflight: normal app deployment installs the additive schema first.
$pdo->query('SELECT is_unclaimed, skyward_student_id FROM users LIMIT 0');
if ($pdo->query("SELECT setting_value FROM asl_settings WHERE setting_key='accounts_phase1_complete'")->fetchColumn()) throw new RuntimeException('Phase one already applied; refusing another reset.');
$plan = aslhub_account_reset_plan($pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(), $roster);
if (!isset($options['apply'])) { echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL; exit; }
if (empty($c['claim_password']) && !getenv('ASLHUB_CLAIM_PASSWORD')) throw new RuntimeException('Configure the private claiming credential before importing accounts.');
if (!hash_equals($plan['review_sha256'], $options['apply'])) throw new RuntimeException('Review hash does not match.');
$backupDir = realpath($options['backup-dir'] ?? '');
$root = realpath(dirname(__DIR__, 2));
$rosterDir = realpath($options['rosters']);
foreach ([$backupDir, $rosterDir] as $private) {
    if (!$private || str_starts_with(strtolower(str_replace('\\','/',$private) . '/'), strtolower(str_replace('\\','/',$root) . '/'))) throw new RuntimeException('Rosters and backups must be outside the web checkout.');
}
$lockPath = dirname(__DIR__) . '/.account-reset.lock';
$lock = @fopen($lockPath, 'x');
if (!$lock) throw new RuntimeException('Another reset or maintenance lock exists.');
fclose($lock);
try {
    $pdo->beginTransaction();
    // Lock all captured ASL rows before backup; concurrent requests cannot alter the snapshot.
    foreach (ASLHUB_BACKUP_TABLES as $table) {
        if (!aslhub_backup_table_exists($pdo, $table)) throw new RuntimeException("Missing backup table: $table");
        $engine = $pdo->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');
        $engine->execute([$table]);
        if (strcasecmp((string)$engine->fetchColumn(), 'InnoDB') !== 0) throw new RuntimeException("Transactional storage required: $table");
        $pdo->query("SELECT * FROM `$table` FOR UPDATE")->fetchAll();
    }
    $current = aslhub_account_reset_plan($pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(), $roster);
    if (!hash_equals($plan['review_sha256'], $current['review_sha256'])) throw new RuntimeException('Accounts changed since review.');
    putenv('ASLHUB_BACKUP_DIR=' . $backupDir);
    $backup = aslhub_backup_sql($pdo);
    $backupHash = hash_file('sha256', $backup);
    // Confirm every table is represented in the on-disk SQL before modifying accounts.
    $sql = file_get_contents($backup);
    foreach (ASLHUB_BACKUP_TABLES as $table) if (!str_contains($sql, "CREATE TABLE `$table`")) throw new RuntimeException('Incomplete SQL backup.');
    aslhub_apply_account_reset($pdo, $roster, $plan['review_sha256'], $backup, $backupHash);
    $actual = $pdo->query('SELECT first_name,last_name,email,skyward_student_id,class_period,level FROM users WHERE is_unclaimed=1 ORDER BY skyward_student_id')->fetchAll();
    $expected = $roster['students'];
    usort($expected, fn($a,$b) => strcmp($a['skyward_student_id'],$b['skyward_student_id']));
    if ($actual != $expected || (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_teacher=1')->fetchColumn() !== 1
        || (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== count($expected) + 2) throw new RuntimeException('Post-import verification failed.');
    $pdo->prepare("INSERT INTO asl_settings (setting_key,setting_value) VALUES ('accounts_phase1_complete',?)")->execute([json_encode(['backup'=>basename($backup),'sha256'=>$backupHash])]);
    $pdo->commit();
    echo json_encode(['imported'=>count($roster['students']), 'backup'=>$backup, 'sha256'=>$backupHash], JSON_PRETTY_PRINT), PHP_EOL;
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
} finally {
    unlink($lockPath);
}
