<?php
// The Projects / Relationships API (includes/campaign-api.php) on a scratch copy of the data:
// who may change what, set-back trimming the history, the student sync, and the project-roll award
// going through the backup-keeping save.
require_once __DIR__ . '/../includes/campaign-api.php';
require_once __DIR__ . '/../chat_handler.php'; // applyProjectRollAward (CLI: no request handling)

$failures = 0;
function check($ok, $label)
{
    global $failures;
    if ($ok) {
        echo "ok - $label\n";
    } else {
        $failures++;
        fwrite(STDERR, "FAIL - $label\n");
    }
}

$root = sys_get_temp_dir() . '/campaign_api_test_' . getmypid() . '_' . mt_rand();
$dataDir = $root . '/data';
mkdir($dataDir, 0755, true);
character_data_set_dir($dataDir);
character_data_students_file($root . '/students.json');
character_data_staff_file($root . '/staff.json');

$hero = character_data_blank_hero();
$cal = $hero;
$cal['character']['character_name'] = 'Cal Test';
$cal['projects'][] = array('project_name' => 'Golem', 'source' => 'Book', 'points_earned' => '20', 'total_points' => '100', 'extra' => 'secret notes', 'points_history' => array(10, 20));
$zepha = $hero;
$zepha['character']['character_name'] = 'Zepha Test';
file_put_contents($dataDir . '/characters.json', json_encode(array('cal' => $cal, 'zepha' => $zepha, 'sharon' => $hero, 'indigo' => $hero), JSON_PRETTY_PRINT));
file_put_contents($root . '/students.json', json_encode(array('students' => array(
    array('student_id' => 'student_1', 'name' => 'Ana Ink', 'college' => 'Silverquill', 'grade_level' => '2nd Year', 'image_path' => 'portraits/ana.png', 'relationships' => array('cal_points' => '3', 'cal_notes' => 'old friend')),
    array('student_id' => 'student_2', 'name' => 'Bo Root', 'college' => 'Witherbloom', 'relationships' => array()),
)), JSON_PRETTY_PRINT));
file_put_contents($root . '/staff.json', json_encode(array('staff' => array(
    array('staff_id' => 'staff_1', 'name' => 'Dean Vex', 'college' => 'Lorehold', 'role' => 'Dean'),
)), JSON_PRETTY_PRINT));

$api = function ($action, array $params, $user) {
    return campaign_api_handle($action, $params, $user);
};
$stored = function () use ($dataDir) {
    return json_decode(file_get_contents($dataDir . '/characters.json'), true);
};

// ---------------- players
$r = $api('project_add', array('character' => 'cal', 'project_name' => 'My idea'), 'cal');
check($r['success'] === true, 'a player adds a title-only project to their own hero');
$p = $stored()['cal']['projects'][1];
check($p['project_name'] === 'My idea' && $p['total_points'] === '' && $p['points_earned'] === '0' && $p['points_history'] === array(), 'it waits for the Director (no total, strings kept)');

$r = $api('project_add', array('character' => 'zepha', 'project_name' => 'Sneaky'), 'cal');
check($r['success'] === false && $r['error'] === 'Access denied', 'a player cannot add to another hero');
$r = $api('project_add', array('character' => 'cal', 'project_name' => 'Cheat', 'total_points' => '5'), 'cal');
check($r['success'] === false, 'a player cannot set a total when adding');
$r = $api('project_add', array('character' => 'cal', 'project_name' => 'Cheat', 'points_earned' => '500'), 'cal');
check($r['success'] === false, 'a player cannot set points when adding');

foreach (array(
    'project_update' => array('project_name' => 'Renamed'),
    'project_set_back' => array('to_index' => '0', 'to' => '10'),
    'project_add_points' => array('delta' => '5'),
    'project_delete' => array(),
    'relationship_add' => array('npc_name' => 'X'),
    'relationship_points' => array('delta' => '1'),
    'relationship_delete' => array(),
    'save_info' => array('boon' => 'x'),
) as $action => $extra) {
    $r = $api($action, array('character' => 'cal', 'index' => '0', 'name' => 'Golem') + $extra, 'cal');
    check($r['success'] === false, "a player cannot $action");
}
check($stored()['cal']['projects'][0]['points_earned'] === '20' && count($stored()['cal']['projects']) === 2, 'nothing changed by the refused requests');

