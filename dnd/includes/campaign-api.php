<?php
/**
 * The heroes' campaign data as an API: projects, relationships and record info (October 2026).
 * api/campaign.php checks the session and calls campaign_api_handle(); tests call it directly.
 *
 * Who may do what:
 *   Director (user "GM"): everything, for every hero.
 *   A player: reads their own hero only; projects come without numbers, history or notes (a percent only);
 *             may add a project to their own hero with a title only (it waits for the Director to set the total).
 *
 * Projects and relationships are addressed by their stored index plus the name they had when shown ("name");
 * when the name there is different (the list changed meanwhile) the request is refused instead of changing
 * the wrong entry.
 */

require_once __DIR__ . '/character-data.php';

const CAMPAIGN_INFO_FIELDS = array('player_name', 'college', 'minor', 'extra_curricular', 'boon', 'other');

final class CampaignApiError extends Exception
{
}

function campaign_fail(string $message): void
{
    throw new CampaignApiError($message);
}

function campaign_text($value, int $max): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $text = trim(strip_tags((string) $value));
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max);
    }
    return substr($text, 0, $max);
}

function campaign_int($value, int $min, int $max, string $label): int
{
    if (is_int($value)) {
        $n = $value;
    } elseif (is_string($value) && preg_match('/^\s*[+-]?\d+\s*$/', $value)) {
        $n = intval(trim($value));
    } else {
        campaign_fail("$label must be a whole number.");
    }
    if ($n < $min || $n > $max) {
        campaign_fail("$label must be between $min and $max.");
    }
    return $n;
}

/** The heroes this user may see: the Director every player who is on; a player only themselves. */
function campaign_visible_heroes(string $user): array
{
    if ($user === 'GM') {
        return players_ids(true);
    }
    return in_array($user, players_ids(), true) ? array($user) : array();
}

/** The hero a request names, checked against what this user may see. */
function campaign_hero_param(array $params, string $user): string
{
    $hero = strtolower(trim((string) ($params['character'] ?? '')));
    if ($user !== 'GM') {
        if ($hero === '' || $hero === 'all') {
            $hero = $user;
        }
        if ($hero !== $user) {
            campaign_fail('Access denied');
        }
    }
    if (!in_array($hero, players_ids(), true)) {
        campaign_fail('Unknown hero');
    }
    return $hero;
}

function campaign_require_gm(string $user): void
{
    if ($user !== 'GM') {
        campaign_fail('Only the Director can change this');
    }
}

/** A file path stored by another page, as a path under dnd/ (or left alone when it is a full URL). */
function campaign_media_path(string $path, string $folder): string
{
    $path = trim($path);
    if ($path === '') {
        return '';
    }
    if (preg_match('#^(https?:)?//#i', $path) || $path[0] === '/' || strpos($path, 'data:') === 0) {
        return $path;
    }
    return ($folder === '' ? '' : rtrim($folder, '/') . '/') . ltrim($path, './');
}

// ---------------------------------------------------------------- shaping data for the screens

function campaign_project_view(array $project, int $index, bool $isGm): array
{
    $earned = isset($project['points_earned']) ? intval($project['points_earned']) : 0;
    $totalRaw = isset($project['total_points']) ? trim((string) $project['total_points']) : '';
    $total = is_numeric($totalRaw) ? intval($totalRaw) : 0;
    $waiting = $total <= 0;
    $progress = $waiting ? 0 : $earned / $total;
    $view = array(
        'index' => $index,
        'project_name' => (string) ($project['project_name'] ?? ''),
        'waiting' => $waiting,
        'complete' => !$waiting && $progress >= 1,
        'percent' => $waiting ? 0 : (int) min(100, max(0, intdiv(max(0, (int) $earned) * 100, (int) $total))),   // integer maths, the same as the page's percentOf (29/100 is 29)
    );
    if ($isGm) {
        $history = isset($project['points_history']) && is_array($project['points_history'])
            ? array_values(array_map('intval', $project['points_history'])) : array();
        $view += array(
            'source' => (string) ($project['source'] ?? ''),
            'points_earned' => $earned,
            'total_points' => $waiting ? null : $total,
            'extra' => (string) ($project['extra'] ?? ''),
            'points_history' => $history,
        );
    }
    return $view;
}

