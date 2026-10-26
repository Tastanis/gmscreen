<?php
declare(strict_types=1);
// Upload Monsters (import-monsters.php + includes/monster-import.php): the preview and the apply.
// Part 1 runs the planner on data in memory. Part 2 runs the real endpoint behind PHP's own
// command-line server in a scratch copy of the site: never the real data.
//
//   php dnd/strixhaven/monster-creator/tests/monster-import.test.php

function check(bool $ok, string $message): void { if (!$ok) { fwrite(STDERR, "FAIL: $message\n"); exit(1); } }

$creator = realpath(__DIR__ . '/..');
require_once $creator . '/includes/monster-import.php';

/** A monster as normalizeImportedMonsterJson makes it (complete; one action with a power roll). */
function monster(array $over = []): array
{
    return array_replace([
        'name' => 'Ember Hulk', 'level' => 5, 'organization' => '', 'tactical_role' => 'Brute', 'role' => 'Brute', 'with_captain' => '',
        'types' => 'Elemental', 'ev' => 24, 'hp' => 96, 'ac' => 10, 'speed' => 6, 'image' => '', 'size' => '2', 'movement_modes' => [], 'movement' => '',
        'stamina' => 96, 'stability' => 2, 'free_strike' => 8, 'immunities' => [], 'weaknesses' => [], 'immunity_type' => '', 'immunity_value' => '',
        'weakness_type' => '', 'weakness_value' => '', 'might' => 3, 'agility' => 0, 'reason' => -1, 'intuition' => 1, 'presence' => 2,
        'traits' => [['name' => 'Molten Hide', 'text' => 'Adjacent melee attackers take 3 fire damage.']],
        'abilities' => ['passive' => [], 'maneuver' => [], 'action' => [[
            'name' => 'Cinder Maul', 'roll_bonus' => 5, 'action_type' => 'Main Action', 'resource_cost' => '', 'keywords' => 'Melee', 'range' => 'Melee 2', 'targets' => '1 creature',
            'effect' => 'A burning fist.', 'has_test' => true, 'additional_effect' => '',
            'test' => ['tier1' => ['damage_amount' => '5', 'damage_type' => 'fire', 'tier_effect' => ''], 'tier2' => ['damage_amount' => '9', 'damage_type' => 'fire', 'tier_effect' => 'push 2'], 'tier3' => ['damage_amount' => '13', 'damage_type' => 'fire', 'tier_effect' => 'push 3']],
        ]], 'triggered_action' => [], 'villain_action' => [], 'malice' => []],
        'created' => 1, 'lastModified' => 1,
    ], $over);
}

function entry(array $source = [], array $monsterOver = [], array $missing = [], array $extra = []): array
{
    $monster = monster($monsterOver + (isset($source['name']) ? ['name' => $source['name']] : []) + (isset($source['level']) ? ['level' => $source['level']] : []));
    return array_replace(['source' => $source + ['name' => $monster['name'], 'level' => $monster['level']], 'monster' => $monster, 'missing' => $missing, 'automationWarnings' => [], 'normalizeError' => ''], $extra);
}

function data(): array
{
    return [
        'tabs' => [
            'tab_1' => ['name' => 'Campus', 'subTabs' => ['sub_1' => ['name' => 'General', 'monsters' => ['m_ogre', 'm_imp_a']], 'sub_2' => ['name' => 'Bosses', 'monsters' => ['m_imp_b']]]],
            'tab_2' => ['name' => 'Orchard', 'subTabs' => ['sub_3' => ['name' => 'Foes', 'monsters' => ['m_wolf']]]],
        ],
        'monsters' => [
            'm_ogre' => monster(['name' => 'Ogre', 'level' => 3, 'image' => 'monster_m_ogre_1.png', 'created' => 111]),
            'm_imp_a' => monster(['name' => 'Imp', 'level' => 1]),
            'm_imp_b' => monster(['name' => 'Imp', 'level' => 1]),
            'm_wolf' => monster(['name' => 'Wolf', 'level' => 2]),
        ],
        'abilityTabs' => ['common' => ['name' => 'Common', 'abilities' => []]],
    ];
}

