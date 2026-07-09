<?php
/**
 * Teacher-only student management: edit fields, reset password,
 * deactivate/reactivate, hard delete (typed confirmation).
 */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/backup.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();

$studentId = (int)($_POST['student_id'] ?? 0);
$action = $_POST['action'] ?? '';
$student = aslhub_require_student_scope($pdo, $teacher, $studentId);

try {
    switch ($action) {
        case 'update_fields':
            $first = trim($_POST['first_name'] ?? $student['first_name']);
            $last = trim($_POST['last_name'] ?? $student['last_name']);
            $email = mb_strtolower(trim($_POST['email'] ?? $student['email']));
            $period = (int)($_POST['class_period'] ?? $student['class_period']);
            $level = (int)($_POST['level'] ?? $student['level']);
            $newTeacher = $_POST['teacher'] ?? $student['teacher'];

            if ($first === '' || $last === '') aslhub_json_error('Name cannot be blank.');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) aslhub_json_error('Invalid email.');
            if ($period < 1 || $period > 6) aslhub_json_error('Period must be 1-6.');
            if ($level < 1 || $level > 3) aslhub_json_error('Level must be 1-3.');
            if (!array_key_exists($newTeacher, aslhub_valid_teachers())) aslhub_json_error('Unknown teacher.');

            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id <> ?");
            $stmt->execute([$email, $studentId]);
            if ($stmt->fetch()) aslhub_json_error('Another account already uses that email.');

            $pdo->prepare("UPDATE users SET first_name = ?, last_name = ?, email = ?, class_period = ?, level = ?, teacher = ? WHERE id = ?")
                ->execute([$first, $last, $email, $period, $level, $newTeacher, $studentId]);
            aslhub_json(['success' => true]);

        case 'reset_password':
            $new = (string)($_POST['new_password'] ?? '');
            if (strlen($new) < 6) aslhub_json_error('Password must be at least 6 characters.');
            $pdo->prepare("UPDATE users SET password = ? WHERE id = ?")
                ->execute([password_hash($new, PASSWORD_DEFAULT), $studentId]);
            aslhub_json(['success' => true]);

        case 'deactivate':
            $pdo->prepare("UPDATE users SET is_active = 0 WHERE id = ?")->execute([$studentId]);
            aslhub_json(['success' => true]);

        case 'reactivate':
            $pdo->prepare("UPDATE users SET is_active = 1 WHERE id = ?")->execute([$studentId]);
            aslhub_json(['success' => true]);

        case 'hard_delete':
            if (($_POST['confirm_text'] ?? '') !== 'DELETE') {
                aslhub_json_error('Type DELETE to confirm permanent removal.');
            }
            try {
                $sqlBackup = aslhub_backup_sql($pdo);
                $xlsxBackup = aslhub_backup_xlsx($pdo);
                aslhub_backup_prune();
            } catch (Throwable $backupError) {
                aslhub_json_error('Refusing to delete because the automatic safety backup failed.', 500);
            }
            $pdo->beginTransaction();
            $pdo->prepare("DELETE FROM asl_student_block_metric_audit WHERE user_id = ?")->execute([$studentId]);
            $pdo->prepare("DELETE FROM asl_student_block_metrics WHERE user_id = ?")->execute([$studentId]);
            $pdo->prepare("DELETE FROM user_learning_targets WHERE user_id = ?")->execute([$studentId]);
            $pdo->prepare("DELETE FROM user_learning_target_score_history WHERE user_id = ?")->execute([$studentId]);
            $pdo->prepare("DELETE FROM asl_student_meetings WHERE user_id = ?")->execute([$studentId]);
            $pdo->prepare("DELETE FROM users WHERE id = ? AND is_teacher = FALSE")->execute([$studentId]);
            $pdo->commit();
            aslhub_json(['success' => true, 'backups' => [basename($sqlBackup), basename($xlsxBackup)]]);

        default:
            aslhub_json_error('Unknown action.');
    }
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('student_update: ' . $e->getMessage());
    aslhub_json_error('Save failed. Try again.', 500);
}