/** Students and staff by id and by lower-case name, read once per request. */
function campaign_people(bool $fresh = false): array
{
    static $people = null;
    if ($people !== null && !$fresh) {
        return $people;
    }
    $people = array('student' => array(), 'staff' => array(), 'student_name' => array(), 'staff_name' => array());
    foreach (character_data_load_students() as $s) {
        if (!is_array($s) || empty($s['student_id'])) {
            continue;
        }
        $image = (string) ($s['image_path'] ?? '');
        if ($image === '' && !empty($s['images']) && is_array($s['images'])) {
            $image = (string) reset($s['images']);
        }
        $grade = (string) ($s['grade_level'] ?? ($s['grade'] ?? ''));
        if ($grade !== '' && is_numeric($grade)) {
            $grade = 'Year ' . $grade;
        }
        $entry = array(
            'type' => 'student',
            'id' => (string) $s['student_id'],
            'name' => (string) ($s['name'] ?? ''),
            'college' => (string) ($s['college'] ?? ''),
            'year' => $grade,
            'role' => '',
            'image' => campaign_media_path($image, 'strixhaven/students'),
            'image_path' => $image,
            'relationships' => isset($s['relationships']) && is_array($s['relationships']) ? $s['relationships'] : array(),
        );
        $people['student'][$entry['id']] = $entry;
        $people['student_name'][strtolower(trim($entry['name']))] = $entry['id'];
    }
    foreach (character_data_load_staff() as $s) {
        if (!is_array($s) || empty($s['staff_id'])) {
            continue;
        }
        $image = (string) ($s['image_path'] ?? '');
        if ($image === '' && !empty($s['images']) && is_array($s['images'])) {
            $image = (string) reset($s['images']);
        }
        $entry = array(
            'type' => 'staff',
            'id' => (string) $s['staff_id'],
            'name' => (string) ($s['name'] ?? ''),
            'college' => (string) ($s['college'] ?? ''),
            'year' => '',
            'role' => (string) ($s['role'] ?? ($s['title'] ?? '')),
            'image' => campaign_media_path($image, 'strixhaven/staff'),
            'image_path' => $image,
        );
        $people['staff'][$entry['id']] = $entry;
        $people['staff_name'][strtolower(trim($entry['name']))] = $entry['id'];
    }
    return $people;
}

function campaign_is_placeholder_name(string $name): bool
{
    return trim($name) === '' || preg_match('/^new relationship$/i', trim($name)) === 1;
}

/** Who a relationship points at: its student, its staff member, or a student of the same name. */
function campaign_relationship_link(array $rel): ?array
{
    $people = campaign_people();
    $sid = trim((string) ($rel['student_id'] ?? ''));
    if ($sid !== '' && isset($people['student'][$sid])) {
        return $people['student'][$sid];
    }
    $tid = trim((string) ($rel['staff_id'] ?? ''));
    if ($tid !== '' && isset($people['staff'][$tid])) {
        return $people['staff'][$tid];
    }
    $name = strtolower(trim((string) ($rel['npc_name'] ?? '')));
    if ($sid === '' && $tid === '' && $name !== '' && isset($people['student_name'][$name])) {
        return $people['student'][$people['student_name'][$name]];
    }
    return null;
}

function campaign_relationship_view(array $rel, int $index): array
{
    $link = campaign_relationship_link($rel);
    $name = (string) ($rel['npc_name'] ?? '');
    $display = campaign_is_placeholder_name($name) && $link ? $link['name'] : ($name !== '' ? $name : 'Someone');
    return array(
        'index' => $index,
        'npc_name' => $name,
        'display_name' => $display,
        'points' => isset($rel['points']) && is_numeric($rel['points']) ? intval($rel['points']) : 0,
        'boon' => (string) ($rel['boon'] ?? ''),
        'bane' => (string) ($rel['bane'] ?? ''),
        'extra' => (string) ($rel['extra'] ?? ''),
        'link' => $link ? array(
            'type' => $link['type'],
            'id' => $link['id'],
            'name' => $link['name'],
            'college' => $link['college'],
            'year' => $link['year'],
            'role' => $link['role'],
            'image' => $link['image'],
            // Points and notes stay in step with the Students page; staff records have no place for them.
            'synced' => $link['type'] === 'student',
        ) : null,
    );
}

