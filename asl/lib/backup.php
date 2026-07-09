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
    'asl_calendar_days', 'asl_reporting_blocks', 'asl_student_block_metrics',
    'asl_student_block_metric_audit', 'asl_scroller_wordlists', 'asl_scroller_wordlist_levels',
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

/** Collision-resistant filename stamp (multiple saves can happen in one second). */
function aslhub_backup_stamp(): string {
    $micros = sprintf('%06d', ((int)(microtime(true) * 1000000)) % 1000000);
    return date('Y-m-d_His') . '_' . $micros . '_' . bin2hex(random_bytes(3));
}

/**
 * Run a read under one repeatable-read snapshot so related sheets/tables cannot
 * be captured between two different grading saves.
 */
function aslhub_consistent_read(PDO $pdo, callable $reader) {
    if ($pdo->inTransaction()) return $reader();
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    try {
        $result = $reader();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function aslhub_backup_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $stmt->execute([$table]);
    return (bool)$stmt->fetchColumn();
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

    $rubrics = [['target_code', 'score', 'descriptor']];
    foreach ($pdo->query("SELECT t.target_code, r.score, r.descriptor
            FROM asl_rubric_levels r JOIN asl_learning_targets t ON t.id = r.learning_target_id
            ORDER BY t.target_code, r.score DESC") as $r) {
        $rubrics[] = [$r['target_code'], $r['score'], $r['descriptor']];
    }

    $calendar = [['date', 'instructional', 'label', 'calendar_revision']];
    $blocks = [['block_index', 'label', 'start_date', 'end_date', 'instructional_days', 'participation_max', 'active', 'finalized_at', 'calendar_revision']];
    $blockMetrics = [['student_email', 'block_index', 'absences', 'participation_points', 'participation_max', 'version', 'updated_by_email', 'updated_at']];
    $blockAudit = [['student_email', 'block_index', 'old_absences', 'new_absences', 'old_participation_points', 'new_participation_points', 'participation_max', 'old_version', 'new_version', 'changed_by_email', 'is_correction', 'changed_at']];
    if (aslhub_backup_table_exists($pdo, 'asl_calendar_days')) {
        foreach ($pdo->query('SELECT * FROM asl_calendar_days ORDER BY school_date') as $r) {
            $calendar[] = [$r['school_date'], $r['is_instructional'], $r['label'], $r['calendar_revision']];
        }
    }
    if (aslhub_backup_table_exists($pdo, 'asl_reporting_blocks')) {
        foreach ($pdo->query('SELECT * FROM asl_reporting_blocks ORDER BY block_index') as $r) {
            $blocks[] = [$r['block_index'], $r['label'], $r['start_date'], $r['end_date'], $r['instructional_days'],
                $r['participation_max'], $r['active'], $r['finalized_at'], $r['calendar_revision']];
        }
    }
    if (aslhub_backup_table_exists($pdo, 'asl_student_block_metrics')) {
        foreach ($pdo->query("SELECT m.*, b.block_index FROM asl_student_block_metrics m
                JOIN asl_reporting_blocks b ON b.id=m.block_id ORDER BY b.block_index,m.user_id") as $r) {
            $blockMetrics[] = [$emailById[(int)$r['user_id']] ?? '', $r['block_index'], $r['absences'],
                $r['participation_points'], $r['participation_max'], $r['version'],
                $emailById[(int)$r['updated_by']] ?? '', $r['updated_at']];
        }
    }
    if (aslhub_backup_table_exists($pdo, 'asl_student_block_metric_audit')) {
        foreach ($pdo->query("SELECT a.*, b.block_index FROM asl_student_block_metric_audit a
                JOIN asl_reporting_blocks b ON b.id=a.block_id ORDER BY a.changed_at,a.id") as $r) {
            $blockAudit[] = [$emailById[(int)$r['user_id']] ?? '', $r['block_index'], $r['old_absences'],
                $r['new_absences'], $r['old_participation_points'], $r['new_participation_points'],
                $r['participation_max'], $r['old_version'], $r['new_version'],
                $emailById[(int)$r['changed_by']] ?? '', $r['is_correction'], $r['changed_at']];
        }
    }

    $scroller = [['wordlist_id', 'teacher', 'name', 'words_json', 'speed', 'word_count', 'enabled', 'active', 'levels', 'legacy_id']];
    if (aslhub_backup_table_exists($pdo, 'asl_scroller_wordlists')) {
        $levelsByList = [];
        if (aslhub_backup_table_exists($pdo, 'asl_scroller_wordlist_levels')) {
            foreach ($pdo->query('SELECT wordlist_id,asl_level FROM asl_scroller_wordlist_levels ORDER BY wordlist_id,asl_level') as $r) {
                $levelsByList[(int)$r['wordlist_id']][] = (int)$r['asl_level'];
            }
        }
        foreach ($pdo->query("SELECT w.*,u.teacher FROM asl_scroller_wordlists w JOIN users u ON u.id=w.teacher_id ORDER BY w.id") as $r) {
            $scroller[] = [$r['id'], $r['teacher'], $r['name'], $r['words'], $r['speed_setting'], $r['word_count'],
                $r['enabled'], $r['active'], implode(',', $levelsByList[(int)$r['id']] ?? []), $r['legacy_id']];
        }
    }

    return [
        'Students' => $students,
        'Scores' => $scores,
        'ScoreHistory' => $history,
        'WeeklyLog' => $weekly,
        'Resources' => $resources,
        'Settings' => $settings,
        'Rubrics' => $rubrics,
        'Calendar' => $calendar,
        'ReportingBlocks' => $blocks,
        'BlockMetrics' => $blockMetrics,
        'BlockMetricAudit' => $blockAudit,
        'ScrollerWordlists' => $scroller,
        'Taxonomy (reference)' => $taxonomy,
    ];
}

/** Write a timestamped xlsx backup into asl/backups/. Returns the path. */
function aslhub_backup_xlsx(PDO $pdo): string {
    $path = aslhub_backup_dir() . '/asl_backup_' . aslhub_backup_stamp() . '.xlsx';
    $tmp = $path . '.tmp';
    $sheets = aslhub_consistent_read($pdo, fn() => aslhub_export_sheets($pdo));
    if (!aslhub_xlsx_write($tmp, $sheets) || !rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Could not write xlsx backup.');
    }
    return $path;
}

/** Plain-SQL dump (schema + data) of every ASL table. Returns the path. */
function aslhub_backup_sql(PDO $pdo): string {
    $path = aslhub_backup_dir() . '/asl_backup_' . aslhub_backup_stamp() . '.sql';
    $tmp = $path . '.tmp';
    aslhub_consistent_read($pdo, function () use ($pdo, $tmp): void {
        $fh = fopen($tmp, 'xb');
        if (!$fh) throw new RuntimeException('Could not create SQL backup.');
        try {
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
        } finally {
            fclose($fh);
        }
    });
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Could not finalize SQL backup.');
    }
    return $path;
}

/** Keep the newest 40 backup files, remove older ones. */
function aslhub_backup_prune(): void {
    $files = glob(aslhub_backup_dir() . '/asl_backup_*');
    if (count($files) <= 40) return;
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    foreach (array_slice($files, 40) as $old) @unlink($old);

    // Dry-run imports are private temporary files, not permanent backups.
    foreach (glob(aslhub_backup_dir() . '/import_*.xlsx') ?: [] as $upload) {
        if (filemtime($upload) < time() - 86400) @unlink($upload);
    }
}
