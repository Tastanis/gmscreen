<?php
/** Teacher settings: own password (any teacher); year/pace/signup/teacher-passwords (admin only). */
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

        case 'save_year':
            if (!aslhub_is_admin($me)) aslhub_json_error('Admin only.', 403);
            $start = $_POST['year_start'] ?? '';
            $end = $_POST['year_end'] ?? '';
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || $start >= $end) {
                aslhub_json_error('Enter valid start/end dates (start before end).');
            }
            $green = (float)($_POST['pace_green_goal'] ?? 3.0);
            $blue = (float)($_POST['pace_blue_goal'] ?? 3.7);
            $red = (float)($_POST['pace_red_goal'] ?? 2.0);
            foreach ([['pace_green_goal', $green], ['pace_blue_goal', $blue], ['pace_red_goal', $red]] as [$k, $v]) {
                if ($v <= 0 || $v > 4) aslhub_json_error('Pace goals must be between 0 and 4.');
                aslhub_set_setting($pdo, $k, (string)$v);
            }
            aslhub_set_setting($pdo, 'year_start', $start);
            aslhub_set_setting($pdo, 'year_end', $end);
            $code = trim($_POST['signup_code'] ?? '');
            if ($code !== '') aslhub_set_setting($pdo, 'signup_code', $code);
            aslhub_json(['success' => true]);

        default:
            aslhub_json_error('Unknown action.');
    }
} catch (PDOException $e) {
    error_log('settings_save: ' . $e->getMessage());
    aslhub_json_error('Save failed.', 500);
}
