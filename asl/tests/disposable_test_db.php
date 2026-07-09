<?php
/**
 * Creates or removes a completely separate ASL demonstration database.
 * This script never selects, updates, or deletes rows in the configured grading DB.
 *
 * Usage:
 *   php disposable_test_db.php create
 *   php disposable_test_db.php drop DROP-CODEX-DISPOSABLE-TEST
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$mode = strtolower($argv[1] ?? '');
$confirm = $argv[2] ?? '';
$sourceConfig = dirname(__DIR__) . '/config.local.php';
if (!file_exists($sourceConfig)) throw new RuntimeException('asl/config.local.php is required.');
$creds = require $sourceConfig;
$base = preg_replace('/[^a-zA-Z0-9_]/', '_', (string)$creds['dbname']);
$suffix = '_codex_disposable_test';
$testDb = substr($base, 0, 64 - strlen($suffix)) . $suffix;
if (!str_ends_with($testDb, $suffix)) throw new RuntimeException('Unsafe test database name.');

$server = new PDO(
    "mysql:host={$creds['host']};port=" . ($creds['port'] ?? 3306) . ';charset=utf8mb4',
    $creds['user'], $creds['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

if ($mode === 'drop') {
    if ($confirm !== 'DROP-CODEX-DISPOSABLE-TEST') {
        throw new RuntimeException('Refusing to drop. Supply the exact confirmation phrase.');
    }
    $server->exec("DROP DATABASE IF EXISTS `$testDb`");
    @unlink(dirname(__DIR__) . '/config.test.local.php');
    fwrite(STDOUT, "Removed disposable database: $testDb\n");
    exit(0);
}
if ($mode !== 'create') throw new RuntimeException('Choose create or drop.');

$server->exec("DROP DATABASE IF EXISTS `$testDb`");
$server->exec("CREATE DATABASE `$testDb` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo = new PDO(
    "mysql:host={$creds['host']};port=" . ($creds['port'] ?? 3306) . ";dbname=$testDb;charset=utf8mb4",
    $creds['user'], $creds['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

require_once dirname(__DIR__) . '/lib/helpers.php';
require_once dirname(__DIR__) . '/lib/schema.php';
require_once dirname(__DIR__) . '/lib/seed.php';
require_once dirname(__DIR__) . '/lib/calendar.php';
aslhub_ensure_schema($pdo, true);
$seed = aslhub_seed_content($pdo);
if (empty($seed['success'])) throw new RuntimeException('Rubric seed failed: ' . ($seed['error'] ?? 'unknown'));
aslhub_seed_teachers($pdo);
aslhub_set_setting($pdo, 'participation_max', '10');

// A completed school year provides a useful full-history chart regardless of
// when the fixture is viewed. Weekends and common breaks are explicitly present.
$start = new DateTimeImmutable('2025-08-25');
$end = new DateTimeImmutable('2026-06-05');
$closed = [
    '2025-09-01', '2025-11-11', '2025-11-27', '2025-11-28',
    '2026-01-19', '2026-02-16', '2026-05-25',
];
$breaks = [
    ['2025-12-22', '2026-01-02', 'Winter break'],
    ['2026-04-06', '2026-04-10', 'Spring break'],
];
$days = [];
for ($date = $start; $date <= $end; $date = $date->modify('+1 day')) {
    $iso = $date->format('Y-m-d');
    $weekday = (int)$date->format('N') <= 5;
    $instructional = $weekday && !in_array($iso, $closed, true);
    $label = '';
    foreach ($breaks as [$from, $to, $name]) {
        if ($iso >= $from && $iso <= $to) { $instructional = false; $label = $name; break; }
    }
    if (!$instructional && $label === '' && in_array($iso, $closed, true)) $label = 'No school';
    $days[] = ['date' => $iso, 'instructional' => $instructional, 'label' => $label ?: null];
}
$calendar = ['success' => true, 'school_year' => '2025-2026', 'timezone' => 'America/Los_Angeles',
    'days' => $days, 'blocks' => aslhub_calendar_build_blocks(array_values(array_filter($days, fn($d) => $d['instructional'])))];
aslhub_calendar_apply($pdo, $calendar);

$teacherId = (int)$pdo->query("SELECT id FROM users WHERE is_teacher=TRUE AND teacher='harms' LIMIT 1")->fetchColumn();
$students = [
    ['Codex', 'Steady', 'codex-test-steady@example.invalid', 1],
    ['Codex', 'Recovering', 'codex-test-recovering@example.invalid', 1],
    ['Codex', 'Challenge', 'codex-test-challenge@example.invalid', 1],
];
$studentIds = [];
foreach ($students as [$first,$last,$email,$level]) {
    $stmt=$pdo->prepare('SELECT id FROM users WHERE email=? LIMIT 1'); $stmt->execute([$email]);
    $existingId=(int)$stmt->fetchColumn();
    if (!$existingId) {
        $pdo->prepare("INSERT INTO users (first_name,last_name,email,password,is_teacher,teacher,class_period,level,is_active)
            VALUES (?,?,?,?,FALSE,'harms',1,?,1)")
            ->execute([$first,$last,$email,password_hash('CodexTestOnly!',PASSWORD_DEFAULT),$level]);
        $existingId=(int)$pdo->lastInsertId();
    }
    $studentIds[]=$existingId;
}
$targets = array_map('intval', $pdo->query("SELECT id FROM asl_learning_targets WHERE active=1 AND asl_level=1 ORDER BY id LIMIT 45")->fetchAll(PDO::FETCH_COLUMN));
$blocks = $pdo->query('SELECT * FROM asl_reporting_blocks WHERE active=1 ORDER BY block_index')->fetchAll();
$pdo->beginTransaction();
try {
    foreach ($studentIds as $studentOffset => $studentId) {
        $latest = [];
        foreach ($blocks as $bi => $block) {
            $newTargets = min(count($targets), 2 + $bi * 2);
            for ($ti=0; $ti<$newTargets; $ti++) {
                $targetId = $targets[$ti];
                $score = min(4, max(0, 1 + intdiv($bi + $ti + (2-$studentOffset), 5)));
                $latest[$targetId] = $score;
                $at = $block['end_date'] . sprintf(' 14:%02d:00', ($ti * 7) % 60);
                $pdo->prepare('INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at,scored_by) VALUES (?,?,?,?,?)')
                    ->execute([$studentId,$targetId,$score,$at,$teacherId]);
            }
        }
        foreach ($latest as $targetId=>$score) {
            $pdo->prepare('INSERT INTO user_learning_targets (user_id,learning_target_id,score,completed_at) VALUES (?,?,?,NOW())
                ON DUPLICATE KEY UPDATE score=VALUES(score),completed_at=VALUES(completed_at)')->execute([$studentId,$targetId,$score]);
        }
        foreach ($blocks as $bi=>$block) {
            $absencePatterns = [[0,0,0,1,0,0,0,1],[0,1,2,1,0,0,0,0],[1,1,2,2,1,0,2,1]];
            $participationPatterns = [[10,10,10,9,9,10,10,10],[10,10,10,6,6,6,6,9],[8,7,9,5,5,5,5,7]];
            $abs = $absencePatterns[$studentOffset][$bi % 8];
            $points = $participationPatterns[$studentOffset][$bi % 8];
            $pdo->prepare('INSERT INTO asl_student_block_metrics
                (user_id,block_id,absences,participation_points,participation_max,version,updated_by)
                VALUES (?,?,?,?,10,1,?) ON DUPLICATE KEY UPDATE absences=VALUES(absences),participation_points=VALUES(participation_points),participation_max=10')
                ->execute([$studentId,$block['id'],$abs,$points,$teacherId]);
        }
    }
    $pdo->commit();
} catch (Throwable $e) { $pdo->rollBack(); throw $e; }

$testConfig = $creds;
$testConfig['dbname'] = $testDb;
file_put_contents(dirname(__DIR__) . '/config.test.local.php', "<?php\nreturn " . var_export($testConfig, true) . ";\n");
fwrite(STDOUT, "Created isolated disposable database: $testDb\nFake students use @example.invalid addresses.\n");
