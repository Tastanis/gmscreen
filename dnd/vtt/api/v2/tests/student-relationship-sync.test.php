<?php
declare(strict_types=1);
// The Students page's save finds the hero's campaign relationship for a student (strixhaven/students/data-utils.php
// findStudentRelationshipIndex). October 2026: an entry linked by name only (no student_id, as older entries are and
// as the campaign page links them) was not found, and every save on the Students page added a second entry.
require_once __DIR__ . '/../../../../strixhaven/students/data-utils.php';
function verifyStudentSync(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$list = [
    ['npc_name' => 'Theo Gearsprocket', 'points' => '5'],
    ['npc_name' => 'Clairentine Slatier', 'points' => '-2', 'extra' => 'Insulted at club fair'],
    ['npc_name' => 'Ioria', 'points' => '5', 'student_id' => 'student_ioria'],
];
verifyStudentSync(findStudentRelationshipIndex($list, 'student_ioria', 'Ioria') === 2, 'An entry with the student id is found by it.');
verifyStudentSync(findStudentRelationshipIndex($list, 'student_clair', 'Clairentine Slatier') === 1, 'An older entry with no id is found by the student name.');
verifyStudentSync(findStudentRelationshipIndex($list, 'student_clair', '  clairentine SLATIER ') === 1, 'The name is matched as the campaign page matches it.');
verifyStudentSync(findStudentRelationshipIndex($list, 'student_new', 'Somebody New') === -1, 'No entry: a new one is made.');
// An entry that names another student or a staff member by id is that person, even with the same name.
$other = [['npc_name' => 'Ioria', 'student_id' => 'student_other'], ['npc_name' => 'Ioria', 'staff_id' => 'staff_1']];
verifyStudentSync(findStudentRelationshipIndex($other, 'student_ioria', 'Ioria') === -1, 'An entry linked to someone else is not taken.');
verifyStudentSync(findStudentRelationshipIndex([['npc_name' => 'Ioria', 'student_id' => 'student_ioria'], ['npc_name' => 'Ioria']], 'student_ioria', 'Ioria') === 0, 'The id wins over the name.');
echo "student relationship sync: ok\n";
