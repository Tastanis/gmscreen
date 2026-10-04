<?php
/** Private CLI only. No config.php bootstrap or whole-roster migration. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/student_enrollment.php';
$options = getopt('', ['student:', 'apply:']);
if (!isset($options['student'])) {
    fwrite(STDERR, "Usage: php asl/scripts/add_student.php --student=/private/student.json [--apply=REVIEW_SHA256]\n");
    exit(1);
}
try {
    if (is_file(dirname(__DIR__) . '/.account-reset.lock')) throw new RuntimeException('Account maintenance is active.');
    $path = realpath($options['student']);
    $root = str_replace('\\', '/', realpath(dirname(__DIR__, 2))) . '/';
    $normalized = $path ? str_replace('\\', '/', $path) : '';
    if (!$path || !is_file($path) || str_starts_with(strtolower($normalized), strtolower($root)) || preg_match('~/(public_html|www|htdocs)/~i', $normalized)) throw new RuntimeException('Student JSON must be a private file outside the web checkout and document root.');
    if (filesize($path) > 8192) throw new RuntimeException('Expected one small student record.');
    $input = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($input) || array_is_list($input)) throw new RuntimeException('Expected one student object, not a roster.');
    aslhub_enrollment_student($input);
    $c = require dirname(__DIR__) . '/config.local.php';
    if (isset($c['claim_password'])) define('ASLHUB_CLAIM_PASSWORD', (string)$c['claim_password']);
    $pdo = new PDO("mysql:host={$c['host']};port=" . ($c['port'] ?? 3306) . ";dbname={$c['dbname']};charset=utf8mb4", $c['user'], $c['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $destination = ['host'=>$c['host'], 'port'=>(int)($c['port'] ?? 3306), 'database'=>$pdo->query('SELECT DATABASE()')->fetchColumn(), 'server'=>$pdo->query('SELECT @@hostname')->fetchColumn()];
    // Existing schema is required; do not run migrations or automatic backups here.
    $pdo->query('SELECT is_unclaimed,skyward_student_id,must_change_password FROM users LIMIT 0');
    $plan = aslhub_enrollment_plan($pdo, $input, $destination);
    if (isset($options['apply'])) {
        $id = aslhub_enroll_student($pdo, $input, $destination, $options['apply']);
        echo json_encode(['created_student_id'=>$id, 'created'=>1, 'updated'=>0, 'deleted'=>0], JSON_PRETTY_PRINT), PHP_EOL;
    } else {
        echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
    }
} catch (PDOException $error) {
    fwrite(STDERR, "Database operation failed; enrollment was not completed. Verify configuration/schema or retry a fresh preview.\n");
    exit(1);
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