$env = ['imagesDir' => sys_get_temp_dir() . '/no-such-monster-images-' . bin2hex(random_bytes(4))];
$default = ['tabId' => 'tab_1', 'subTabId' => 'sub_1'];
$plan = static fn(array $entries, array $extra = []) => monsterImportPlan(data(), $extra + ['entries' => $entries, 'defaultTab' => $default], $env);
$apply = static function (array $entries, array $extra = [], ?callable $store = null) use ($env, $default): array {
    $request = $extra + ['entries' => $entries, 'defaultTab' => $default];
    $request += ['selected' => array_keys($entries)];
    return monsterImportApply(data(), $request, $env, 5000, $store ?? static fn() => throw new RuntimeException('no pictures here'));
};

// ---- new, into the tab chosen on the page ------------------------------------------------------
$p = $plan([entry(['id' => 'ember_hulk'])]);
$row = $p['entries'][0];
check($row['action'] === 'new' && $row['id'] === 'ember_hulk' && $row['importable'] && $row['place'] === 'Campus / General' && $p['createTabs'] === [], 'A new monster goes to the chosen tab under its own id: ' . json_encode($row));
check($p['counts'] === ['new' => 1, 'update' => 0, 'blocked' => 0, 'warnings' => 0], 'counts: ' . json_encode($p['counts']));
$p = $plan([entry([])]);
check($p['entries'][0]['id'] === 'monster_ember_hulk', 'Without an id one is made from the name: ' . $p['entries'][0]['id']);

// ---- update by id ------------------------------------------------------------------------------
$p = $plan([entry(['id' => 'm_ogre', 'name' => 'Ogre Brute', 'level' => 4])]);
$row = $p['entries'][0];
check($row['action'] === 'update' && $row['match'] === 'id' && $row['id'] === 'm_ogre' && $row['place'] === 'Campus / General' && $row['moveFrom'] === null, 'Matched by id, it stays where it is: ' . json_encode($row));
check((bool) array_filter($row['warnings'], static fn($w) => str_contains($w, 'Renames "Ogre"')), 'A rename is said');
check($row['image'] === ['kind' => 'keep', 'name' => 'monster_m_ogre_1.png'], 'It keeps its picture: ' . json_encode($row['image']));
$done = $apply([entry(['id' => 'm_ogre', 'name' => 'Ogre Brute', 'level' => 4])]);
$saved = $done['data']['monsters']['m_ogre'];
check($done['results'][0]['action'] === 'updated' && $saved['name'] === 'Ogre Brute' && $saved['image'] === 'monster_m_ogre_1.png' && $saved['created'] === 111 && $saved['lastModified'] === 5000, 'Applied: same id, picture and created kept: ' . json_encode($done['results']));
check(count($done['data']['monsters']) === 4 && $done['data']['tabs']['tab_1']['subTabs']['sub_1']['monsters'] === ['m_ogre', 'm_imp_a'], 'No duplicate and its place unchanged');

// Moving: the file names another tab for a monster matched by id.
$done = $apply([entry(['id' => 'm_ogre', 'name' => 'Ogre', 'level' => 3, 'tab' => 'Orchard'])]);
check($done['plan']['entries'][0]['moveFrom'] === 'Campus / General' && $done['data']['tabs']['tab_2']['subTabs']['sub_3']['monsters'] === ['m_wolf', 'm_ogre']
    && !in_array('m_ogre', $done['data']['tabs']['tab_1']['subTabs']['sub_1']['monsters'], true), 'A named tab moves an update, and it is listed in one place only: ' . json_encode($done['data']['tabs']));
// A named tab it is already in (several sub-tabs, none named) keeps it where it is.
$p = $plan([entry(['id' => 'm_imp_b', 'name' => 'Imp', 'level' => 1, 'tab' => 'Campus'])]);
check($p['entries'][0]['importable'] && $p['entries'][0]['place'] === 'Campus / Bosses' && $p['entries'][0]['moveFrom'] === null, 'Named tab, no sub-tab, already there: stays: ' . json_encode($p['entries'][0]));