function campaign_hero_view(array $data, string $hero, bool $isGm, bool $withRelationships = true): array
{
    $record = isset($data[$hero]) && is_array($data[$hero]) ? $data[$hero] : array();
    $info = isset($record['character']) && is_array($record['character']) ? $record['character'] : array();
    $names = players_names();
    $infoOut = array();
    foreach (array('character_name', 'player_name', 'class', 'race', 'level', 'college', 'minor', 'extra_curricular', 'boon', 'wealth', 'renown', 'other') as $key) {
        $infoOut[$key] = (string) ($info[$key] ?? '');
    }
    $infoOut['portrait'] = campaign_media_path((string) ($info['portrait'] ?? ''), '');
    $projects = array();
    foreach (($record['projects'] ?? array()) as $i => $project) {
        if (is_array($project)) {
            $projects[] = campaign_project_view($project, (int) $i, $isGm);
        }
    }
    $relationships = array();
    foreach (($withRelationships ? ($record['relationships'] ?? array()) : array()) as $i => $rel) {
        if (is_array($rel)) {
            $relationships[] = campaign_relationship_view($rel, (int) $i);
        }
    }
    return array(
        'id' => $hero,
        'name' => $names[$hero] ?? ucfirst($hero),
        'info' => $infoOut,
        'projects' => $projects,
        'relationships' => $relationships,
    );
}

// ---------------------------------------------------------------- finding an entry to change

/** The stored list entry at $index, checked against the name the screen showed for it. */
function &campaign_entry(array &$data, string $hero, string $section, array $params, string $nameKey)
{
    if (!isset($data[$hero]) || !is_array($data[$hero])) {
        $data[$hero] = character_data_blank_hero();
    }
    if (!isset($data[$hero][$section]) || !is_array($data[$hero][$section])) {
        $data[$hero][$section] = array();
    }
    $index = campaign_int($params['index'] ?? null, 0, 100000, 'index');
    if (!isset($data[$hero][$section][$index]) || !is_array($data[$hero][$section][$index])) {
        campaign_fail('That entry is gone; reload the list.');
    }
    if (array_key_exists('name', $params)) {
        $current = (string) ($data[$hero][$section][$index][$nameKey] ?? '');
        if (trim($current) !== trim((string) $params['name'])) {
            campaign_fail('The list changed since it was shown; reload and try again.');
        }
    }
    return $data[$hero][$section][$index];
}

/** Runs a change under the lock; CampaignApiError inside becomes the error reply. */
function campaign_modify(callable $change)
{
    $error = null;
    $result = character_data_modify(function (&$data) use ($change, &$error) {
        try {
            return $change($data);
        } catch (CampaignApiError $e) {
            $error = $e->getMessage();
            return array('error' => $error);
        }
    });
    if (empty($result['success'])) {
        campaign_fail($error ?? ($result['error'] ?? 'Save failed'));
    }
    return $result['result'] ?? null;
}

// ---------------------------------------------------------------- lookups other pages use