$r = $api('character', array('character' => 'all'), 'cal');
// Brandon (October 2026): players see and roll on each other's projects; relationships stay their own.
$own = null; foreach ($r['heroes'] as $h) { if ($h['id'] === 'cal') { $own = $h; } }
check($r['success'] && count($r['heroes']) >= 2 && $own !== null, "a player sees every hero's projects");
$other = null; foreach ($r['heroes'] as $h) { if ($h['id'] !== 'cal') { $other = $h; } }
check($other !== null && $other['relationships'] === array(), "a player does not see another hero's relationships");
$r['heroes'] = array($own);
$pv = $r['heroes'][0]['projects'][0];
check(!isset($pv['points_history']) && !isset($pv['extra']) && !isset($pv['source']), 'a player sees no history, source or notes');
check($pv['points_earned'] === 20 && $pv['total_points'] === 100, 'a player sees the points (x / y)');
check($pv['percent'] === 20 && $pv['waiting'] === false, 'a player sees the percent');
check($r['heroes'][0]['projects'][1]['waiting'] === true, 'a title-only project shows as waiting');
$r = $api('character', array('character' => 'zepha'), 'cal');
check($r['success'] && $r['heroes'][0]['id'] === 'zepha' && $r['heroes'][0]['relationships'] === array() && !isset(($r['heroes'][0]['projects'][0] ?? array())['points_history']), "a player can look at another hero's projects (bar and points), never their relationships");

// ---------------- Director
$r = $api('character', array('character' => 'all'), 'GM');
check($r['success'] && count($r['heroes']) >= 4, 'the Director reads every hero who is on');
$gv = $r['heroes'][0]['projects'][0];
check($gv['points_history'] === array(10, 20) && $gv['points_earned'] === 20 && $gv['total_points'] === 100 && $gv['extra'] === 'secret notes', 'the Director sees numbers, history and notes');

$r = $api('project_update', array('character' => 'cal', 'index' => '1', 'name' => 'My idea', 'total_points' => '50', 'source' => 'Library'), 'GM');
check($r['success'] && $stored()['cal']['projects'][1]['total_points'] === '50', 'the Director sets the total (stored as a string)');
$r = $api('project_update', array('character' => 'cal', 'index' => '1', 'name' => 'Wrong name', 'total_points' => '60'), 'GM');
check($r['success'] === false && $stored()['cal']['projects'][1]['total_points'] === '50', 'a stale name is refused');

$r = $api('project_add_points', array('character' => 'cal', 'index' => '0', 'name' => 'Golem', 'delta' => '7'), 'GM');
$p = $stored()['cal']['projects'][0];
check($r['success'] && $p['points_earned'] === '27' && $p['points_history'] === array(10, 20, 27), 'adding points by hand updates points and history');

// The award from an accepted project roll in chat
@unlink($dataDir . '/characters_backup_latest.json');
$award = applyProjectRollAward(array('characterId' => 'cal', 'projectIndex' => 0, 'projectName' => 'Golem', 'total' => 13));
$p = $stored()['cal']['projects'][0];
check(isset($award['newPoints']) && $award['newPoints'] === 40 && $p['points_earned'] === '40' && end($p['points_history']) === 40, 'the accepted roll adds its total');
check(is_file($dataDir . '/characters_backup_latest.json') && strpos(file_get_contents($dataDir . '/characters_backup_latest.json'), '"27"') !== false, 'the award kept the dashboard backup of the data before it');
check(is_file($dataDir . '/backups/characters_recent_latest.json'), 'the award went through the dashboard backup helper');
$award = applyProjectRollAward(array('characterId' => 'cal', 'projectIndex' => 0, 'projectName' => 'My idea', 'total' => 5));
check(isset($award['projectIndex']) && $award['projectIndex'] === 1 && $stored()['cal']['projects'][1]['points_earned'] === '5', 'an award whose index moved finds the project by name');

$r = $api('project_set_back', array('character' => 'cal', 'index' => '0', 'name' => 'Golem', 'to_index' => '1', 'to' => '20'), 'GM');
$p = $stored()['cal']['projects'][0];
check($r['success'] && $p['points_earned'] === '20' && $p['points_history'] === array(10, 20), 'set back to 20 trims the rolls after it');
$r = $api('project_set_back', array('character' => 'cal', 'index' => '0', 'name' => 'Golem', 'to_index' => '0', 'to' => '99'), 'GM');
check($r['success'] === false, 'set back to a value not at that place is refused');