// ---- update by name + level within the target tab ----------------------------------------------
$p = $plan([entry(['name' => 'Ogre', 'level' => 3])]);
$row = $p['entries'][0];
check($row['action'] === 'update' && $row['match'] === 'name+level' && $row['id'] === 'm_ogre' && str_contains($row['matchNote'], 'name and level'), 'Same name and level in the target tab: update: ' . json_encode($row));
$p = $plan([entry(['name' => '  ogre ', 'level' => 3])]);
check($p['entries'][0]['id'] === 'm_ogre', 'Capitals and spaces do not count in the name');
$p = $plan([entry(['name' => 'Ogre', 'level' => 4])]);
$row = $p['entries'][0];
check($row['action'] === 'new' && $row['id'] === 'monster_ogre' && (bool) array_filter($row['warnings'], static fn($w) => str_contains($w, 'already named "Ogre"') && str_contains($w, 'm_ogre')), 'Another level is a new monster, with a warning naming the existing one: ' . json_encode($row));
$p = $plan([entry(['name' => 'Wolf', 'level' => 2])]);
check($p['entries'][0]['action'] === 'new' && $p['entries'][0]['warnings'], 'Name + level in another tab is not matched (new, warned): ' . json_encode($p['entries'][0]));
$p = $plan([entry(['name' => 'Wolf', 'level' => 2, 'tab' => 'Orchard'])]);
check($p['entries'][0]['action'] === 'update' && $p['entries'][0]['id'] === 'm_wolf' && $p['entries'][0]['place'] === 'Orchard / Foes', 'but is in the tab the file names');
$p = $plan([entry(['name' => 'Imp', 'level' => 1, 'tab' => 'Campus', 'subTab' => 'General'])]);
check(!$p['entries'][0]['importable'] && str_contains(implode(' ', $p['entries'][0]['errors']), '2 monsters named "Imp"'), 'Two matches: blocked, ids listed: ' . json_encode($p['entries'][0]['errors']));
$p = $plan([entry(['id' => 'm_imp_b', 'name' => 'Imp', 'level' => 1])]);
check($p['entries'][0]['importable'] && $p['entries'][0]['id'] === 'm_imp_b', 'and the id settles it');

// ---- validation: errors block, warnings allow -------------------------------------------------
$p = $plan([entry(['id' => 'x1'], [], ['stamina', 'might'])]);
check(!$p['entries'][0]['importable'] && str_contains($p['entries'][0]['errors'][0], 'Missing stats: stamina, might'), 'Missing stats block: ' . json_encode($p['entries'][0]['errors']));
$done = $apply([entry(['id' => 'x1'], [], ['stamina'])]);
check(!$done['changed'] && $done['results'][0]['action'] === 'skipped' && str_contains($done['results'][0]['reason'], 'Blocked') && !isset($done['data']['monsters']['x1']), 'and are not applied');
$automationOnly = monster()['abilities'];
$automationOnly['action'][0] = ['name' => 'Hidden Push', 'has_test' => false, 'effect' => '', 'additional_effect' => '', 'test' => [], 'automation' => ['cards' => [['type' => 'effect', 'effects' => [['kind' => 'forcedMovement']]]]]];
$p = $plan([entry(['id' => 'x2'], ['abilities' => $automationOnly])]);
check(!$p['entries'][0]['importable'] && str_contains(implode(' ', $p['entries'][0]['errors']), 'only in automation'), 'Rules only in automation block: ' . json_encode($p['entries'][0]['errors']));
$p = $plan([entry(['id' => 'x3'], ['traits' => [['name' => 'Silent', 'text' => '']]])]);
check(!$p['entries'][0]['importable'], 'A trait with no text blocks');
$mismatch = monster()['abilities'];
$mismatch['action'][0]['automation'] = ['cards' => [['type' => 'powerRoll', 'flatBonus' => 3, 'tiers' => ['tier1' => ['effects' => [['kind' => 'condition']]]]]]];
$p = $plan([entry(['id' => 'x4'], ['abilities' => $mismatch], [], ['automationWarnings' => ['Cinder Maul (action) automation: Missing schema id']])]);
$warnings = implode(' | ', $p['entries'][0]['warnings']);
check($p['entries'][0]['importable'] && str_contains($warnings, 'flatBonus is 3') && str_contains($warnings, 'tier1: the automation has condition') && str_contains($warnings, 'Missing schema id'), 'Warnings are listed and allowed: ' . $warnings);
$p = $plan([entry([], [], [], ['monster' => null, 'normalizeError' => 'Monster JSON must include a non-empty "name".'])]);
check(!$p['entries'][0]['importable'] && str_contains($p['entries'][0]['errors'][0], 'non-empty "name"'), 'A monster the normaliser refused is blocked');

