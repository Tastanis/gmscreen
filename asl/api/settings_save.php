<?php
/** Teacher settings: own password (any teacher); participation/signup/teacher passwords (admin only). */
require_once dirname(__DIR__) . '/config.php';

$me = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();
$action = $_POST['action'] ?? '';

try {
    switch ($action) {
        case 'change_own_password':
            $current = (string)($_POST['current_password'] ?? '');
            $new = (string)($_POST['new_password'] ?? '');
            if (!password_verify($current, $me['password']) && empty($me['must_change_password'])) {
                aslhub_json_error('Current password is incorrect.');
            }
            if (strlen($new) < 8) aslhub_json_error('Teacher passwords must be at least 8 characters.');
            $pdo->prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?")
                ->execute([password_hash($new, PASSWORD_DEFAULT), (int)$me['id']]);
            aslhub_json(['success' => true]);

        case 'set_teacher_password':
            if (!aslhub_is_admin($me)) aslhub_json_error('Admin only.', 403);
            $who = $_POST['teacher'] ?? '';
            $new = (string)($_POST['new_password'] ?? '');
            if (!array_key_exists($who, aslhub_valid_teachers())) aslhub_json_error('Unknown teacher.');
            if (strlen($new) < 8) aslhub_json_error('Teacher passwords must be at least 8 characters.');
            $stmt = $pdo->prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE is_teacher = TRUE AND teacher = ?");
            $stmt->execute([password_hash($new, PASSWORD_DEFAULT), $who]);
            if (!$stmt->rowCount()) aslhub_json_error('No account found for that teacher — run install.php first.');
            aslhub_json(['success' => true]);

        case 'save_course_settings':
            if (!aslhub_is_admin($me)) aslhub_json_error('Admin only.', 403);
            $participationMax = (int)($_POST['participation_max'] ?? 10);
            if ($participationMax < 1 || $participationMax > 1000) {
                aslhub_json_error('Participation maximum must be between 1 and 1000.');
            }
            $maxOpenScore = (int)$pdo->query("SELECT COALESCE(MAX(m.participation_points),0) AS m
                FROM asl_student_block_metrics m JOIN asl_reporting_blocks b ON b.id=m.block_id
                WHERE b.finalized_at IS NULL")->fetch()['m'];
            if ($participationMax < $maxOpenScore) {
                aslhub_json_error("Participation maximum cannot be below an existing open-block score of $maxOpenScore.");
            }
            $pdo->beginTransaction();
            aslhub_set_setting($pdo, 'participation_max', (string)$participationMax);
            // Finalized blocks keep the maximum they were graded against; only open/future blocks follow the global setting.
            $pdo->prepare("UPDATE asl_reporting_blocks SET participation_max=? WHERE finalized_at IS NULL")
                ->execute([$participationMax]);
            $pdo->prepare("UPDATE asl_student_block_metrics m JOIN asl_reporting_blocks b ON b.id=m.block_id
                SET m.participation_max=? WHERE b.finalized_at IS NULL")
                ->execute([$participationMax]);
            $code = trim($_POST['signup_code'] ?? '');
            if ($code !== '') aslhub_set_setting($pdo, 'signup_code', $code);
            $pdo->commit();
            aslhub_json(['success' => true]);

        default:
            aslhub_json_error('Unknown action.');
    }
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('settings_save: ' . $e->getMessage());
    aslhub_json_error('Save failed.', 500);
}
