<?php
/**
 * Campaign Data Export API
 *
 * Returns all student and staff NPC data as JSON, sorted by college then name.
 * Designed for automated consumption by AI tools (Claude Cowork).
 *
 * Usage: /dnd/api/export.php
 *        /dnd/api/export.php?key=YOUR_API_KEY  (if API key is configured)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Optional API key protection. Set to a non-empty string to require ?key=... parameter.
// Leave empty to allow unrestricted access (data is campaign fiction, not sensitive).
$API_KEY = '';

if ($API_KEY !== '' && (!isset($_GET['key']) || $_GET['key'] !== $API_KEY)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid or missing API key'], JSON_PRETTY_PRINT);
    exit;
}

// Load data utilities
require_once __DIR__ . '/../strixhaven/students/data-utils.php';
require_once __DIR__ . '/../strixhaven/staff/data-utils.php';

// College sort order per the handoff document
$collegeOrder = [
    'Lorehold'    => 1,
    'Prismari'    => 2,
    'Quandrix'    => 3,
    'Silverquill' => 4,
    'Witherbloom' => 5,
];

/**
 * Get the sort priority for a college name.
 * Unknown or empty colleges sort to the end.
 */
function getCollegePriority($college, $collegeOrder) {
    if (empty($college)) {
        return 999;
    }
    return $collegeOrder[$college] ?? 998;
}

/**
 * Sort an array of NPCs by college order, then alphabetically by name.
 */
function sortByCollegeThenName(&$npcs, $collegeOrder) {
    usort($npcs, function ($a, $b) use ($collegeOrder) {
        $collegeA = $a['college'] ?? '';
        $collegeB = $b['college'] ?? '';
        $priorityA = getCollegePriority($collegeA, $collegeOrder);
        $priorityB = getCollegePriority($collegeB, $collegeOrder);

        if ($priorityA !== $priorityB) {
            return $priorityA - $priorityB;
        }

        $nameA = $a['name'] ?? '';
        $nameB = $b['name'] ?? '';
        return strcasecmp($nameA, $nameB);
    });
}

// Load student data
$studentData = loadStudentData();
$students = $studentData['students'] ?? [];

// Load staff data
$staffData = loadStaffData();
$staff = $staffData['staff'] ?? [];

// Strip internal-only fields that aren't useful for the AI context file
// (image paths, thumbnails, favorites are website-specific)
function cleanStudentRecord($student) {
    unset($student['images']);
    unset($student['image_path']);
    unset($student['image_adjustments']);
    unset($student['thumbnails']);
    unset($student['favorites']);
    return $student;
}

function cleanStaffRecord($staffMember) {
    unset($staffMember['images']);
    unset($staffMember['image_path']);
    unset($staffMember['favorites']);
    return $staffMember;
}

$students = array_map('cleanStudentRecord', $students);
$staff = array_map('cleanStaffRecord', $staff);

// Sort by college, then by name
sortByCollegeThenName($students, $collegeOrder);
sortByCollegeThenName($staff, $collegeOrder);

// Build export payload
$export = [
    'exported_at' => gmdate('Y-m-d\TH:i:s\Z'),
    'student_count' => count($students),
    'staff_count' => count($staff),
    'students' => $students,
    'staff' => $staff,
];

echo json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