// ---- tabs: an upload never makes them (Brandon, October 25, 2026: just say no tab exists by that name) ----
$p = $plan([entry(['id' => 'n1']), entry(['id' => 'n2', 'name' => 'Second'])], ['package' => ['tab' => 'Gravity Orchard', 'subTab' => 'Foes']]);
check(!$p['entries'][0]['importable'] && str_contains($p['entries'][0]['errors'][0], 'No tab named "Gravity Orchard"') && $p['createTabs'] === [], 'A package tab that is not there: blocked, "No tab named": ' . json_encode($p['entries'][0]['errors']));
$done = $apply([entry(['id' => 'n1']), entry(['id' => 'n2', 'name' => 'Second'])], ['package' => ['tab' => 'Gravity Orchard', 'subTab' => 'Foes']]);
check(!$done['changed'] && count($done['data']['tabs']) === 2, 'Applied: nothing made, nothing saved');
$p = $plan([entry(['id' => 'n1', 'subTab' => 'Minions'])]);
check(!$p['entries'][0]['importable'] && str_contains($p['entries'][0]['errors'][0], 'No sub-tab named "Minions" in tab "Campus"') && $p['createTabs'] === [], 'A sub-tab that is not there is not made: ' . json_encode($p['entries'][0]['errors']));
$p = $plan([entry(['id' => 'n1', 'tab' => 'orchard'])], ['package' => ['tab' => 'Campus', 'subTab' => 'Bosses']]);
check($p['entries'][0]['importable'] && $p['entries'][0]['place'] === 'Orchard / Foes', 'A monster\'s own tab beats the package\'s, matched by name in any case: ' . json_encode($p['entries'][0]['place']));
$p = $plan([entry(['id' => 'n1', 'tab' => 'Campus'])], ['defaultTab' => ['tabId' => 'tab_2', 'subTabId' => 'sub_3']]);
check(!$p['entries'][0]['importable'] && str_contains($p['entries'][0]['errors'][0], 'several sub-tabs'), 'A named tab with several sub-tabs and none named: blocked: ' . json_encode($p['entries'][0]['errors']));
$p = monsterImportPlan(data(), ['entries' => [entry(['id' => 'n1'])]], $env);
check(!$p['entries'][0]['importable'] && str_contains($p['entries'][0]['errors'][0], 'No tab') && $p['createTabs'] === [], 'No tab named and none chosen: blocked, nothing made');
$p = monsterImportPlan(data(), ['entries' => [entry(['id' => 'n1'])], 'defaultTab' => ['tabId' => 'tab_9', 'subTabId' => 'x']], $env);
check(!$p['entries'][0]['importable'], 'A chosen tab that does not exist is not made');
$done = $apply([entry(['id' => 'n1', 'tab' => 'Blocked Tab'], [], ['might'])]);
check(!$done['changed'] && count($done['data']['tabs']) === 2, 'A blocked monster makes no tab');

// ---- the file itself ---------------------------------------------------------------------------
$p = $plan([entry(['name' => 'Twin']), entry(['name' => 'Twin'])]);
check($p['entries'][0]['importable'] && !$p['entries'][1]['importable'] && str_contains($p['entries'][1]['errors'][0], 'twice'), 'The same new monster twice: the second is blocked');
$p = $plan([entry(['id' => 'm_ogre', 'name' => 'Ogre', 'level' => 3]), entry(['name' => 'Ogre', 'level' => 3])]);
check(!$p['entries'][1]['importable'] && str_contains(implode(' ', $p['entries'][1]['errors']), 'same monster as item 1'), 'Two updates of one monster: the second is blocked');
$p = $plan([entry(['id' => 'bad id/../x'])]);
check($p['entries'][0]['id'] === 'monster_ember_hulk' && str_contains($p['entries'][0]['warnings'][0], 'not used'), 'An id with other characters is not used: ' . json_encode($p['entries'][0]));
try { monsterImportPlan(data(), ['entries' => []], $env); check(false, 'no entries'); } catch (InvalidArgumentException $e) { check(true, ''); }

