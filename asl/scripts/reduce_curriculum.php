<?php
/** Read-only preview by default. Explicit digest required for the reviewed apply. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/helpers.php';
require_once dirname(__DIR__) . '/lib/curriculum_reduction.php';
require_once dirname(__DIR__) . '/lib/backup.php';
$options=getopt('', ['apply:']);
try {
    if (is_file(dirname(__DIR__) . '/.account-reset.lock')) throw new RuntimeException('Account maintenance is active.');
    $c=require dirname(__DIR__) . '/config.local.php';
    if (!empty($c['backup_dir'])) define('ASLHUB_BACKUP_DIR',(string)$c['backup_dir']);
    $pdo=new PDO("mysql:host={$c['host']};port=".($c['port'] ?? 3306).";dbname={$c['dbname']};charset=utf8mb4",$c['user'],$c['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $destination=['host'=>$c['host'],'port'=>(int)($c['port'] ?? 3306),'database'=>$pdo->query('SELECT DATABASE()')->fetchColumn(),'server'=>$pdo->query('SELECT @@hostname')->fetchColumn()];
    if (isset($options['apply'])) {
        $plan=aslhub_apply_reduction($pdo,$destination,(string)$options['apply'],fn(PDO $db)=>aslhub_backup_sql($db));
        echo json_encode(['applied'=>true,'courses'=>$plan['courses']],JSON_PRETTY_PRINT),PHP_EOL;
    } else {
        aslhub_reduction_lock($pdo);
        try { echo json_encode(aslhub_reduction_plan($pdo,$destination),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),PHP_EOL; }
        finally { aslhub_reduction_unlock($pdo); }
    }
} catch (PDOException $e) {
    fwrite(STDERR,"Database operation failed. No successful migration was confirmed; inspect the database before retrying.\n"); exit(1);
} catch (Throwable $e) { fwrite(STDERR,$e->getMessage()."\n"); exit(1); }