$r = $api('project_delete', array('character' => 'cal', 'index' => '1', 'name' => 'My idea'), 'GM');
check($r['success'] && count($stored()['cal']['projects']) === 1, 'the Director deletes a project');

$r = $api('save_info', array('character' => 'cal', 'fields' => json_encode(array('boon' => '<b>Lucky</b>', 'minor' => 'Runes'))), 'GM');
check($r['success'] && $stored()['cal']['character']['boon'] === 'Lucky' && $r['info']['minor'] === 'Runes', 'save_info stores whitelisted fields, tags stripped');
$r = $api('save_info', array('character' => 'cal', 'fields' => json_encode(array('character_name' => 'Hacked'))), 'GM');
check($r['success'] === false && $stored()['cal']['character']['character_name'] === 'Cal Test', 'save_info refuses other fields');

// ---------------- relationships and the student / staff link
$r = $api('relationship_add', array('character' => 'cal', 'link_type' => 'student', 'link_id' => 'student_1'), 'GM');
$rel = $stored()['cal']['relationships'][0];
check($r['success'] && $rel['student_id'] === 'student_1' && $rel['npc_name'] === 'Ana Ink' && $rel['points'] === '3' && $rel['extra'] === 'old friend', 'adding a student takes their name, id and the points/notes the Students page had');
$r = $api('relationship_add', array('character' => 'cal', 'link_type' => 'student', 'link_id' => 'student_1'), 'GM');
check($r['success'] === false, 'the same student cannot be added twice');
$r = $api('relationship_points', array('character' => 'cal', 'index' => '0', 'name' => 'Ana Ink', 'delta' => '-5'), 'GM');
$students = json_decode(file_get_contents($root . '/students.json'), true)['students'];
check($r['success'] && $stored()['cal']['relationships'][0]['points'] === '-2' && $students[0]['relationships']['cal_points'] === '-2', 'points change on both sides');
$r = $api('relationship_update', array('character' => 'cal', 'index' => '0', 'name' => 'Ana Ink', 'extra' => 'rival now', 'boon' => 'Ink trick'), 'GM');
$students = json_decode(file_get_contents($root . '/students.json'), true)['students'];
check($r['success'] && $students[0]['relationships']['cal_notes'] === 'rival now', 'notes sync to the student');
$r = $api('character', array('character' => 'cal'), 'GM');
$rv = $r['heroes'][0]['relationships'][0];
check($rv['link']['type'] === 'student' && $rv['link']['synced'] === true && $rv['link']['image'] === 'strixhaven/students/portraits/ana.png' && $rv['link']['year'] === '2nd Year', 'a linked relationship carries the student\'s picture and year');

$r = $api('relationship_add', array('character' => 'cal', 'link_type' => 'staff', 'link_id' => 'staff_1'), 'GM');
check($r['success'] === false && count($stored()['cal']['relationships']) === 1, 'staff are not relationship targets (they keep no points)');
$r = $api('relationship_add', array('character' => 'cal', 'npc_name' => 'Town baker'), 'GM');
check($r['success'] && $stored()['cal']['relationships'][1]['npc_name'] === 'Town baker', 'someone not on the lists can be added by name');

$r = $api('relationship_delete', array('character' => 'cal', 'index' => '0', 'name' => 'Ana Ink'), 'GM');
$students = json_decode(file_get_contents($root . '/students.json'), true)['students'];
check($r['success'] && count($stored()['cal']['relationships']) === 1 && $students[0]['relationships']['cal_points'] === '' && $students[0]['relationships']['cal_notes'] === '', 'deleting clears the hero\'s points on the student, so the Students page will not add it back');

$r = $api('students_lookup', array(), 'cal');
$types = array_unique(array_map(function ($p) { return $p['type']; }, $r['students']));
check($r['success'] && count($r['students']) === 2 && $types === array('student'), 'the lookup lists students only');
$r = $api('get_all_characters', array(), 'GM');
check($r['success'] && $r['characters'][0]['type'] === 'student' && $r['characters'][2]['type'] === 'staff', 'the all-characters lookup keeps the dashboard shape');
$r = $api('revision', array(), 'cal');
check($r['success'] && $r['rev'] !== '0', 'revision answers');
$r = $api('character', array(), '');
check($r['success'] === false, 'no user, no data');

// tidy the scratch copy (this test's own temporary files)
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
foreach ($it as $f) {
    $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
}
rmdir($root);

if ($failures) {
    fwrite(STDERR, "$failures failure(s)\n");
    exit(1);
}
echo "campaign API tests passed\n";
