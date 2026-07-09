<?php
/** Admin-only school-calendar JSON preview and confirmed apply. */
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/calendar.php';
require_once dirname(__DIR__) . '/lib/backup.php';

$me = aslhub_require_teacher($pdo, true);
if (!aslhub_is_admin($me)) aslhub_json_error('Admin (Harms) access required.', 403);
aslhub_require_csrf();
$mode = $_POST['mode'] ?? 'preview';

if ($mode === 'preview') {
    if (empty($_FILES['calendar']['tmp_name'])) aslhub_json_error('Choose a calendar .json file.');
    if (($_FILES['calendar']['size'] ?? 0) > 2 * 1024 * 1024) aslhub_json_error('Calendar file is too large (2 MB maximum).');
    $raw = file_get_contents($_FILES['calendar']['tmp_name']);
    if ($raw === false) aslhub_json_error('Could not read the uploaded calendar.');
    $calendar = aslhub_calendar_parse($raw);
    if (!$calendar['success']) aslhub_json_error($calendar['error']);

    $token = bin2hex(random_bytes(16));
    $_SESSION['asl_calendar_previews'] = $_SESSION['asl_calendar_previews'] ?? [];
    foreach ($_SESSION['asl_calendar_previews'] as $oldToken => $preview) {
        if (($preview['created_at'] ?? 0) < time() - 1800) unset($_SESSION['asl_calendar_previews'][$oldToken]);
    }
    $_SESSION['asl_calendar_previews'][$token] = ['created_at' => time(), 'calendar' => $calendar];
    $instructionalCount = count(array_filter($calendar['days'], fn($d) => $d['instructional']));
    aslhub_json([
        'success' => true,
        'token' => $token,
        'summary' => [
            'school_year' => $calendar['school_year'] ?: null,
            'timezone' => $calendar['timezone'],
            'calendar_days' => count($calendar['days']),
            'instructional_days' => $instructionalCount,
            'non_instructional_days' => count($calendar['days']) - $instructionalCount,
            'reporting_blocks' => count($calendar['blocks']),
            'first_instructional_day' => $calendar['blocks'][0]['start_date'],
            'last_instructional_day' => $calendar['blocks'][count($calendar['blocks']) - 1]['end_date'],
        ],
        'blocks' => $calendar['blocks'],
    ]);
}

if ($mode === 'commit') {
    $token = preg_replace('/[^a-f0-9]/', '', (string)($_POST['token'] ?? ''));
    $preview = $_SESSION['asl_calendar_previews'][$token] ?? null;
    if (!$preview || ($preview['created_at'] ?? 0) < time() - 1800) {
        aslhub_json_error('Calendar preview expired. Upload and preview it again.', 409);
    }
    try {
        // Calendar replacement remaps reporting blocks, so it gets the same
        // fail-closed safety backup as imports and destructive maintenance.
        aslhub_backup_sql($pdo);
        aslhub_backup_xlsx($pdo);
        aslhub_backup_prune();
        $result = aslhub_calendar_apply($pdo, $preview['calendar']);
        unset($_SESSION['asl_calendar_previews'][$token]);
        aslhub_json(['success' => true, 'result' => $result]);
    } catch (Throwable $e) {
        error_log('calendar_import: ' . $e->getMessage());
        aslhub_json_error($e->getMessage(), 409);
    }
}

aslhub_json_error('Unknown calendar import mode.');
