<?php
/**
 * "Upload monsters": the server half of the Monster Creator's file upload (import-monsters.php).
 *
 * The page reads the file and puts each monster through the same normaliser the paste import uses
 * (normalizeImportedMonsterJson + js/monster-json-import-normalize.js). It sends, per monster:
 *   source            the monster object as written in the file (its id, tab, subTab, imageUrl)
 *   monster           the normalised monster, exactly what a paste import would make
 *   missing           required stats the file left out (the normaliser would have made them up)
 *   automationWarnings the ability-automation schema's warnings
 *   normalizeError    set when the normaliser refused the monster
 * plus the file's package tab/subTab, the tab chosen on the page for monsters that name none,
 * and the names of picture files sent with it.
 *
 * Everything else is decided here, once, for both the preview and the apply: which monster each
 * one updates (by id, else by name + level in the target tab), where it goes, which tabs are made,
 * what blocks it (errors) and what is only worth saying (warnings). Apply recomputes the plan on
 * the data as it stands under the lock and refuses rows that changed since the preview.
 *
 * Pure functions: no request, no session, no file writes (pictures are stored by a callback).
 */

const MONSTER_IMPORT_MAX_ENTRIES = 200;
const MONSTER_IMPORT_ID_PATTERN = '/^[A-Za-z0-9_-]{1,100}$/D';
const MONSTER_IMPORT_CATEGORIES = [
    'passive' => 'passive', 'maneuver' => 'maneuver', 'action' => 'action',
    'triggered_action' => 'triggered action', 'villain_action' => 'villain action', 'malice' => 'malice',
];
const MONSTER_IMPORT_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const MONSTER_IMPORT_RIDER_KINDS = ['forcedMovement', 'condition', 'potency', 'teleport', 'swap'];

function monsterImportText($value): string
{
    if ($value === null || is_array($value) || is_object($value) || is_bool($value)) return '';
    return trim((string) $value);
}

function monsterImportFold(string $text): string
{
    $text = preg_replace('/\s+/u', ' ', trim($text)) ?? trim($text);
    return function_exists('mb_strtolower') ? mb_strtolower($text) : strtolower($text);
}

/** Same name: capitals and runs of spaces do not count. */
function monsterImportSameName($a, $b): bool
{
    $a = monsterImportText($a);
    return $a !== '' && monsterImportFold($a) === monsterImportFold(monsterImportText($b));
}

function monsterImportSlug(string $text): string
{
    return trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($text)), '-');
}

function monsterImportClip(string $text, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($text, 0, $length) : substr($text, 0, $length);
}

/** monsterId => [tabId, subTabId] for every monster listed in a sub-tab (the first place wins). */
function monsterImportLocations(array $tabs): array
{
    $where = [];
    foreach ($tabs as $tabId => $tab) {
        if (!is_array($tab)) continue;
        foreach (($tab['subTabs'] ?? []) as $subId => $sub) {
            if (!is_array($sub)) continue;
            foreach (($sub['monsters'] ?? []) as $monsterId) {
                if ((is_string($monsterId) || is_int($monsterId)) && !isset($where[(string) $monsterId])) {
                    $where[(string) $monsterId] = [(string) $tabId, (string) $subId];
                }
            }
        }
    }
    return $where;
}

function monsterImportPlaceName(array $tabs, ?array $place): string
{
    if (!$place) return '(no tab)';
    $tab = $tabs[$place[0]] ?? null;
    $sub = is_array($tab) ? ($tab['subTabs'][$place[1]] ?? null) : null;
    return (is_array($tab) ? (string) ($tab['name'] ?? 'Tab') : '?') . ' / ' . (is_array($sub) ? (string) ($sub['name'] ?? 'Sub-tab') : '?');
}

/** A tab or sub-tab key by its id, else by its name. */
function monsterImportFindKey(array $items, string $wanted): ?string
{
    if ($wanted === '') return null;
    if (isset($items[$wanted]) && is_array($items[$wanted])) return (string) $wanted;
    foreach ($items as $key => $item) {
        if (is_array($item) && monsterImportSameName($item['name'] ?? '', $wanted)) return (string) $key;
    }
    return null;
}

