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

$me = aslhub_require_teacher($pdo, true);
if (!aslhub_is_admin($me)) aslhub_json_error('Admin (Harms) access required.', 403);
aslhub_require_csrf();

$mode = $_POST['mode'] ?? 'dryrun';

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
                $notes = ($r['notes'] ?? '') !== '' ? (string)$r['notes'] : null;
                // blanks never overwrite: COALESCE on update
                $pdo->prepare("INSERT INTO asl_student_meetings (user_id, meeting_date, absences, participation_points, notes)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        absences = COALESCE(VALUES(absences), absences),
                        participation_points = COALESCE(VALUES(participation_points), participation_points),
                        notes = COALESCE(VALUES(notes), notes)")
                    ->execute([$uid, $week, $abs ?? 0, $pts, $notes]);
            }
            $set++;
        }
        $summary['WeeklyLog'] = "set $set, skip $skipped";

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
                if (!$stmt->fetch()) {
                    $pdo->prepare("INSERT INTO asl_learning_target_resources
                        (learning_target_id, standard_id, asl_level, resource_type, resource_label, resource_url, resource_description)
                        VALUES (NULL, ?, ?, ?, ?, ?, ?)")
                        ->execute([$std, ($r['asl_level'] ?? '') !== '' ? (int)$r['asl_level'] : null,
                            $r['resource_type'] ?: 'link', $label, $r['resource_url'] ?: null, $r['resource_description'] ?: null]);
                    $added++;
                }
            } else { $added++; }
        }
        $summary['Resources'] = "add up to $added (existing kept), skip $skipped";

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