// ---- apply: ticks and the preview --------------------------------------------------------------
$done = $apply([entry(['id' => 'a1']), entry(['id' => 'a2', 'name' => 'B'])], ['selected' => [1]]);
check($done['results'][0]['action'] === 'skipped' && $done['results'][0]['reason'] === 'Not ticked.' && $done['results'][1]['action'] === 'created' && !isset($done['data']['monsters']['a1']), 'Unticked monsters are skipped');
$done = $apply([entry(['id' => 'a1'])], ['expect' => ['0' => 'update:m_ogre:tab_1:sub_1']]);
check(!$done['changed'] && str_contains($done['results'][0]['reason'], 'Preview again'), 'A row that changed since the preview is skipped');
$preview = $plan([entry(['id' => 'a1'])]);
$done = $apply([entry(['id' => 'a1'])], ['expect' => ['0' => $preview['entries'][0]['expect']]]);
check($done['changed'] && $done['data']['monsters']['a1']['tabId'] === 'tab_1' && $done['data']['tabs']['tab_1']['subTabs']['sub_1']['monsters'] === ['m_ogre', 'm_imp_a', 'a1'], 'The preview\'s plan applies: ' . json_encode($done['results']));

// ---- pictures ----------------------------------------------------------------------------------
$p = $plan([entry(['id' => 'radenwight_grand_meddle', 'name' => 'Radenwight Grand Meddle'])], ['fileName' => 'whatever.json', 'images' => [['name' => 'radenwight-grand-meddle.png'], ['name' => 'notes.txt']]]);
check($p['entries'][0]['image'] === ['kind' => 'sidecar', 'name' => 'radenwight-grand-meddle.png'], 'A picture named like the monster is its picture: ' . json_encode($p['entries'][0]['image']));
$p = $plan([entry(['name' => 'Gary'])], ['fileName' => 'gary-file.json', 'images' => [['name' => 'Gary-File.webp']]]);
check($p['entries'][0]['image']['kind'] === 'sidecar', 'or named like a one-monster JSON file');
$p = $plan([entry(['name' => 'Gary']), entry(['name' => 'Other'])], ['fileName' => 'gary-file.json', 'images' => [['name' => 'gary-file.webp']]]);
check($p['entries'][0]['image']['kind'] === 'none', 'but not for a file of several monsters');
$imagesDir = sys_get_temp_dir() . '/monster-import-images-' . bin2hex(random_bytes(4));
mkdir($imagesDir);
touch($imagesDir . '/monster_old_123.png');
$p = monsterImportPlan(data(), ['entries' => [entry(['id' => 'u1', 'imageUrl' => '/dnd/strixhaven/monster-creator/images/monster_old_123.png']), entry(['id' => 'u2', 'name' => 'Two', 'image' => 'monster_old_123.png']), entry(['id' => 'u3', 'name' => 'Three', 'imageUrl' => 'https://example.com/x.png'])], 'defaultTab' => $default], ['imagesDir' => $imagesDir]);
check($p['entries'][0]['image'] === ['kind' => 'url', 'name' => 'monster_old_123.png'] && $p['entries'][1]['image']['kind'] === 'url', 'imageUrl naming a stored picture is used: ' . json_encode(array_column($p['entries'], 'image')));
check($p['entries'][2]['image']['kind'] === 'none' && str_contains(implode(' ', $p['entries'][2]['warnings']), 'no picture is set'), 'any other picture address is warned about and not used');
unlink($imagesDir . '/monster_old_123.png'); rmdir($imagesDir);
$done = $apply([entry(['id' => 'm_ogre', 'name' => 'Ogre', 'level' => 3])], ['images' => [['name' => 'm_ogre.gif']]], static fn(string $upload, string $id) => "monster_{$id}_9.gif");
check($done['data']['monsters']['m_ogre']['image'] === 'monster_m_ogre_9.gif', 'A picture sent with an update replaces its picture');
$done = $apply([entry(['id' => 'p1'])], ['images' => [['name' => 'p1.png']]], static fn() => throw new RuntimeException('it is not a picture.'));
check($done['results'][0]['action'] === 'created' && $done['data']['monsters']['p1']['image'] === '' && str_contains(implode(' ', $done['results'][0]['warnings']), 'was not stored'), 'A picture that cannot be stored is said; the monster is still saved');
echo "monster import planner: shapes of request, new vs update (id, name+level), errors block, warnings allow, never makes tabs, ticks, pictures\n";