/**
 * Where one monster goes. Tabs and sub-tabs are never made by an upload (Brandon, October 2026): a name
 * the file gives that is not in the Monster Creator is an error ("No tab named ..."); make the tab on
 * the page first. The page's chosen tab is used as it is.
 *
 * @return array{tabKey:?string,subKey:?string,named:bool,error:string}
 */
function monsterImportTarget(array &$tabs, int &$pendingCount, array $request, array $source): array
{
    $ownTab = monsterImportText($source['tab'] ?? null);
    $ownSub = monsterImportText($source['subTab'] ?? ($source['subtab'] ?? null));
    $package = is_array($request['package'] ?? null) ? $request['package'] : [];
    $packageTab = monsterImportText($package['tab'] ?? null);
    $packageSub = monsterImportText($package['subTab'] ?? ($package['subtab'] ?? null));
    if ($ownTab !== '') { $tabWanted = $ownTab; $subWanted = $ownSub; }
    elseif ($packageTab !== '') { $tabWanted = $packageTab; $subWanted = $ownSub !== '' ? $ownSub : $packageSub; }
    else { $tabWanted = ''; $subWanted = $ownSub !== '' ? $ownSub : $packageSub; }

    $default = is_array($request['defaultTab'] ?? null) ? $request['defaultTab'] : [];
    $defaultTab = monsterImportText($default['tabId'] ?? null);
    $defaultSub = monsterImportText($default['subTabId'] ?? null);
    $defaultOk = $defaultTab !== '' && is_array($tabs[$defaultTab] ?? null) && empty($tabs[$defaultTab]['_new'])
        && $defaultSub !== '' && is_array($tabs[$defaultTab]['subTabs'][$defaultSub] ?? null);
    $out = ['tabKey' => null, 'subKey' => null, 'named' => $tabWanted !== '' || $subWanted !== '', 'subNamed' => $subWanted !== '', 'error' => ''];

    if ($tabWanted === '') {
        if (!$defaultOk) {
            $out['error'] = 'No tab: name one with "tab" (and "subTab") in the file, or pick a tab for monsters that name none.';
            return $out;
        }
        $tabKey = $defaultTab;
    } else {
        $tabKey = monsterImportFindKey($tabs, $tabWanted);
    }

    $subKey = null; $newSubName = null;
    if ($tabKey !== null) {
        $subs = is_array($tabs[$tabKey]['subTabs'] ?? null) ? array_filter($tabs[$tabKey]['subTabs'], 'is_array') : [];
        if ($subWanted !== '') {
            $subKey = monsterImportFindKey($subs, $subWanted);
            if ($subKey === null) {
                $out['tabKey'] = $tabKey;
                $out['error'] = 'No sub-tab named "' . $subWanted . '" in tab "' . ($tabs[$tabKey]['name'] ?? $tabWanted) . '".';
                return $out;
            }
        } elseif ($tabWanted === '') {
            $subKey = $defaultSub;
        } elseif ($tabKey === $defaultTab && $defaultOk) {
            $subKey = $defaultSub;
        } elseif (count($pick = (array_filter($subs, static fn($sub) => empty($sub['_new'])) ?: $subs)) === 1) {
            // One sub-tab that was already there (or, in a tab this file makes, the one it makes).
            $subKey = (string) array_key_first($pick);
        } elseif (count($subs) === 0) {
            $out['tabKey'] = $tabKey;
            $out['error'] = 'Tab "' . ($tabs[$tabKey]['name'] ?? $tabWanted) . '" has no sub-tabs: add one in the Monster Creator first.';
            return $out;
        } else {
            $names = array_map(static fn($sub) => (string) ($sub['name'] ?? ''), $subs);
            $out['tabKey'] = $tabKey; // known, so a monster already in this tab can stay where it is
            $out['error'] = 'Tab "' . ($tabs[$tabKey]['name'] ?? $tabWanted) . '" has several sub-tabs (' . implode(', ', $names) . '): add "subTab" to say which.';
            return $out;
        }
    } else {
        $out['error'] = 'No tab named "' . $tabWanted . '".';
        return $out;
    }
    if ($newSubName !== null) {
        $pendingCount++;
        $subKey = 'new:sub:' . $pendingCount;
        $tabs[$tabKey]['subTabs'][$subKey] = ['name' => monsterImportClip($newSubName, 120), 'monsters' => [], '_new' => true];
    }
    $out['tabKey'] = $tabKey;
    $out['subKey'] = $subKey;
    return $out;
}