/** Same shape as dashboard.php get_all_characters: students, staff and locations. */
function campaign_all_characters(): array
{
    $all = array();
    foreach (character_data_load_students() as $student) {
        $all[] = array(
            'id' => isset($student['student_id']) ? $student['student_id'] : '',
            'name' => isset($student['name']) ? $student['name'] : '',
            'type' => 'student',
            'grade' => isset($student['grade']) ? $student['grade'] : '',
            'college' => isset($student['college']) ? $student['college'] : '',
            'image_path' => isset($student['image_path']) ? $student['image_path'] : ''
        );
    }
    foreach (character_data_load_staff() as $staff) {
        $all[] = array(
            'id' => isset($staff['staff_id']) ? $staff['staff_id'] : '',
            'name' => isset($staff['name']) ? $staff['name'] : '',
            'type' => 'staff',
            'college' => isset($staff['college']) ? $staff['college'] : '',
            'role' => isset($staff['role']) ? $staff['role'] : '',
            'image_path' => isset($staff['image_path']) ? $staff['image_path'] : ''
        );
    }
    $locationsFile = __DIR__ . '/../strixhaven/locations/locations.json';
    if (file_exists($locationsFile)) {
        $locationsData = json_decode((string) file_get_contents($locationsFile), true);
        if (isset($locationsData['locations']) && is_array($locationsData['locations'])) {
            foreach ($locationsData['locations'] as $location) {
                $all[] = array(
                    'id' => isset($location['location_id']) ? $location['location_id'] : '',
                    'name' => isset($location['name']) ? $location['name'] : '',
                    'type' => 'location',
                    'college' => isset($location['college']) ? $location['college'] : '',
                    'hex_number' => isset($location['hex_number']) ? $location['hex_number'] : '',
                    'image_path' => isset($location['image_path']) ? $location['image_path'] : ''
                );
            }
        }
    }
    return $all;
}

/** Students, as dashboard.php get_students_for_autocomplete (staff are not relationship targets). */
function campaign_students_lookup(): array
{
    $people = campaign_people();
    $list = array();
    foreach ($people['student'] as $p) {
        $list[] = array('id' => $p['id'], 'name' => $p['name'], 'type' => 'student', 'grade' => $p['year'], 'college' => $p['college'], 'image_path' => $p['image_path'], 'image' => $p['image']);
    }
    return $list;   // students only: staff keep no relationship points (Brandon, October 2026)
}

// ---------------------------------------------------------------- the actions

/**
 * One request. $params = the POST (or GET for reads) fields; $user = the session user ("GM" or a player id).
 * Returns the reply array (always with 'success').
 */