// =================================================================================================
// Part 2: the real endpoint, in a scratch copy of the site.
$root = sys_get_temp_dir() . '/monster-import-site-' . bin2hex(random_bytes(6));
$site = $root . '/strixhaven/monster-creator';
foreach ([$site . '/includes', $site . '/data', $site . '/images', $root . '/includes', $root . '/strixhaven/gm/includes'] as $dir) mkdir($dir, 0777, true);
copy($creator . '/../../includes/players.php', $root . '/includes/players.php');
foreach (['import-monsters.php', 'upload-image.php', 'includes/monster-import.php', 'includes/monster-store.php', 'includes/monster-backup-helper.php'] as $file) copy($creator . '/' . $file, $site . '/' . $file);
copy($creator . '/../gm/includes/file-lock-manager.php', $root . '/strixhaven/gm/includes/file-lock-manager.php');
$dataFile = $site . '/data/gm-monsters.json';
file_put_contents($dataFile, json_encode(data(), JSON_PRETTY_PRINT));
file_put_contents($site . '/router.php', '<?php session_save_path(' . var_export($site, true) . '); $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } return false;');
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $item) { if ($item === '.' || $item === '..') continue; $path = $folder . '/' . $item; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
$probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
$extensions = is_file(dirname(PHP_BINARY) . '/ext/php_gd.dll') ? ['-d', 'extension_dir=' . dirname(PHP_BINARY) . '/ext', '-d', 'extension=gd', '-d', 'extension=fileinfo', '-d', 'extension=mbstring'] : [];
$server = proc_open([PHP_BINARY, ...$extensions, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $site, $site . '/router.php'], [['pipe', 'r'], ['file', $site . '/server.log', 'a'], ['file', $site . '/server.log', 'a']], $pipes);
$ask = static function (?string $user, string $type, string $body) use ($port): array {
    $context = stream_context_create(['http' => ['method' => 'POST', 'ignore_errors' => true, 'timeout' => 20,
        'header' => trim(($user !== null ? "X-Test-User: $user\r\n" : '') . "Content-Type: $type"), 'content' => $body]]);
    $answer = file_get_contents("http://127.0.0.1:$port/import-monsters.php", false, $context);
    preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $status);
    return [(int) ($status[1] ?? 0), json_decode((string) $answer, true)];
};
$json = static fn(string $action, array $request) => ['application/json', json_encode(['action' => $action, 'request' => $request])];
$multipart = static function (array $request, array $files): array {
    $edge = 'edge' . bin2hex(random_bytes(6));
    $body = "--$edge\r\nContent-Disposition: form-data; name=\"action\"\r\n\r\napply\r\n--$edge\r\nContent-Disposition: form-data; name=\"payload\"\r\n\r\n" . json_encode($request) . "\r\n";
    foreach ($files as $name => $bytes) $body .= "--$edge\r\nContent-Disposition: form-data; name=\"images[]\"; filename=\"$name\"\r\nContent-Type: image/gif\r\n\r\n$bytes\r\n";
    return ["multipart/form-data; boundary=$edge", $body . "--$edge--\r\n"];
};
$gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
$request = ['fileName' => 'orchard.json', 'package' => ['tab' => 'Orchard', 'subTab' => 'Foes'], 'defaultTab' => $default,
    'entries' => [entry(['id' => 'scree_prophet', 'name' => 'Scree Prophet']), entry(['id' => 'm_ogre', 'name' => 'Ogre', 'level' => 3]), entry(['name' => 'Broken'], [], ['stamina'])],
    'images' => [['name' => 'scree-prophet.gif']]];