/** Every powerRoll card in an automation block, nested ones included. */
function monsterImportPowerRolls($node, array &$found = []): array
{
    if (!is_array($node)) return $found;
    if (($node['type'] ?? null) === 'powerRoll') $found[] = $node;
    foreach ($node as $key => $child) {
        if (is_array($child) && $key !== 'tiers') monsterImportPowerRolls($child, $found);
    }
    return $found;
}

function monsterImportHasAutomation($automation): bool
{
    if (!is_array($automation)) return false;
    foreach (['cards', 'passives', 'modifiers'] as $key) if (!empty($automation[$key]) && is_array($automation[$key])) return true;
    return false;
}

/**
 * The template's non-negotiables. Errors block the monster; warnings are shown and allowed.
 *
 * @return array{0:list<string>,1:list<string>}
 */
function monsterImportValidate(array $entry): array
{
    $errors = []; $warnings = [];
    $missing = array_values(array_filter(array_map('monsterImportText', is_array($entry['missing'] ?? null) ? $entry['missing'] : [])));
    if ($missing) {
        $errors[] = 'Missing stats: ' . implode(', ', $missing) . '. Every monster needs name, level, role, types, ev, size, speed, stamina, stability, free_strike and all five attributes (0 is fine, left out is not).';
    }
    $monster = $entry['monster'];
    $abilityCount = 0;
    $abilities = is_array($monster['abilities'] ?? null) ? $monster['abilities'] : [];
    foreach (MONSTER_IMPORT_CATEGORIES as $category => $label) {
        foreach ((is_array($abilities[$category] ?? null) ? $abilities[$category] : []) as $ability) {
            if (!is_array($ability)) continue;
            $abilityCount++;
            $name = monsterImportText($ability['name'] ?? '') ?: 'Unnamed';
            $where = "$name ($label)";
            $hasTest = !empty($ability['has_test']);
            $tierText = [];
            $test = is_array($ability['test'] ?? null) ? $ability['test'] : [];
            foreach (['tier1', 'tier2', 'tier3'] as $tierKey) {
                $tier = is_array($test[$tierKey] ?? null) ? $test[$tierKey] : [];
                $tierText[$tierKey] = monsterImportText($tier['damage_amount'] ?? '') . monsterImportText($tier['tier_effect'] ?? '')
                    . (!empty($tier['has_attribute_check']) ? monsterImportText($tier['attribute_effect'] ?? '') : '');
            }
            $anyTier = $hasTest && implode('', $tierText) !== '';
            $plain = monsterImportText($ability['effect'] ?? '') . monsterImportText($ability['additional_effect'] ?? '') . monsterImportText($ability['trigger'] ?? '');
            $automation = $ability['automation'] ?? null;
            if ($plain === '' && !$anyTier) {
                $errors[] = monsterImportHasAutomation($automation)
                    ? "$where: its rules are only in automation. Write them in effect, the test tiers or additional_effect: the Director never sees automation."
                    : "$where: has no rules text.";
                continue;
            }
            if ($hasTest && !$anyTier) $warnings[] = "$where: has_test is set but the tier table is empty; tier damage and riders belong in test.tier1-3.";
            if ($category === 'triggered_action' && monsterImportText($ability['trigger'] ?? '') === '') $warnings[] = "$where: no trigger text.";
            $rolls = monsterImportPowerRolls($automation);
            $rollBonus = (int) ($ability['roll_bonus'] ?? 0);
            foreach ($rolls as $roll) {
                if (array_key_exists('flatBonus', $roll) && (int) $roll['flatBonus'] !== $rollBonus) {
                    $warnings[] = "$where: roll_bonus is $rollBonus but the automation's flatBonus is " . (int) $roll['flatBonus'] . '; they must match.';
                    break;
                }
            }
            if ($hasTest && $rolls) {
                foreach (['tier1', 'tier2', 'tier3'] as $tierKey) {
                    $tier = is_array($test[$tierKey] ?? null) ? $test[$tierKey] : [];
                    $riderText = monsterImportText($tier['tier_effect'] ?? '') . monsterImportText($tier['attribute_effect'] ?? '');
                    $effects = $rolls[0]['tiers'][$tierKey]['effects'] ?? [];
                    $kinds = array_values(array_unique(array_filter(array_map(static fn($e) => is_array($e) ? (string) ($e['kind'] ?? '') : '', is_array($effects) ? $effects : []),
                        static fn($kind) => in_array($kind, MONSTER_IMPORT_RIDER_KINDS, true))));
                    if ($kinds && $riderText === '') $warnings[] = "$where $tierKey: the automation has " . implode(', ', $kinds) . ' but the displayed tier has no rider text (tier_effect or attribute_effect).';
                }
            }
        }
    }
    $traitCount = 0;
    foreach ((is_array($monster['traits'] ?? null) ? $monster['traits'] : []) as $trait) {
        if (!is_array($trait)) continue;
        $traitCount++;
        $name = monsterImportText($trait['name'] ?? '') ?: 'Unnamed';
        if (monsterImportText($trait['text'] ?? '') === '') {
            $errors[] = monsterImportHasAutomation($trait['automation'] ?? null)
                ? "$name (trait): its rules are only in automation. Write them in the trait's text."
                : "$name (trait): has no text.";
        }
    }
    if ($abilityCount === 0 && $traitCount === 0) $warnings[] = 'It has no abilities or traits.';
    if (!in_array('level', $missing, true) && (int) ($monster['level'] ?? 0) < 1) $warnings[] = 'Level is below 1.';
    if (!in_array('stamina', $missing, true) && (int) ($monster['stamina'] ?? 0) <= 0) $warnings[] = 'Stamina is 0.';
    $size = monsterImportText($monster['size'] ?? '');
    if (!in_array('size', $missing, true) && preg_match('/^\d+\s*[TSML]?$/i', $size) !== 1) $warnings[] = "Size \"$size\" is not like 1M, 1S or 2.";
    $auto = array_values(array_filter(array_map('monsterImportText', is_array($entry['automationWarnings'] ?? null) ? $entry['automationWarnings'] : [])));
    if (count($auto) > 30) $auto = [...array_slice($auto, 0, 30), '… and ' . (count($auto) - 30) . ' more automation warnings.'];
    return [$errors, [...$warnings, ...$auto]];
}

