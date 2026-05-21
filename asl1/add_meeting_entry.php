<?php
session_start();
$aslhub_base_dir = defined('ASLHUB_BASE_DIR') ? ASLHUB_BASE_DIR : __DIR__;
require_once $aslhub_base_dir . '/config.php';
require_once $aslhub_base_dir . '/../common/asl_student_dashboard_data.php';

header('Content-Type: application/json');

if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Access denied. Teachers only.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$student_id = intval($_POST['student_id'] ?? 0);
$meeting_date = trim($_POST['meeting_date'] ?? '');
$absences_raw = $_POST['absences'] ?? '';
$participation_raw = $_POST['participation_pct'] ?? '';
$notes = trim($_POST['notes'] ?? '');

if ($student_id <= 0 || $meeting_date === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Student and meeting date are required.']);
    exit;
}

$dateObj = DateTimeImmutable::createFromFormat('Y-m-d', $meeting_date);
if (!$dateObj || $dateObj->format('Y-m-d') !== $meeting_date) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid meeting date.']);
    exit;
}

$absences = ($absences_raw === '' || $absences_raw === null) ? 0 : intval($absences_raw);
if ($absences < 0) {
    $absences = 0;
}

$participation_pct = null;
if ($participation_raw !== '' && $participation_raw !== null) {
    $participation_pct = (float) $participation_raw;
    if ($participation_pct < 0 || $participation_pct > 100) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Participation must be 0-100.']);
        exit;
    }
}

aslhubEnsureStudentDashboardSchema($pdo);

try {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ? AND is_teacher = FALSE");
    $stmt->execute([$student_id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Student not found.']);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO asl_student_meetings (user_id, meeting_date, absences, participation_pct, notes)
        VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$student_id, $meeting_date, $absences, $participation_pct, $notes !== '' ? $notes : null]);

    echo json_encode([
        'success' => true,
        'message' => 'Meeting entry saved.',
        'meetings' => aslhubStudentDashboardMeetings($pdo, $student_id),
    ]);
} catch (PDOException $e) {
    error_log('ASL meeting entry add failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error occurred.']);
}
?>
