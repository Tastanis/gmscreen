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
            aslhub_json_error('Participation maximum is fixed at three points per instructional day.', 409);

        default:
            aslhub_json_error('Unknown action.');
    }
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('settings_save: ' . $e->getMessage());
    aslhub_json_error('Save failed.', 500);
}
