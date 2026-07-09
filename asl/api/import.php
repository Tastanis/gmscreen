<?php
/**
 * Admin-only Excel import (restore). Two-step:
 *   1. mode=dryrun  — upload the workbook, get a preview of every change. Nothing writes.
 *   2. mode=commit  — applies the previewed file (referenced by token).
 * Import only ADDS and UPDATES — it never deletes rows that aren't in the file.
 * A blank cell never overwrites existing data.
 */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/backup.php';
require_once dirname(__DIR__) . '/lib/scroller.php';

$me = aslhub_require_teacher($pdo, true);
if (!aslhub_is_admin($me)) aslhub_json_error('Admin (Harms) access required.', 403);
aslhub_require_csrf();

$mode = $_POST['mode'] ?? 'dryrun';
aslhub_backup_prune();
aslhub_scroller_ensure_schema($pdo);

if ($mode === 'dryrun') {
    if (empty($_FILES['workbook']['tmp_name'])) aslhub_json_error('Upload a .xlsx file exported from ASL Hub.');
    $token = bin2hex(random_bytes(16));
    $stored = aslhub_backup_dir() . "/import_$token.xlsx";
    if (!move_uploaded_file($_FILES['workbook']['tmp_name'], $stored)) aslhub_json_error('Could not read the upload.');
    $result = aslhub_import_run($pdo, $stored, false);
    $result['token'] = $token;
    aslhub_json($result);
}

if ($mode === 'commit') {
    $token = preg_replace('/[^a-f0-9]/', '', $_POST['token'] ?? '');
    $stored = aslhub_backup_dir() . "/import_$token.xlsx";
    if (!$token || !file_exists($stored)) aslhub_json_error('Import session expired — run the preview again.');
    // Safety: automatic backup before any import writes
    aslhub_backup_sql($pdo);
    aslhub_backup_xlsx($pdo);
    $result = aslhub_import_run($pdo, $stored, true);
    @unlink($stored);
    aslhub_json($result);
}

aslhub_json_error('Unknown mode.');

/* ---------------------------------------------------------------- */