/**
 * The monster's picture: a picture file sent with the upload whose name matches (the monster's id,
 * its name, the JSON file's name when it holds one monster, or the file named by "image"), else an
 * "imageUrl"/"image" naming a picture this creator already stores, else none.
 */
function monsterImportImage(array $source, string $id, string $name, array $imageNames, string $fileBase, int $entryCount, string $imagesDir): array
{
    $reference = monsterImportText($source['imageUrl'] ?? null) ?: monsterImportText($source['image'] ?? null);
    $referenceFile = $reference !== '' ? basename((string) (parse_url($reference, PHP_URL_PATH) ?? $reference)) : '';
    $keys = array_filter(array_unique([
        monsterImportSlug($id), monsterImportSlug($name),
        $entryCount === 1 ? monsterImportSlug($fileBase) : '',
        $referenceFile !== '' ? monsterImportSlug((string) pathinfo($referenceFile, PATHINFO_FILENAME)) : '',
    ]));
    foreach ($imageNames as $imageName) {
        $imageName = monsterImportText($imageName);
        $extension = strtolower((string) pathinfo($imageName, PATHINFO_EXTENSION));
        if (!in_array($extension, MONSTER_IMPORT_IMAGE_EXTENSIONS, true)) continue;
        if (in_array(monsterImportSlug((string) pathinfo($imageName, PATHINFO_FILENAME)), $keys, true)) return ['kind' => 'sidecar', 'name' => $imageName, 'warning' => ''];
    }
    if ($reference === '') return ['kind' => 'none', 'name' => '', 'warning' => ''];
    $isBare = $referenceFile === $reference;
    $isOurs = function_exists('monsterImageNameIsOurs') ? monsterImageNameIsOurs($referenceFile)
        : preg_match('/^monster_[A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/D', $referenceFile) === 1;
    if ($isOurs && ($isBare || str_contains($reference, '/monster-creator/images/')) && is_file(rtrim($imagesDir, '/\\') . '/' . $referenceFile)) {
        return ['kind' => 'url', 'name' => $referenceFile, 'warning' => ''];
    }
    return ['kind' => 'none', 'name' => '', 'warning' => "Picture \"$reference\" is neither a picture this creator already stores nor a picture file sent with the upload; no picture is set from it."];
}