function campaign_api_handle(string $action, array $params, string $user): array
{
    try {
        if ($user === '' || ($user !== 'GM' && !in_array($user, players_ids(), true))) {
            campaign_fail('Not logged in');
        }
        $isGm = $user === 'GM';
        switch ($action) {
            case 'revision':
                return array('success' => true, 'rev' => character_data_revision());

            case 'heroes':
                $data = loadCharacterData();
                $names = players_names();
                $heroes = array();
                // A player gets the whole party (their own hero first) for the Table's hero cards: names, pictures, stamina
                // on the map. Their sheets and relationships stay behind the other actions' checks.
                $ids = $isGm ? campaign_visible_heroes($user) : array_values(array_unique(array_merge(campaign_visible_heroes($user), players_ids(true))));
                foreach ($ids as $id) {
                    $info = $data[$id]['character'] ?? array();
                    $heroes[] = array(
                        'id' => $id,
                        'name' => $names[$id] ?? ucfirst($id),
                        'character_name' => (string) ($info['character_name'] ?? ''),
                        'portrait' => campaign_media_path((string) ($info['portrait'] ?? ''), ''),
                        'own' => $isGm || $id === $user,
                    );
                }
                return array('success' => true, 'heroes' => $heroes, 'user' => $user, 'is_gm' => $isGm);   // the Table shows a player's view to players

            case 'all_characters':
            case 'get_all_characters':
                return array('success' => true, 'characters' => campaign_all_characters());

            case 'students_lookup':
            case 'get_students_for_autocomplete':
                return array('success' => true, 'students' => campaign_students_lookup());

            case 'character':
                // Brandon (October 2026): players may see and roll on each other's projects (title, bar and roll only);
                // relationships stay their own.
                $want = strtolower(trim((string) ($params['character'] ?? 'all')));
                if ($want === 'all' || $want === '') {
                    $heroIds = $isGm ? campaign_visible_heroes($user) : players_ids(true);   // players who are on
                } elseif (in_array($want, players_ids(true), true) || ($isGm && in_array($want, players_ids(), true))) {
                    $heroIds = array($want);
                } else {
                    campaign_fail('Unknown hero');
                }
                $data = loadCharacterData();
                $heroes = array();
                foreach ($heroIds as $id) {
                    $heroes[] = campaign_hero_view($data, $id, $isGm, $isGm || $id === $user);
                }
                return array('success' => true, 'is_gm' => $isGm, 'rev' => character_data_revision(), 'heroes' => $heroes);

            case 'save_info':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $fields = $params['fields'] ?? null;
                if (is_string($fields)) {
                    $fields = json_decode($fields, true);
                }
                if (!is_array($fields)) {
                    $fields = array_intersect_key($params, array_flip(CAMPAIGN_INFO_FIELDS));
                }
                $changes = array();
                foreach ($fields as $key => $value) {
                    if (!in_array($key, CAMPAIGN_INFO_FIELDS, true)) {
                        campaign_fail("$key cannot be changed here");
                    }
                    $changes[$key] = campaign_text($value, $key === 'other' ? 4000 : 500);
                }
                if (!$changes) {
                    campaign_fail('Nothing to save');
                }
                campaign_modify(function (&$data) use ($hero, $changes) {
                    if (!isset($data[$hero]) || !is_array($data[$hero])) {
                        $data[$hero] = character_data_blank_hero();
                    }
                    if (!isset($data[$hero]['character']) || !is_array($data[$hero]['character'])) {
                        $data[$hero]['character'] = array();
                    }
                    foreach ($changes as $key => $value) {
                        $data[$hero]['character'][$key] = $value;
                    }
                    return true;
                });
                $view = campaign_hero_view(loadCharacterData(), $hero, true);
                return array('success' => true, 'info' => $view['info']);

            // ---------------- projects
            case 'project_add':
                $hero = campaign_hero_param($params, $user);
                $name = campaign_text($params['project_name'] ?? '', 120);
                if ($name === '') {
                    campaign_fail('Give the project a name');
                }
                $project = array('project_name' => $name, 'source' => '', 'points_earned' => '0', 'total_points' => '', 'extra' => '', 'points_history' => array());
                if ($isGm) {
                    $project['source'] = campaign_text($params['source'] ?? '', 200);
                    $project['extra'] = campaign_text($params['extra'] ?? '', 4000);
                    if (isset($params['total_points']) && trim((string) $params['total_points']) !== '') {
                        $project['total_points'] = (string) campaign_int($params['total_points'], 0, 1000000, 'Total');
                    }
                    if (isset($params['points_earned']) && trim((string) $params['points_earned']) !== '') {
                        $project['points_earned'] = (string) campaign_int($params['points_earned'], 0, 1000000, 'Points');
                    }
                } else {
                    foreach (array('source', 'extra', 'total_points', 'points_earned', 'points_history') as $gmOnly) {
                        if (isset($params[$gmOnly]) && trim(is_scalar($params[$gmOnly]) ? (string) $params[$gmOnly] : 'x') !== '') {
                            campaign_fail('Only the Director sets a project\'s points, source and notes');
                        }
                    }
                }
                $index = campaign_modify(function (&$data) use ($hero, $project) {
                    if (!isset($data[$hero]) || !is_array($data[$hero])) {
                        $data[$hero] = character_data_blank_hero();
                    }
                    if (!isset($data[$hero]['projects']) || !is_array($data[$hero]['projects'])) {
                        $data[$hero]['projects'] = array();
                    }
                    $data[$hero]['projects'][] = $project;
                    return count($data[$hero]['projects']) - 1;
                });
                return array('success' => true, 'index' => $index);

            case 'project_update':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $changes = array();
                if (array_key_exists('project_name', $params)) {
                    $changes['project_name'] = campaign_text($params['project_name'], 120);
                    if ($changes['project_name'] === '') {
                        campaign_fail('Give the project a name');
                    }
                }
                if (array_key_exists('source', $params)) {
                    $changes['source'] = campaign_text($params['source'], 200);
                }
                if (array_key_exists('extra', $params)) {
                    $changes['extra'] = campaign_text($params['extra'], 4000);
                }
                if (array_key_exists('total_points', $params)) {
                    $changes['total_points'] = trim((string) $params['total_points']) === '' ? '' : (string) campaign_int($params['total_points'], 0, 1000000, 'Total');
                }
                $newPoints = null;
                if (array_key_exists('points_earned', $params) && trim((string) $params['points_earned']) !== '') {
                    $newPoints = campaign_int($params['points_earned'], 0, 1000000, 'Points');
                }
                campaign_modify(function (&$data) use ($hero, $params, $changes, $newPoints) {
                    $project = &campaign_entry($data, $hero, 'projects', $params, 'project_name');
                    foreach ($changes as $key => $value) {
                        $project[$key] = $value;
                    }
                    if ($newPoints !== null && $newPoints !== intval($project['points_earned'] ?? 0)) {
                        character_data_set_project_points($project, $newPoints);
                    }
                    return true;
                });
                return array('success' => true);

            case 'project_add_points':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $delta = campaign_int($params['delta'] ?? null, -100000, 100000, 'Points');
                if ($delta === 0) {
                    campaign_fail('Add or take away at least 1 point');
                }
                $total = campaign_modify(function (&$data) use ($hero, $params, $delta) {
                    $project = &campaign_entry($data, $hero, 'projects', $params, 'project_name');
                    $new = max(0, intval($project['points_earned'] ?? 0) + $delta);
                    character_data_set_project_points($project, $new);
                    return $new;
                });
                return array('success' => true, 'points_earned' => $total);

            case 'project_set_back':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $at = campaign_int($params['to_index'] ?? null, 0, 9, 'History position');
                $to = campaign_int($params['to'] ?? null, -1000000, 1000000, 'Points');
                campaign_modify(function (&$data) use ($hero, $params, $at, $to) {
                    $project = &campaign_entry($data, $hero, 'projects', $params, 'project_name');
                    $history = isset($project['points_history']) && is_array($project['points_history']) ? array_values(array_map('intval', $project['points_history'])) : array();
                    if (!isset($history[$at]) || $history[$at] !== $to || $at === count($history) - 1) {
                        campaign_fail('That roll is no longer in the history; reload the list.');
                    }
                    $project['points_history'] = array_slice($history, 0, $at + 1);
                    $project['points_earned'] = (string) $to;
                    return true;
                });
                return array('success' => true, 'points_earned' => $to);

            case 'project_delete':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                campaign_modify(function (&$data) use ($hero, $params) {
                    campaign_entry($data, $hero, 'projects', $params, 'project_name');
                    array_splice($data[$hero]['projects'], intval($params['index']), 1);
                    return true;
                });
                return array('success' => true);

            // ---------------- relationships
            case 'relationship_add':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $type = (string) ($params['link_type'] ?? '');
                $linkId = trim((string) ($params['link_id'] ?? ''));
                $rel = array('npc_name' => campaign_text($params['npc_name'] ?? '', 100), 'student_id' => '', 'points' => '0', 'boon' => campaign_text($params['boon'] ?? '', 300), 'bane' => campaign_text($params['bane'] ?? '', 300), 'extra' => campaign_text($params['extra'] ?? '', 4000));
                if (isset($params['points']) && trim((string) $params['points']) !== '') {
                    $rel['points'] = (string) campaign_int($params['points'], -1000, 1000, 'Points');
                }
                $people = campaign_people();
                $student = null;
                if ($type === 'student') {
                    $student = $people['student'][$linkId] ?? null;
                    if (!$student) {
                        campaign_fail('That student was not found');
                    }
                    $rel['npc_name'] = $student['name'];
                    $rel['student_id'] = $student['id'];
                    // The Students page may already hold this hero's points and notes for them.
                    $sp = (string) ($student['relationships'][$hero . '_points'] ?? '');
                    $sn = (string) ($student['relationships'][$hero . '_notes'] ?? '');
                    if ($sp !== '' && is_numeric($sp) && !isset($params['points'])) {
                        $rel['points'] = (string) intval($sp);
                    }
                    if ($sn !== '' && $rel['extra'] === '') {
                        $rel['extra'] = $sn;
                    }
                } elseif ($type !== '') {
                    campaign_fail('Unknown kind of person');
                } elseif ($rel['npc_name'] === '') {
                    campaign_fail('Give the person a name');
                }
                $index = campaign_modify(function (&$data) use ($hero, $rel) {
                    if (!isset($data[$hero]) || !is_array($data[$hero])) {
                        $data[$hero] = character_data_blank_hero();
                    }
                    if (!isset($data[$hero]['relationships']) || !is_array($data[$hero]['relationships'])) {
                        $data[$hero]['relationships'] = array();
                    }
                    foreach ($data[$hero]['relationships'] as $existing) {
                        if (($rel['student_id'] !== '' && ($existing['student_id'] ?? '') === $rel['student_id'])
                            || (!empty($rel['staff_id']) && ($existing['staff_id'] ?? '') === $rel['staff_id'])) {
                            campaign_fail($rel['npc_name'] . ' is already on the list');
                        }
                    }
                    $data[$hero]['relationships'][] = $rel;
                    return count($data[$hero]['relationships']) - 1;
                });
                if ($student) {
                    character_data_sync_student($student['id'], $student['name'], $hero, $rel['points'], $rel['extra']);
                }
                return array('success' => true, 'index' => $index);

            case 'relationship_update':
            case 'relationship_points':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $changes = array();
                $delta = null;
                if ($action === 'relationship_points') {
                    $delta = campaign_int($params['delta'] ?? null, -100, 100, 'Points');
                } else {
                    if (array_key_exists('npc_name', $params)) {
                        $changes['npc_name'] = campaign_text($params['npc_name'], 100);
                    }
                    foreach (array('boon' => 300, 'bane' => 300, 'extra' => 4000) as $key => $max) {
                        if (array_key_exists($key, $params)) {
                            $changes[$key] = campaign_text($params[$key], $max);
                        }
                    }
                    if (array_key_exists('points', $params)) {
                        $changes['points'] = (string) campaign_int($params['points'], -1000, 1000, 'Points');
                    }
                }
                $after = campaign_modify(function (&$data) use ($hero, $params, $changes, $delta) {
                    $rel = &campaign_entry($data, $hero, 'relationships', $params, 'npc_name');
                    foreach ($changes as $key => $value) {
                        $rel[$key] = $value;
                    }
                    if ($delta !== null) {
                        $rel['points'] = (string) ((is_numeric($rel['points'] ?? '') ? intval($rel['points']) : 0) + $delta);
                    }
                    return $rel;
                });
                $link = campaign_relationship_link($after);
                if ($link && $link['type'] === 'student') {
                    character_data_sync_student($link['id'], $link['name'], $hero, (string) ($after['points'] ?? '0'), (string) ($after['extra'] ?? ''));
                }
                return array('success' => true, 'points' => intval($after['points'] ?? 0));

            case 'relationship_delete':
                campaign_require_gm($user);
                $hero = campaign_hero_param($params, $user);
                $removed = campaign_modify(function (&$data) use ($hero, $params) {
                    $rel = campaign_entry($data, $hero, 'relationships', $params, 'npc_name');
                    array_splice($data[$hero]['relationships'], intval($params['index']), 1);
                    return $rel;
                });
                // Clear the hero's points and notes on the student too, or the Students page would add them back.
                $link = campaign_relationship_link($removed);
                if ($link && $link['type'] === 'student') {
                    character_data_sync_student($link['id'], $link['name'], $hero, '', '');
                }
                return array('success' => true);

            default:
                campaign_fail('Unknown action');
        }
    } catch (CampaignApiError $e) {
        return array('success' => false, 'error' => $e->getMessage());
    }
    return array('success' => false, 'error' => 'Unknown action');
}
