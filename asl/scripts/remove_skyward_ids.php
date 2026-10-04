<?php
/** CLI only, preview by default. Deployment does not invoke this purge. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/skyward_privacy.php';
$options = getopt('', ['apply:', 'confirm:']);
try {
    if (is_file(dirname(__DIR__) . '/.account-reset.lock')) throw new RuntimeException('Account maintenance is active.');
    $c = require dirname(__DIR__) . '/config.local.php';
    $pdo = new PDO("mysql:host={$c['host']};port=".($c['port']??3306).";dbname={$c['dbname']};charset=utf8mb4",$c['user'],$c['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $destination = ['host'=>$c['host'],'port'=>(int)($c['port']??3306),'database'=>$pdo->query('SELECT DATABASE()')->fetchColumn(),'server'=>$pdo->query('SELECT @@hostname')->fetchColumn()];
    if (isset($options['apply'])) {
        if (($options['confirm']??'') !== 'REMOVE-SKYWARD-NUMBERS') throw new RuntimeException('Explicit confirmation required after reviewing the live scope and recovery implications.');
        echo json_encode(['cleared'=>aslhub_purge_skyward_ids($pdo,$destination,$options['apply']),'remaining_skyward_numbers'=>0]),PHP_EOL;
    } else echo json_encode(aslhub_skyward_purge_plan($pdo,$destination),JSON_PRETTY_PRINT),PHP_EOL;
} catch (PDOException $e) {
    fwrite(STDERR,"Database operation failed; verify destination and schema. No raw student numbers are logged.\n");exit(1);
} catch (Throwable $e) { fwrite(STDERR,$e->getMessage()."\n");exit(1); }