/**
 * The preview: what would happen to each monster. Also the first half of apply.
 *
 * @param array $env ['imagesDir' => folder of stored pictures]
 */
function monsterImportPlan(array $data, array $request, array $env): array
{
    $entries = $request['entries'] ?? null;
    if (!is_array($entries) || !array_is_list($entries) || $entries === []) throw new InvalidArgumentException('The upload has no monsters in it.');
    if (count($entries) > MONSTER_IMPORT_MAX_ENTRIES) throw new InvalidArgumentException('Upload at most ' . MONSTER_IMPORT_MAX_ENTRIES . ' monsters at a time.');

    $realTabs = is_array($data['tabs'] ?? null) ? $data['tabs'] : [];
    $monsters = is_array($data['monsters'] ?? null) ? $data['monsters'] : [];
    $tabs = $realTabs;
    $locations = monsterImportLocations($realTabs);
    $pending = 0;
    $claimed = [];      // id => item number, for every id this upload writes
    $newKeys = [];      // "name|level|tabKey" => item number, for new monsters
    $imageNames = array_values(array_filter(array_map(static fn($image) => is_array($image) ? monsterImportText($image['name'] ?? '') : monsterImportText($image),
        is_array($request['images'] ?? null) ? $request['images'] : [])));
    $fileName = monsterImportText($request['fileName'] ?? '');
    $fileBase = (string) pathinfo($fileName, PATHINFO_FILENAME);
    $imagesDir = (string) ($env['imagesDir'] ?? '');
    $rows = [];

    foreach ($entries as $index => $entry) {
        $number = $index + 1;
        $row = ['index' => $index, 'name' => '', 'level' => null, 'action' => null, 'match' => null, 'matchNote' => '', 'id' => null,
            'tab' => null, 'subTab' => null, 'place' => '', 'moveFrom' => null, 'image' => ['kind' => 'none', 'name' => ''],
            'errors' => [], 'warnings' => [], 'importable' => false, 'expect' => ''];
        $source = is_array($entry) && is_array($entry['source'] ?? null) ? $entry['source'] : null;
        $monster = is_array($entry) && is_array($entry['monster'] ?? null) ? $entry['monster'] : null;
        $readError = is_array($entry) ? monsterImportText($entry['normalizeError'] ?? '') : '';
        if ($source === null || $monster === null || $readError !== '' || monsterImportText($monster['name'] ?? '') === '' || !is_array($monster['abilities'] ?? null)) {
            $row['name'] = $monster ? monsterImportText($monster['name'] ?? '') : ($source ? monsterImportText($source['name'] ?? '') : '');
            $row['errors'][] = 'Could not read this monster' . ($readError !== '' ? ": $readError" : ' (it needs a name and the monster fields from the template).');
            $rows[] = $row;
            continue;
        }
        $name = monsterImportText($monster['name']);
        $level = (int) ($monster['level'] ?? 0);
        $row['name'] = $name;
        $row['level'] = $level;
        [$errors, $warnings] = monsterImportValidate(['monster' => $monster] + $entry);

        $requestedId = monsterImportText($source['id'] ?? null) ?: monsterImportText($source['monsterId'] ?? null);
        if ($requestedId !== '' && preg_match(MONSTER_IMPORT_ID_PATTERN, $requestedId) !== 1) {
            $warnings[] = "The id \"$requestedId\" may use only letters, digits, _ and -; it was not used.";
            $requestedId = '';
        }

        $target = null; $id = null; $current = null;
        $probe = monsterImportTarget($tabs, $pending, $request, $source);
        $probeTarget = $probe['error'] === '' ? [$probe['tabKey'], $probe['subKey']] : null;
        if ($requestedId !== '' && is_array($monsters[$requestedId] ?? null)) {
            $id = $requestedId;
            $row['action'] = 'update';
            $row['match'] = 'id';
            $row['matchNote'] = "Matched by id $id.";
            $current = $locations[$id] ?? null;
            $oldName = monsterImportText($monsters[$id]['name'] ?? '');
            if ($oldName !== '' && !monsterImportSameName($oldName, $name)) $warnings[] = "Renames \"$oldName\" to \"$name\".";
        } else {
            // Name + level, within the target tab (all its sub-tabs).
            $candidates = [];
            $scope = $probe['tabKey'];
            if ($scope !== null && empty($tabs[$scope]['_new'])) {
                foreach (($realTabs[$scope]['subTabs'] ?? []) as $sub) {
                    foreach ((is_array($sub) ? ($sub['monsters'] ?? []) : []) as $candidate) {
                        $candidate = (string) $candidate;
                        $existing = $monsters[$candidate] ?? null;
                        if (is_array($existing) && monsterImportSameName($existing['name'] ?? '', $name) && (int) ($existing['level'] ?? 0) === $level) $candidates[$candidate] = true;
                    }
                }
            }
            $candidates = array_keys($candidates);
            $tabName = $scope !== null ? (string) ($tabs[$scope]['name'] ?? '') : '';
            if (count($candidates) > 1) {
                $errors[] = count($candidates) . " monsters named \"$name\" at level $level are already in tab \"$tabName\" (ids " . implode(', ', $candidates) . '). Add "id" to say which one to update.';
            } elseif (count($candidates) === 1) {
                $id = (string) $candidates[0];
                $row['action'] = 'update';
                $row['match'] = 'name+level';
                $row['matchNote'] = "Matched by name and level in tab \"$tabName\" (id $id).";
                $current = $locations[$id] ?? null;
                if ($requestedId !== '') $warnings[] = "No monster has id \"$requestedId\"; the one matched by name and level keeps its id $id.";
            } elseif ($probeTarget !== null) {
                $row['action'] = 'new';
                if ($requestedId !== '' && !isset($claimed[$requestedId])) {
                    $id = $requestedId;
                    $row['matchNote'] = "No monster has id $id, so it is created with that id.";
                } else {
                    $base = substr('monster_' . (trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_') ?: 'imported'), 0, 90);
                    $id = $base;
                    for ($n = 2; isset($monsters[$id]) || isset($claimed[$id]); $n++) $id = $base . '_' . $n;
                    $row['matchNote'] = 'No monster matches its id, or its name and level in that tab.';
                }
                foreach ($monsters as $otherId => $other) {
                    if (is_array($other) && monsterImportSameName($other['name'] ?? '', $name)) {
                        $warnings[] = "Another monster is already named \"$name\" (level " . (int) ($other['level'] ?? 0) . ', ' . monsterImportPlaceName($realTabs, $locations[(string) $otherId] ?? null)
                            . ", id $otherId). This makes a second one; to update that one instead, give its id.";
                    }
                }
                $key = monsterImportFold($name) . '|' . $level . '|' . $probeTarget[0];
                if (isset($newKeys[$key])) $errors[] = "\"$name\" at level $level is in this file twice for the same tab (item {$newKeys[$key]}).";
                else $newKeys[$key] = $number;
                $target = $probeTarget;
            } else {
                $errors[] = $probe['error'];
            }
        }
        if ($row['action'] === 'update') {
            // An update stays where it is unless the file names a place for it; a tab named
            // without a sub-tab keeps it in whichever sub-tab of that tab it already sits.
            if ($current !== null && (!$probe['named'] || (!$probe['subNamed'] && $probe['tabKey'] === $current[0]))) $target = $current;
            elseif ($probeTarget !== null) $target = $probeTarget;
            else $errors[] = $probe['error'];
        }
        if ($id !== null && $row['action'] === 'update') {
            if (isset($claimed[$id])) $errors[] = "This updates the same monster as item {$claimed[$id]} of this file.";
        }
        if ($id !== null && !isset($claimed[$id])) $claimed[$id] = $number;

        $row['id'] = $id;
        if ($target !== null) {
            $row['tab'] = ['key' => $target[0], 'name' => (string) ($tabs[$target[0]]['name'] ?? ''), 'create' => !empty($tabs[$target[0]]['_new'])];
            $row['subTab'] = ['key' => $target[1], 'name' => (string) ($tabs[$target[0]]['subTabs'][$target[1]]['name'] ?? ''), 'create' => !empty($tabs[$target[0]]['subTabs'][$target[1]]['_new'])];
            $row['place'] = $row['tab']['name'] . ' / ' . $row['subTab']['name'];
            if ($row['action'] === 'update' && $current !== null && $current !== $target) $row['moveFrom'] = monsterImportPlaceName($realTabs, $current);
        }
        if ($id !== null) {
            $image = monsterImportImage($source, $requestedId !== '' ? $requestedId : $id, $name, $imageNames, $fileBase, count($entries), $imagesDir);
            if ($image['warning'] !== '') $warnings[] = $image['warning'];
            if ($image['kind'] === 'none' && $row['action'] === 'update' && monsterImportText($monsters[$id]['image'] ?? '') !== '') {
                $image = ['kind' => 'keep', 'name' => monsterImportText($monsters[$id]['image'])];
            }
            $row['image'] = ['kind' => $image['kind'], 'name' => $image['name']];
        }
        $row['errors'] = $errors;
        $row['warnings'] = $warnings;
        $row['importable'] = $errors === [] && $id !== null && $target !== null;
        $row['expect'] = $row['importable'] ? $row['action'] . ':' . $id . ':' . $row['tab']['key'] . ':' . $row['subTab']['key'] : '';
        $rows[] = $row;
    }

    $create = [];
    foreach ($rows as $row) {
        if (!$row['importable']) continue;
        if ($row['tab']['create']) $create[$row['tab']['key']] ??= ['tab' => $row['tab']['name'], 'newTab' => true, 'subTabs' => []];
        if ($row['subTab']['create']) {
            $create[$row['tab']['key']] ??= ['tab' => $row['tab']['name'], 'newTab' => false, 'subTabs' => []];
            $create[$row['tab']['key']]['subTabs'][$row['subTab']['key']] = $row['subTab']['name'];
        }
    }
    $counts = ['new' => 0, 'update' => 0, 'blocked' => 0, 'warnings' => 0];
    foreach ($rows as $row) {
        if (!$row['importable']) $counts['blocked']++;
        elseif ($row['action'] === 'new') $counts['new']++;
        else $counts['update']++;
        if ($row['warnings']) $counts['warnings']++;
    }
    return [
        'fileName' => $fileName,
        'entries' => $rows,
        'createTabs' => array_values(array_map(static fn($item) => ['tab' => $item['tab'], 'newTab' => $item['newTab'], 'subTabs' => array_values($item['subTabs'])], $create)),
        'counts' => $counts,
    ];
}

/**
 * Applies the ticked, unblocked monsters to the data, in memory. Recomputes the plan first, so it
 * works on the data as it stands now; a row whose plan differs from the preview's is skipped.
 *
 * @param callable $storeImage fn(string $uploadName, string $monsterId): string  stored file name; throws when it cannot
 * @return array{data:array,results:list<array>,changed:bool,plan:array}
 */
function monsterImportApply(array $data, array $request, array $env, int $nowMs, callable $storeImage): array
{
    $plan = monsterImportPlan($data, $request, $env);
    $selected = array_flip(array_map('intval', array_filter(is_array($request['selected'] ?? null) ? $request['selected'] : [], 'is_numeric')));
    $expect = is_array($request['expect'] ?? null) ? $request['expect'] : [];
    $data['tabs'] = is_array($data['tabs'] ?? null) ? $data['tabs'] : [];
    $data['monsters'] = is_array($data['monsters'] ?? null) ? $data['monsters'] : [];
    $realKeys = [];
    $results = [];
    $changed = false;
    $made = 0;

    foreach ($plan['entries'] as $row) {
        $index = $row['index'];
        $base = ['index' => $index, 'name' => $row['name'], 'id' => $row['id']];
        if (!$row['importable']) { $results[] = $base + ['action' => 'skipped', 'reason' => 'Blocked: ' . implode(' ', $row['errors'])]; continue; }
        if (!isset($selected[$index])) { $results[] = $base + ['action' => 'skipped', 'reason' => 'Not ticked.']; continue; }
        $expected = monsterImportText($expect[(string) $index] ?? ($expect[$index] ?? null));
        if ($expected !== '' && $expected !== $row['expect']) {
            $results[] = $base + ['action' => 'skipped', 'reason' => 'The monsters changed since the preview (it would now be ' . ($row['action'] === 'new' ? 'new' : 'an update of ' . $row['id']) . ' in ' . $row['place'] . '). Preview again.'];
            continue;
        }

        // The tab and sub-tab, made now if the file asked for them.
        $tabKey = $row['tab']['key'];
        if (str_starts_with($tabKey, 'new:')) {
            if (!isset($realKeys[$tabKey])) {
                $made++;
                $newId = 'tab_' . $nowMs . '_' . $made;
                while (isset($data['tabs'][$newId])) { $made++; $newId = 'tab_' . $nowMs . '_' . $made; }
                $data['tabs'][$newId] = ['name' => $row['tab']['name'], 'subTabs' => []];
                $realKeys[$tabKey] = $newId;
            }
            $tabKey = $realKeys[$tabKey];
        }
        $subKey = $row['subTab']['key'];
        if (str_starts_with($subKey, 'new:')) {
            if (!isset($realKeys[$subKey])) {
                $made++;
                $newId = 'subtab_' . $nowMs . '_' . $made;
                while (isset($data['tabs'][$tabKey]['subTabs'][$newId])) { $made++; $newId = 'subtab_' . $nowMs . '_' . $made; }
                if (!is_array($data['tabs'][$tabKey]['subTabs'] ?? null)) $data['tabs'][$tabKey]['subTabs'] = [];
                $data['tabs'][$tabKey]['subTabs'][$newId] = ['name' => $row['subTab']['name'], 'monsters' => []];
                $realKeys[$subKey] = $newId;
            }
            $subKey = $realKeys[$subKey];
        }

        $id = (string) $row['id'];
        $entry = $request['entries'][$index];
        $monster = $entry['monster'];
        $old = is_array($data['monsters'][$id] ?? null) ? $data['monsters'][$id] : null;
        $notes = $row['warnings'];
        $image = $old ? monsterImportText($old['image'] ?? '') : '';
        if ($row['image']['kind'] === 'url') {
            $image = $row['image']['name'];
        } elseif ($row['image']['kind'] === 'sidecar') {
            try { $image = (string) $storeImage($row['image']['name'], $id); }
            catch (Throwable $error) { $notes[] = 'Picture "' . $row['image']['name'] . '" was not stored: ' . $error->getMessage(); }
        }
        $monster['image'] = $image;
        $monster['tabId'] = $tabKey;
        $monster['subTabId'] = $subKey;
        $monster['created'] = $old['created'] ?? ($monster['created'] ?? $nowMs);
        $monster['lastModified'] = $nowMs;
        $data['monsters'][$id] = $monster;

        // Listed in exactly one sub-tab: the target.
        foreach ($data['tabs'] as $tId => $tab) {
            if (!is_array($tab) || !is_array($tab['subTabs'] ?? null)) continue;
            foreach ($tab['subTabs'] as $sId => $sub) {
                if (!is_array($sub) || ((string) $tId === $tabKey && (string) $sId === $subKey)) continue;
                $list = is_array($sub['monsters'] ?? null) ? $sub['monsters'] : [];
                $kept = array_values(array_filter($list, static fn($m) => (string) $m !== $id));
                if (count($kept) !== count($list)) $data['tabs'][$tId]['subTabs'][$sId]['monsters'] = $kept;
            }
        }
        $list = is_array($data['tabs'][$tabKey]['subTabs'][$subKey]['monsters'] ?? null) ? $data['tabs'][$tabKey]['subTabs'][$subKey]['monsters'] : [];
        if (!in_array($id, array_map('strval', $list), true)) $list[] = $id;
        $data['tabs'][$tabKey]['subTabs'][$subKey]['monsters'] = array_values($list);

        $changed = true;
        $place = ($data['tabs'][$tabKey]['name'] ?? '') . ' / ' . ($data['tabs'][$tabKey]['subTabs'][$subKey]['name'] ?? '');
        $results[] = $base + ['action' => $row['action'] === 'new' ? 'created' : 'updated', 'match' => $row['match'], 'place' => $place,
            'moveFrom' => $row['moveFrom'], 'image' => $image, 'warnings' => $notes, 'tabId' => $tabKey, 'subTabId' => $subKey];
    }
    return ['data' => $data, 'results' => $results, 'changed' => $changed, 'plan' => $plan];
}
