<?php
/**
 * Backup helpers: full-workbook xlsx export and plain-SQL dump.
 * Both are used by the manual buttons AND automatically before any wipe.
 */
require_once __DIR__ . '/xlsx.php';

const ASLHUB_BACKUP_TABLES = [
    'users', 'asl_settings', 'asl_skill_buckets', 'asl_standards',
    'asl_learning_targets', 'asl_rubric_levels', 'asl_learning_target_resources',
    'user_learning_targets', 'user_learning_target_score_history', 'asl_student_meetings',
];

function aslhub_backup_dir(): string {
    $dir = dirname(__DIR__) . '/backups';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
        file_put_contents($dir . '/.htaccess', "Require all denied\n"); // never web-servable
        file_put_contents($dir . '/index.php', '<?php http_response_code(403);');
    }
    return $dir;
}

/** Build the export workbook sheets (also the import format). */
function aslhub_export_sheets(PDO $pdo): array {
    $emailById = [];
    foreach ($pdo->query("SELECT id, email FROM users") as $r) $emailById[(int)$r['id']] = $r['email'];
    $codeByTarget = [];
    foreach ($pdo->query("SELECT id, target_code FROM asl_learning_targets") as $r) $codeByTarget[(int)$r['id']] = $r['target_code'];

    $students = [['first_name', 'last_name', 'email', 'teacher', 'class_period', 'level', 'is_active', 'password_hash', 'created_at']];
    foreach ($pdo->query("SELECT * FROM users WHERE is_teacher = FALSE ORDER BY last_name, first_name") as $u) {
        $students[] = [$u['first_name'], $u['last_name'], $u['email'], $u['teacher'], $u['class_period'],
            $u['level'], $u['is_active'], $u['password'], $u['created_at']];
    }

    $scores = [['student_email', 'target_code', 'score', 'completed_at']];
    foreach ($pdo->query("SELECT * FROM user_learning_targets WHERE score IS NOT NULL") as $r) {
        $email = $emailById[(int)$r['user_id']] ?? null;
        $code = $codeByTarget[(int)$r['learning_target_id']] ?? null;
        if ($email && $code) $scores[] = [$email, $code, $r['score'], $r['completed_at']];
    }

    $history = [['student_email', 'target_code', 'score', 'scored_at']];
    foreach ($pdo->query("SELECT * FROM user_learning_target_score_history ORDER BY scored_at, id") as $r) {
        $email = $emailById[(int)$r['user_id']] ?? null;
        $code = $codeByTarget[(int)$r['learning_target_id']] ?? null;
        if ($email && $code) $history[] = [$email, $code, $r['score'], $r['scored_at']];
    }

    $weekly = [['student_email', 'week', 'absences', 'participation_points', 'participation_pct', 'notes']];
    foreach ($pdo->query("SELECT * FROM asl_student_meetings ORDER BY meeting_date") as $r) {
        $email = $emailById[(int)$r['user_id']] ?? null;
        if ($email) $weekly[] = [$email, $r['meeting_date'], $r['absences'], $r['participation_points'], $r['participation_pct'], $r['notes']];
    }

    $resources = [['standard_id', 'asl_level', 'resource_type', 'resource_label', 'resource_url', 'resource_description']];
    foreach ($pdo->query("SELECT * FROM asl_learning_target_resources ORDER BY standard_id, order_index") as $r) {
        $resources[] = [$r['standard_id'], $r['asl_level'], $r['resource_type'], $r['resource_label'], $r['resource_url'], $r['resource_description']];
    }

    $settings = [['setting_key', 'setting_value']];
    foreach ($pdo->query("SELECT * FROM asl_settings ORDER BY setting_key") as $r) {
        $settings[] = [$r['setting_key'], $r['setting_value']];
    }

    $taxonomy = [['bucket', 'standard_id', 'standard_name', 'target_code', 'asl_level', 'statement']];
    foreach ($pdo->query("SELECT t.target_code, t.asl_level, t.title, s.standard_id, s.name AS sname, b.name AS bname
            FROM asl_learning_targets t
            JOIN asl_standards s ON s.standard_id = t.standard_id
            JOIN asl_skill_buckets b ON b.bucket_id = s.bucket_id
            WHERE t.active = 1 ORDER BY b.order_index, s.order_index, t.asl_level, t.order_index") as $r) {
        $taxonomy[] = [$r['bname'], $r['standard_id'], $r['sname'], $r['target_code'], $r['asl_level'], $r['title']];
    }

    return [
        'Students' => $students,
        'Scores' => $scores,
        'ScoreHistory' => $history,
        'WeeklyLog' => $weekly,
        'Resources' => $resources,
        'Settings' => $settings,
        'Taxonomy (reference)' => $taxonomy,
    ];
}

/** Write a timestamped xlsx backup into asl/backups/. Returns the path. */
function aslhub_backup_xlsx(PDO $pdo): string {
    $path = aslhub_backup_dir() . '/asl_backup_' . date('Y-m-d_His') . '.xlsx';
    if (!aslhub_xlsx_write($path, aslhub_export_sheets($pdo))) {
        throw new RuntimeException('Could not write xlsx backup.');
    }
    return $path;
}

/** Plain-SQL dump (schema + data) of every ASL table. Returns the path. */
function aslhub_backup_sql(PDO $pdo): string {
    $path = aslhub_backup_dir() . '/asl_backup_' . date('Y-m-d_His') . '.sql';
    $fh = fopen($path, 'w');
    fwrite($fh, "-- ASL Hub SQL backup " . date('c') . "\nSET FOREIGN_KEY_CHECKS=0;\n\n");
    foreach (ASLHUB_BACKUP_TABLES as $table) {
        try {
            $create = $pdo->query("SHOW CREATE TABLE `$table`")->fetch();
        } catch (PDOException $e) {
            continue; // table doesn't exist on this install
        }
        fwrite($fh, "DROP TABLE IF EXISTS `$table`;\n" . $create['Create Table'] . ";\n\n");
        $stmt = $pdo->query("SELECT * FROM `$table`");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $cols = '`' . implode('`,`', array_keys($row)) . '`';
            $vals = implode(',', array_map(function ($v) use ($pdo) {
                return $v === null ? 'NULL' : $pdo->quote((string)$v);
            }, array_values($row)));
            fwrite($fh, "INSERT INTO `$table` ($cols) VALUES ($vals);\n");
        }
        fwrite($fh, "\n");
    }
    fwrite($fh, "SET FOREIGN_KEY_CHECKS=1;\n");
    fclose($fh);
    return $path;
}

/** Keep the newest 40 backup files, remove older ones. */
function aslhub_backup_prune(): void {
    $files = glob(aslhub_backup_dir() . '/asl_backup_*');
    if (count($files) <= 40) return;
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    foreach (array_slice($files, 40) as $old) @unlink($old);
}