try {
    for ($i = 0; $i < 80 && @file_get_contents("http://127.0.0.1:$port/router.php") === false && empty($http_response_header); $i++) usleep(100000);
    $before = file_get_contents($dataFile);

    [$status] = $ask(null, ...$json('preview', $request));
    check($status === 401, 'Without a login: 401, got ' . $status);
    [$status, $answer] = $ask('cal', ...$json('preview', $request));
    check($status === 403 && ($answer['error'] ?? '') === 'GM access required', 'A player cannot preview: ' . json_encode([$status, $answer]));
    [$status, $answer] = $ask('cal', ...$multipart($request + ['selected' => [0, 1]], ['scree-prophet.gif' => $gif]));
    check($status === 403 && file_get_contents($dataFile) === $before && glob($site . '/images/*') === [], 'A player cannot apply, and nothing is written');

    [$status, $answer] = $ask('GM', ...$json('preview', $request));
    $rows = $answer['preview']['entries'] ?? [];
    check($status === 200 && count($rows) === 3 && $rows[0]['action'] === 'new' && $rows[0]['image']['kind'] === 'sidecar' && $rows[1]['action'] === 'update' && $rows[1]['match'] === 'id' && !$rows[2]['importable'],
        'The Director\'s preview: new, update by id, blocked: ' . json_encode([$status, $answer]));
    check(file_get_contents($dataFile) === $before && !is_dir($site . '/data/backups'), 'A preview writes nothing');

    $expect = [];
    foreach ($rows as $row) $expect[(string) $row['index']] = $row['expect'];
    [$status, $answer] = $ask('GM', ...$multipart($request + ['selected' => [0, 1, 2], 'expect' => $expect], ['scree-prophet.gif' => $gif]));
    check($status === 200 && ($answer['counts'] ?? null) === ['created' => 1, 'updated' => 1, 'skipped' => 1], 'Applied: 1 created, 1 updated, 1 skipped: ' . json_encode([$status, $answer]));
    $saved = json_decode(file_get_contents($dataFile), true);
    $picture = $saved['monsters']['scree_prophet']['image'] ?? '';
    check(preg_match('/^monster_scree_prophet_\d+\.gif$/', $picture) === 1 && is_file($site . '/images/' . $picture), 'The sidecar picture is stored under the handler\'s own name: ' . $picture);
    check($saved['monsters']['m_ogre']['image'] === 'monster_m_ogre_1.png' && $saved['monsters']['m_ogre']['created'] === 111 && ($saved['metadata']['user'] ?? '') === 'GM', 'The update keeps its picture and created time; the save is noted as the Director\'s');
    $orchard = array_values(array_filter($saved['tabs'], static fn($t) => ($t['name'] ?? '') === 'Orchard'));
    check(count($orchard) === 1 && in_array('scree_prophet', array_values($orchard[0]['subTabs'])[0]['monsters'], true) && in_array('m_ogre', array_values($orchard[0]['subTabs'])[0]['monsters'], true), 'The package tab (already there) holds both');
    check(is_file($site . '/data/backups/gm-monsters_recent_latest.json') && glob($site . '/data/backups/gm-monsters_session_*.json') && file_get_contents($site . '/data/backups/gm-monsters_recent_latest.json') === $before, 'Backups of the data from before the upload were written');
    check(!isset($saved['monsters']['monster_broken']), 'The blocked monster was not saved');

    // Applying the same preview again: the plan has changed (scree_prophet now exists), so it is skipped, not duplicated.
    [$status, $answer] = $ask('GM', ...$multipart($request + ['selected' => [0], 'expect' => $expect], []));
    check($status === 200 && $answer['results'][0]['action'] === 'skipped' && str_contains($answer['results'][0]['reason'], 'Preview again'), 'A stale preview does not duplicate: ' . json_encode($answer));
    [$status, $answer] = $ask('GM', 'application/json', json_encode(['action' => 'nope']));
    check($status === 400, 'Unknown action: 400');
    [$status, $answer] = $ask('GM', ...$json('preview', ['entries' => []]));
    check($status === 422 && str_contains($answer['error'] ?? '', 'no monsters'), 'An empty upload: 422');
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    usleep(200000);
    $remove($root);
}
echo "monster import endpoint: the Director only; preview writes nothing; apply saves through the store with backups and stores pictures; stale previews never duplicate\n";