function aslhub_import_run(PDO $pdo, string $path, bool $commit): array {
    try {
        $book = aslhub_xlsx_read($path);
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }

    $summary = [];
    $warnings = [];

    $targetByCode = [];
    foreach ($pdo->query("SELECT id, target_code FROM asl_learning_targets WHERE target_code IS NOT NULL") as $r) {
        $targetByCode[$r['target_code']] = (int)$r['id'];
    }
    $userByEmail = [];
    foreach ($pdo->query("SELECT id, email FROM users WHERE email IS NOT NULL") as $r) {
        $userByEmail[mb_strtolower($r['email'])] = (int)$r['id'];
    }

    if ($commit) $pdo->beginTransaction();
    try {
        // ---- Students ----
        $rows = aslhub_sheet_assoc($book['Students'] ?? []);
        $created = 0; $updated = 0; $skipped = 0;
        foreach ($rows as $r) {
            $email = mb_strtolower(trim($r['email'] ?? ''));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { $skipped++; $warnings[] = "Students: bad email '" . ($r['email'] ?? '') . "' — skipped"; continue; }
            $vals = [
                'first_name' => trim($r['first_name'] ?? ''),
                'last_name' => trim($r['last_name'] ?? ''),
                'teacher' => in_array($r['teacher'] ?? '', array_keys(aslhub_valid_teachers()), true) ? $r['teacher'] : null,
                'class_period' => ($r['class_period'] ?? '') !== '' ? (int)$r['class_period'] : null,
                'level' => ($r['level'] ?? '') !== '' ? (int)$r['level'] : null,
                'is_active' => ($r['is_active'] ?? '') !== '' ? (int)(bool)$r['is_active'] : 1,
            ];
            if (isset($userByEmail[$email])) {
                $uid = $userByEmail[$email];
                if ($commit) {
                    // COALESCE-style: blanks never overwrite
                    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
                    $stmt->execute([$uid]);
                    $cur = $stmt->fetch();
                    $pdo->prepare("UPDATE users SET first_name=?, last_name=?, teacher=?, class_period=?, level=?, is_active=? WHERE id=?")
                        ->execute([
                            $vals['first_name'] !== '' ? $vals['first_name'] : $cur['first_name'],
                            $vals['last_name'] !== '' ? $vals['last_name'] : $cur['last_name'],
                            $vals['teacher'] ?? $cur['teacher'],
                            $vals['class_period'] ?? $cur['class_period'],
                            $vals['level'] ?? $cur['level'],
                            $vals['is_active'],
                            $uid,
                        ]);
                }
                $updated++;
            } else {
                if ($vals['first_name'] === '' || $vals['last_name'] === '') { $skipped++; $warnings[] = "Students: $email missing name — skipped"; continue; }
                $hash = trim($r['password_hash'] ?? '');
                if ($hash === '') {
                    $hash = password_hash('changeme' . random_int(1000, 9999), PASSWORD_DEFAULT);
                    $warnings[] = "Students: $email had no password in the file — account created but they need a teacher password reset";
                }
                if ($commit) {
                    $pdo->prepare("INSERT INTO users (first_name, last_name, email, password, is_teacher, teacher, class_period, level, is_active)
                        VALUES (?, ?, ?, ?, FALSE, ?, ?, ?, ?)")
                        ->execute([$vals['first_name'], $vals['last_name'], $email, $hash,
                            $vals['teacher'], $vals['class_period'], $vals['level'], $vals['is_active']]);
                    $userByEmail[$email] = (int)$pdo->lastInsertId();
                } else {
                    $userByEmail[$email] = -1; // placeholder so later sheets count as matchable
                }
                $created++;
            }
        }
        $summary['Students'] = "create $created, update $updated, skip $skipped";

        // ---- ScoreHistory (before Scores so replays rebuild cleanly) ----
        $rows = aslhub_sheet_assoc($book['ScoreHistory'] ?? []);
        $added = 0; $skipped = 0;
        foreach ($rows as $r) {
            $uid = $userByEmail[mb_strtolower(trim($r['student_email'] ?? ''))] ?? null;
            $tid = $targetByCode[trim($r['target_code'] ?? '')] ?? null;
            $score = ($r['score'] ?? '') !== '' ? (int)$r['score'] : null;
            $at = trim($r['scored_at'] ?? '');
            if (!$uid || !$tid || $score === null || $at === '') { $skipped++; continue; }
            if ($commit && $uid > 0) {
                $stmt = $pdo->prepare("SELECT id FROM user_learning_target_score_history
                    WHERE user_id=? AND learning_target_id=? AND score=? AND scored_at=?");
                $stmt->execute([$uid, $tid, $score, $at]);
                if (!$stmt->fetch()) {
                    $pdo->prepare("INSERT INTO user_learning_target_score_history (user_id, learning_target_id, score, scored_at)
                        VALUES (?, ?, ?, ?)")->execute([$uid, $tid, $score, $at]);
                    $added++;
                }
            } else { $added++; }
        }
        $summary['ScoreHistory'] = "add up to $added (duplicates auto-skipped), skip $skipped";

        // ---- Scores ----
        $rows = aslhub_sheet_assoc($book['Scores'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $uid = $userByEmail[mb_strtolower(trim($r['student_email'] ?? ''))] ?? null;
            $tid = $targetByCode[trim($r['target_code'] ?? '')] ?? null;
            $score = ($r['score'] ?? '') !== '' ? (int)$r['score'] : null;
            if (!$uid || !$tid || $score === null || $score < 0 || $score > 4) {
                $skipped++;
                if (($r['target_code'] ?? '') && !$tid) $warnings[] = "Scores: unknown target_code '{$r['target_code']}'";
                continue;
            }
            if ($commit && $uid > 0) {
                $pdo->prepare("INSERT INTO user_learning_targets (user_id, learning_target_id, score, completed_at)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE score = VALUES(score)")
                    ->execute([$uid, $tid, $score, ($r['completed_at'] ?? '') !== '' ? $r['completed_at'] : date('Y-m-d H:i:s')]);
            }
            $set++;
        }
        $summary['Scores'] = "set $set, skip $skipped";

        // ---- WeeklyLog ----
        $rows = aslhub_sheet_assoc($book['WeeklyLog'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $uid = $userByEmail[mb_strtolower(trim($r['student_email'] ?? ''))] ?? null;
            $week = trim($r['week'] ?? '');
            if (!$uid || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $week)) { $skipped++; continue; }
            if ($commit && $uid > 0) {
                $abs = ($r['absences'] ?? '') !== '' ? (int)$r['absences'] : null;
                $pts = ($r['participation_points'] ?? '') !== '' ? (int)$r['participation_points'] : null;
                $pct = ($r['participation_pct'] ?? '') !== '' ? (float)$r['participation_pct'] : null;
                $notes = ($r['notes'] ?? '') !== '' ? (string)$r['notes'] : null;
                // blanks never overwrite: COALESCE on update
                $pdo->prepare("INSERT INTO asl_student_meetings (user_id, meeting_date, absences, participation_points, participation_pct, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        absences = COALESCE(VALUES(absences), absences),
                        participation_points = COALESCE(VALUES(participation_points), participation_points),
                        participation_pct = COALESCE(VALUES(participation_pct), participation_pct),
                        notes = COALESCE(VALUES(notes), notes)")
                    ->execute([$uid, $week, $abs ?? 0, $pts, $pct, $notes]);
            }
            $set++;
        }
        $summary['WeeklyLog'] = "set $set, skip $skipped";

        // ---- Settings (non-secret application settings only) ----
        $allowedSettings = [
            'year_start', 'year_end', 'pace_green_goal', 'pace_blue_goal', 'pace_red_goal',
            'signup_code', 'participation_max', 'calendar_revision', 'school_timezone',
        ];
        $rows = aslhub_sheet_assoc($book['Settings'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $key = trim((string)($r['setting_key'] ?? ''));
            $value = (string)($r['setting_value'] ?? '');
            if (!in_array($key, $allowedSettings, true) || $value === '') { $skipped++; continue; }
            if ($commit) aslhub_set_setting($pdo, $key, $value);
            $set++;
        }
        $summary['Settings'] = "set $set, skip $skipped";

        // ---- Rubric descriptors ----
        $rows = aslhub_sheet_assoc($book['Rubrics'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $tid = $targetByCode[trim((string)($r['target_code'] ?? ''))] ?? null;
            $score = ($r['score'] ?? '') !== '' ? (int)$r['score'] : -1;
            $descriptor = trim((string)($r['descriptor'] ?? ''));
            if (!$tid || $score < 0 || $score > 4 || $descriptor === '') { $skipped++; continue; }
            if ($commit) {
                $pdo->prepare("INSERT INTO asl_rubric_levels (learning_target_id,score,descriptor) VALUES (?,?,?)
                    ON DUPLICATE KEY UPDATE descriptor=VALUES(descriptor)")->execute([$tid,$score,$descriptor]);
            }
            $set++;
        }
        $summary['Rubrics'] = "set $set, skip $skipped";

        // ---- Uploaded school calendar ----
        $rows = aslhub_sheet_assoc($book['Calendar'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $date = trim((string)($r['date'] ?? ''));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || ($r['instructional'] ?? '') === '') { $skipped++; continue; }
            $instructional = (int)(bool)$r['instructional'];
            $label = trim((string)($r['label'] ?? '')) ?: null;
            $revision = max(1, (int)($r['calendar_revision'] ?? 1));
            if ($commit) {
                $pdo->prepare("INSERT INTO asl_calendar_days (school_date,is_instructional,label,calendar_revision)
                    VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE is_instructional=VALUES(is_instructional),
                    label=COALESCE(VALUES(label),label),calendar_revision=GREATEST(calendar_revision,VALUES(calendar_revision))")
                    ->execute([$date,$instructional,$label,$revision]);
            }
            $set++;
        }
        $summary['Calendar'] = "set $set, skip $skipped";

        // ---- Ten-instructional-day reporting blocks ----
        $rows = aslhub_sheet_assoc($book['ReportingBlocks'] ?? []);
        $set = 0; $skipped = 0;
        $previewBlockIndexes = [];
        foreach ($rows as $r) {
            $index = (int)($r['block_index'] ?? 0);
            $start = trim((string)($r['start_date'] ?? ''));
            $end = trim((string)($r['end_date'] ?? ''));
            if ($index < 1 || !preg_match('/^\d{4}-\d{2}-\d{2}$/',$start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/',$end)) { $skipped++; continue; }
            $label = trim((string)($r['label'] ?? '')) ?: ('Block '.$index);
            $days = max(1,min(10,(int)($r['instructional_days'] ?? 10)));
            $max = max(1,(int)($r['participation_max'] ?? 10));
            $active = ($r['active'] ?? '') === '' ? 1 : (int)(bool)$r['active'];
            $finalized = trim((string)($r['finalized_at'] ?? '')) ?: null;
            $revision = max(1,(int)($r['calendar_revision'] ?? 1));
            if ($commit) {
                $pdo->prepare("INSERT INTO asl_reporting_blocks
                    (block_index,label,start_date,end_date,instructional_days,participation_max,active,finalized_at,calendar_revision)
                    VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
                    label=VALUES(label), start_date=IF(finalized_at IS NULL,VALUES(start_date),start_date),
                    end_date=IF(finalized_at IS NULL,VALUES(end_date),end_date),
                    instructional_days=IF(finalized_at IS NULL,VALUES(instructional_days),instructional_days),
                    participation_max=IF(finalized_at IS NULL,VALUES(participation_max),participation_max),
                    active=VALUES(active), finalized_at=COALESCE(finalized_at,VALUES(finalized_at)),
                    calendar_revision=GREATEST(calendar_revision,VALUES(calendar_revision))")
                    ->execute([$index,$label,$start,$end,$days,$max,$active,$finalized,$revision]);
            } else $previewBlockIndexes[$index] = true;
            $set++;
        }
        $summary['ReportingBlocks'] = "set $set, skip $skipped";

        $blockByIndex = [];
        foreach ($pdo->query('SELECT id,block_index FROM asl_reporting_blocks') as $r) $blockByIndex[(int)$r['block_index']] = (int)$r['id'];
        if (!$commit) foreach (array_keys($previewBlockIndexes) as $index) $blockByIndex[$index] ??= -$index;

        // ---- Attendance and participation block values ----
        $rows = aslhub_sheet_assoc($book['BlockMetrics'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $uid = $userByEmail[mb_strtolower(trim((string)($r['student_email'] ?? '')))] ?? null;
            $bid = $blockByIndex[(int)($r['block_index'] ?? 0)] ?? null;
            if (!$uid || !$bid) { $skipped++; continue; }
            $abs = ($r['absences'] ?? '') !== '' ? max(0,(int)$r['absences']) : null;
            $pts = ($r['participation_points'] ?? '') !== '' ? max(0,(int)$r['participation_points']) : null;
            $max = max(1,(int)($r['participation_max'] ?? 10));
            $version = max(1,(int)($r['version'] ?? 1));
            $by = $userByEmail[mb_strtolower(trim((string)($r['updated_by_email'] ?? '')))] ?? null;
            if ($commit && $uid > 0) {
                $pdo->prepare("INSERT INTO asl_student_block_metrics
                    (user_id,block_id,absences,participation_points,participation_max,version,updated_by)
                    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
                    absences=COALESCE(VALUES(absences),absences), participation_points=COALESCE(VALUES(participation_points),participation_points),
                    participation_max=VALUES(participation_max), version=GREATEST(version,VALUES(version)),
                    updated_by=COALESCE(VALUES(updated_by),updated_by)")
                    ->execute([$uid,$bid,$abs,$pts,$max,$version,$by]);
            }
            $set++;
        }
        $summary['BlockMetrics'] = "set $set, skip $skipped";

        // ---- Scroller word banks ----
        $rows = aslhub_sheet_assoc($book['ScrollerWordlists'] ?? []);
        $set = 0; $skipped = 0;
        foreach ($rows as $r) {
            $teacherKey = trim((string)($r['teacher'] ?? ''));
            $name = trim((string)($r['name'] ?? ''));
            $words = json_decode((string)($r['words_json'] ?? ''), true);
            $levels = array_values(array_intersect([1,2,3], array_map('intval', preg_split('/\s*,\s*/',(string)($r['levels'] ?? ''),-1,PREG_SPLIT_NO_EMPTY) ?: [])));
            if ($teacherKey === '' || $name === '' || !is_array($words) || !$levels) { $skipped++; continue; }
            $ownerStmt = $pdo->prepare('SELECT id FROM users WHERE is_teacher=TRUE AND teacher=? LIMIT 1');
            $ownerStmt->execute([$teacherKey]); $owner = (int)$ownerStmt->fetchColumn();
            if (!$owner) { $skipped++; $warnings[] = "ScrollerWordlists: teacher '$teacherKey' not found for '$name'"; continue; }
            if ($commit) {
                $find = $pdo->prepare('SELECT id FROM asl_scroller_wordlists WHERE teacher_id=? AND name=? LIMIT 1');
                $find->execute([$owner,$name]); $wid = (int)$find->fetchColumn();
                $payload = json_encode(array_values($words),JSON_UNESCAPED_UNICODE);
                $speed = max(.5,min(2.0,(float)($r['speed'] ?? 1)));
                $count = max(5,min(50,(int)($r['word_count'] ?? 10)));
                $enabled = (int)(bool)($r['enabled'] ?? 1); $active = (int)(bool)($r['active'] ?? 1);
                if ($wid) {
                    $pdo->prepare('UPDATE asl_scroller_wordlists SET words=?,speed_setting=?,word_count=?,enabled=?,active=? WHERE id=?')
                        ->execute([$payload,$speed,$count,$enabled,$active,$wid]);
                } else {
                    $pdo->prepare('INSERT INTO asl_scroller_wordlists (teacher_id,name,words,speed_setting,word_count,enabled,active,legacy_id) VALUES (?,?,?,?,?,?,?,?)')
                        ->execute([$owner,$name,$payload,$speed,$count,$enabled,$active,($r['legacy_id'] ?? '') !== '' ? (int)$r['legacy_id'] : null]);
                    $wid = (int)$pdo->lastInsertId();
                }
                $pdo->prepare('DELETE FROM asl_scroller_wordlist_levels WHERE wordlist_id=?')->execute([$wid]);
                $addLevel = $pdo->prepare('INSERT INTO asl_scroller_wordlist_levels (wordlist_id,asl_level) VALUES (?,?)');
                foreach ($levels as $level) $addLevel->execute([$wid,$level]);
            }
            $set++;
        }
        $summary['ScrollerWordlists'] = "set $set, skip $skipped";

        // ---- Resources ----
        $rows = aslhub_sheet_assoc($book['Resources'] ?? []);
        $added = 0; $skipped = 0;
        foreach ($rows as $r) {
            $std = trim($r['standard_id'] ?? '');
            $label = trim($r['resource_label'] ?? '');
            if ($std === '' || $label === '') { $skipped++; continue; }
            if ($commit) {
                $stmt = $pdo->prepare("SELECT id FROM asl_learning_target_resources WHERE standard_id = ? AND resource_label = ?");
                $stmt->execute([$std, $label]);
                $existingResource = $stmt->fetch();
                if (!$existingResource) {
                    $pdo->prepare("INSERT INTO asl_learning_target_resources
                        (learning_target_id, standard_id, asl_level, resource_type, resource_label, resource_url, resource_description)
                        VALUES (NULL, ?, ?, ?, ?, ?, ?)")
                        ->execute([$std, ($r['asl_level'] ?? '') !== '' ? (int)$r['asl_level'] : null,
                            $r['resource_type'] ?: 'link', $label, $r['resource_url'] ?: null, $r['resource_description'] ?: null]);
                    $added++;
                } else {
                    $pdo->prepare("UPDATE asl_learning_target_resources SET
                        asl_level=COALESCE(?,asl_level), resource_type=COALESCE(NULLIF(?,''),resource_type),
                        resource_url=COALESCE(NULLIF(?,''),resource_url),
                        resource_description=COALESCE(NULLIF(?,''),resource_description) WHERE id=?")
                        ->execute([($r['asl_level'] ?? '') !== '' ? (int)$r['asl_level'] : null,
                            (string)($r['resource_type'] ?? ''), (string)($r['resource_url'] ?? ''),
                            (string)($r['resource_description'] ?? ''), (int)$existingResource['id']]);
                    $added++;
                }
            } else { $added++; }
        }
        $summary['Resources'] = "add/update $added, skip $skipped";

        if ($commit) $pdo->commit();
    } catch (Exception $e) {
        if ($commit && $pdo->inTransaction()) $pdo->rollBack();
        return ['success' => false, 'error' => 'Import failed, nothing was changed: ' . $e->getMessage()];
    }

    return [
        'success' => true,
        'committed' => $commit,
        'summary' => $summary,
        'warnings' => array_slice($warnings, 0, 40),
    ];
}
