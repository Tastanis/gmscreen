<?php
declare(strict_types=1);

/**
 * The key-guarded site upload: what it checks and what it does. See docs/site-upload.md.
 *
 * A standing way to add or replace maps and creatures on the live site without signing in. It is
 * as safe as the key file. The functions here do exactly three things and nothing else: file a
 * map picture, import a map package, import creature files. None of them reads back scenes,
 * characters, accounts or any other data beyond a short result and the names of folders and tabs.
 */

/** Wrong keys allowed in the window before every caller is turned away until it has passed. */
const SITE_UPLOAD_MAX_FAILURES = 8;
const SITE_UPLOAD_FAILURE_WINDOW = 900; // seconds
const SITE_UPLOAD_MAX_JSON_BYTES = 33554432; // 32 MB, as the Scenes screen's own import
const SITE_UPLOAD_MAX_CREATURE_BYTES = 4194304; // 4 MB for a batch of creature files

/** The private configuration, or null when the upload is switched off (the file is not there). */
function siteUploadConfig(string $path): ?array
{
    if (!is_file($path) || is_link($path)) return null;
    try { $config = require $path; } catch (Throwable $error) { return null; }
    return is_array($config) ? $config : null;
}

function siteUploadStateDir(array $config, string $configPath): string
{
    $dir = is_string($config['state_dir'] ?? null) && $config['state_dir'] !== '' ? $config['state_dir'] : dirname($configPath) . '/dnd-site-upload-state';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir;
}

/** Times of recent wrong keys, oldest first, with those outside the window dropped. */
function siteUploadRecentFailures(string $stateDir, int $now): array
{
    $raw = @file_get_contents($stateDir . '/failures.json');
    $times = is_string($raw) ? json_decode($raw, true) : [];
    if (!is_array($times)) $times = [];
    return array_values(array_filter($times, static fn($t) => is_int($t) && $t > $now - SITE_UPLOAD_FAILURE_WINDOW && $t <= $now));
}

function siteUploadRecordFailure(string $stateDir, int $now): void
{
    $handle = @fopen($stateDir . '/failures.lock', 'c');
    if ($handle === false) return;
    try {
        flock($handle, LOCK_EX);
        $times = siteUploadRecentFailures($stateDir, $now);
        $times[] = $now;
        @file_put_contents($stateDir . '/failures.json', json_encode(array_slice($times, -SITE_UPLOAD_MAX_FAILURES * 4)), LOCK_EX);
        @chmod($stateDir . '/failures.json', 0600);
    } finally { flock($handle, LOCK_UN); fclose($handle); }
}

/**
 * May this request go ahead? Returns [200, ''] or [status, message].
 * Only the SHA-256 of the key is kept on the server; the key is compared in constant time.
 * `$server` is $_SERVER.
 */
function siteUploadAuthorize(array $server, array $config, string $stateDir, int $now): array
{
    $loopback = in_array($server['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
    if (($server['HTTPS'] ?? '') !== 'on' && !(($config['allow_loopback_http'] ?? false) === true && $loopback)) return [403, 'HTTPS required.'];
    if (($server['REQUEST_METHOD'] ?? '') !== 'POST') return [405, 'POST required.'];
    if (count(siteUploadRecentFailures($stateDir, $now)) >= SITE_UPLOAD_MAX_FAILURES) return [429, 'Too many wrong keys. Try again in fifteen minutes.'];
    $key = $server['HTTP_X_GMSCREEN_UPLOAD_KEY'] ?? '';
    $expected = $config['key_sha256'] ?? '';
    $valid = is_string($expected) && preg_match('/^[a-f0-9]{64}$/D', $expected) === 1 && is_string($key) && strlen($key) >= 32 && strlen($key) <= 512
        && hash_equals($expected, hash('sha256', $key));
    if (!$valid) { siteUploadRecordFailure($stateDir, $now); return [403, 'Access denied.']; }
    return [200, ''];
}

function siteUploadSameName(string $a, string $b): bool
{
    $fold = static fn(string $text): string => function_exists('mb_strtolower') ? mb_strtolower(trim($text)) : strtolower(trim($text));
    return $fold($a) === $fold($b);
}

function siteUploadClip(string $value, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
}

/** The names of the Scenes list's folders, as the tool lists them. */
function siteUploadFolderNames(array $catalog): array
{
    return array_values(array_map(static fn($folder) => (string) ($folder['name'] ?? ''), $catalog['folders'] ?? []));
}

/**
 * Works out where a map goes before anything is written: which folder, and whether it is a new
 * scene or a newer version of one that exists. Pure: reads the catalog, changes nothing.
 * Throws InvalidArgumentException, in plain words, when the request should be refused.
 *
 * @return array{name:string,folderId:?string,folderName:?string,newFolder:?array,existing:?array}
 */
function siteUploadPlanMap(array $catalog, array $request): array
{
    $package = $request['package'] ?? null;
    if (!is_array($package)) throw new InvalidArgumentException('A scene package is required.');
    $name = trim((string) ($request['name'] ?? ($package['scene']['name'] ?? '')));
    if ($name === '') throw new InvalidArgumentException('The scene needs a name.');
    $name = siteUploadClip($name, 160);

    $folderId = null; $folderName = null; $newFolder = null;
    $wanted = trim((string) ($request['folder'] ?? ''));
    if ($wanted !== '') {
        $found = array_values(array_filter($catalog['folders'] ?? [], static fn($folder) => siteUploadSameName((string) ($folder['name'] ?? ''), $wanted)));
        if (count($found) > 1) throw new InvalidArgumentException('More than one folder is named "' . $wanted . '". Rename one in the Scenes list first.');
        if ($found) { $folderId = (string) $found[0]['id']; $folderName = (string) $found[0]['name']; }
        elseif (($request['createFolder'] ?? false) === true) {
            $folderName = siteUploadClip($wanted, 120);
            $newFolder = ['id'=>'fld_' . bin2hex(random_bytes(6)), 'name'=>$folderName, 'createdAt'=>date(DATE_ATOM)];
            $folderId = $newFolder['id'];
        } else {
            $names = siteUploadFolderNames($catalog);
            throw new InvalidArgumentException('There is no folder named "' . $wanted . '". ' . ($names ? 'The folders are: ' . implode(', ', $names) . '. ' : 'There are no folders yet. ') . 'Add --create-folder to make it.');
        }
    }

    $operationId = (string) ($request['operationId'] ?? '');
    $same = array_values(array_filter($catalog['items'] ?? [], static fn($scene) => siteUploadSameName((string) ($scene['name'] ?? ''), $name)));
    // A second try of the very same upload (a lost reply) is not a second copy.
    $retry = array_values(array_filter($same, static fn($scene) => ($scene['_importOperationId'] ?? null) === $operationId));
    if ($retry) return ['name'=>$name,'folderId'=>$folderId,'folderName'=>$folderName,'newFolder'=>$newFolder,'existing'=>null];
    if (count($same) > 1) throw new InvalidArgumentException(count($same) . ' scenes are named "' . $name . '". Rename or delete the extras in the Scenes list, so it is clear which one to replace.');
    if ($same && ($request['replace'] ?? false) !== true) {
        $in = null;
        foreach ($catalog['folders'] ?? [] as $folder) if (($folder['id'] ?? null) === ($same[0]['folderId'] ?? null)) $in = (string) $folder['name'];
        throw new InvalidArgumentException('A scene named "' . $name . '" already exists' . ($in !== null ? ' in the folder ' . $in : '') . '. Add --replace to update it in place, or give this one another name with --name.');
    }
    return ['name'=>$name,'folderId'=>$folderId,'folderName'=>$folderName,'newFolder'=>$newFolder,'existing'=>$same[0] ?? null];
}

/** What is in a package, for the short report. */
function siteUploadMapCounts(array $package): array
{
    $design = $package['domains']['sceneConfig']['environment'] ?? [];
    $walls = $design['walls']['value'] ?? [];
    return [
        'floors'=>1 + count($package['domains']['sceneConfig']['mapLevels']['levels'] ?? []),
        'walls'=>count($walls['segments'] ?? []),
        'breakableWalls'=>count(array_filter($walls['segments'] ?? [], static fn($edge) => isset($edge['material']))),
        'plates'=>count($walls['roofs'] ?? []),
        'ramps'=>count($walls['ramps'] ?? []),
        'zones'=>count($design['zones']['value']['zones'] ?? []),
        'tokens'=>count($package['domains']['placements'] ?? []),
    ];
}

/**
 * Imports a map package: a new scene, or (asked to replace) a newer version into the scene that
 * has its name. The caller holds the board lock. The import and its validation are the store's
 * own, the ones the Scenes screen uses; the scene list is the Scenes screen's own file.
 *
 * `$load` and `$persist` read and write the scene list (loadScenesPayload, persistScenes).
 *
 * @return array{result:array,events:list<array>}
 */
function siteUploadImportMap(array $request, SyncV2Store $store, callable $load, callable $persist): array
{
    $operationId = $request['operationId'] ?? null;
    if (!is_string($operationId) || !preg_match('/^[A-Za-z0-9._:-]{8,128}$/', $operationId)) throw new InvalidArgumentException('Invalid import operation ID.');
    $catalog = SceneImportCatalog::recover($store, $load(), $persist);
    $plan = siteUploadPlanMap($catalog, $request);
    $package = $request['package'];
    $package['scene']['name'] = $plan['name'];
    $counts = siteUploadMapCounts($package);

    // Asked first, before any picture is sent: would this be accepted, and what would it do?
    // The same checks as the real thing, and nothing written.
    if (($request['dryRun'] ?? false) === true) {
        SceneImportValidation::validate($package);
        $probe = $package; $probe['scene']['id'] = 'scn-source-dry-run-check';
        ScenePackage::prepareForNewScene($probe, 'scn-preview-validation');
        $folderName = $plan['folderName'];
        if ($folderName === null && $plan['existing'] !== null) foreach ($catalog['folders'] ?? [] as $folder) if (($folder['id'] ?? null) === ($plan['existing']['folderId'] ?? null)) $folderName = (string) $folder['name'];
        return ['result'=>['action'=>$plan['existing'] !== null ? 'replaced' : 'created','scene'=>['id'=>$plan['existing']['id'] ?? null,'name'=>$plan['name']],'folder'=>$folderName,
            'folderCreated'=>$plan['newFolder'] !== null,'counts'=>$counts,'kept'=>null,'onTheTable'=>false,'idempotent'=>false,'dryRun'=>true], 'events'=>[]];
    }

    if ($plan['existing'] !== null) {
        $sceneId = (string) $plan['existing']['id'];
        $done = $store->replaceSceneDesign($sceneId, $package, $operationId, 'GM', true);
        $catalog = $load();
        foreach ($catalog['items'] as $i => $scene) {
            if (($scene['id'] ?? null) !== $sceneId) continue;
            foreach (['mapUrl','thumbnailUrl','grid'] as $field) if (array_key_exists($field, $done['scene'])) $catalog['items'][$i][$field] = $done['scene'][$field];
            $catalog['items'][$i]['name'] = $plan['name'];
            if ($plan['folderId'] !== null) $catalog['items'][$i]['folderId'] = $plan['folderId'];
            $catalog['items'][$i]['updatedAt'] = gmdate('c');
        }
        if ($plan['newFolder'] !== null) $catalog['folders'][] = $plan['newFolder'];
        $persist($catalog);
        $folderName = $plan['folderName'];
        if ($folderName === null) foreach ($catalog['folders'] as $folder) if (($folder['id'] ?? null) === ($plan['existing']['folderId'] ?? null)) $folderName = (string) $folder['name'];
        return ['result'=>['action'=>'replaced','scene'=>['id'=>$sceneId,'name'=>$plan['name']],'folder'=>$folderName,'folderCreated'=>$plan['newFolder'] !== null,
            'counts'=>$counts,'kept'=>$done['kept'],'onTheTable'=>count($done['events']) > 1,'idempotent'=>$done['idempotent']], 'events'=>$done['idempotent'] ? [] : $done['events']];
    }

    $done = $store->installScenePackage($package, $operationId, 'GM', true);
    $sceneId = (string) $done['scene']['id'];
    if (!isset($store->getSnapshot()['state']['sceneConfig'][$sceneId])) throw new InvalidArgumentException('This import was already completed and its scene was later deleted. Upload the file again to create a new copy.');
    $catalog = SceneImportCatalog::recover($store, $load(), $persist);
    if ($plan['newFolder'] !== null) $catalog['folders'][] = $plan['newFolder'];
    foreach ($catalog['items'] as $i => $scene) {
        if (($scene['id'] ?? null) !== $sceneId) continue;
        if ($plan['folderId'] !== null) $catalog['items'][$i]['folderId'] = $plan['folderId'];
    }
    if ($plan['folderId'] !== null || $plan['newFolder'] !== null) $persist($catalog);
    return ['result'=>['action'=>'created','scene'=>['id'=>$sceneId,'name'=>(string) $done['scene']['name']],'folder'=>$plan['folderName'],'folderCreated'=>$plan['newFolder'] !== null,
        'counts'=>$counts,'kept'=>null,'onTheTable'=>false,'idempotent'=>$done['idempotent']], 'events'=>$done['idempotent'] ? [] : [$done['event']]];
}

/** The monster creator's tabs and their sub-tabs, by name, as the tool lists them. */
function siteUploadTabNames(array $data): array
{
    $out = [];
    foreach ($data['tabs'] ?? [] as $tab) {
        if (!is_array($tab)) continue;
        $out[] = ['name'=>(string) ($tab['name'] ?? ''), 'subTabs'=>array_values(array_map(static fn($sub) => (string) ($sub['name'] ?? ''), array_filter($tab['subTabs'] ?? [], 'is_array')))];
    }
    return $out;
}

/**
 * Puts creatures into the monster creator's data, in memory. Returns the new data and one result
 * for each creature. A creature whose name is already there is replaced only when asked to, and
 * then keeps its id, its place in the tabs and, if the new file names none, its portrait.
 *
 * `$entries` are [{file, monster, requestedId?}], each `monster` already put through the monster
 * creator's own import and checker by the tool.
 *
 * @return array{data:array,results:list<array>,changed:bool}
 */
function siteUploadMergeCreatures(array $data, array $entries, array $options, int $nowMs): array
{
    $data['tabs'] = is_array($data['tabs'] ?? null) ? $data['tabs'] : [];
    $data['monsters'] = is_array($data['monsters'] ?? null) ? $data['monsters'] : [];
    $results = []; $changed = false;
    $tabName = trim((string) ($options['tab'] ?? '')) ?: 'Imported';
    $subName = trim((string) ($options['subTab'] ?? '')) ?: 'General';
    $namedTab = trim((string) ($options['tab'] ?? '')) !== '';

    foreach ($entries as $index => $entry) {
        $file = is_string($entry['file'] ?? null) ? siteUploadClip($entry['file'], 200) : 'creature ' . ($index + 1);
        $monster = $entry['monster'] ?? null;
        $name = is_array($monster) ? trim((string) ($monster['name'] ?? '')) : '';
        if ($name === '' || !is_array($monster['abilities'] ?? null)) { $results[] = ['file'=>$file,'action'=>'refused','reason'=>'It is not a creature the monster creator can read (no name, or no abilities).']; continue; }
        $same = array_keys(array_filter($data['monsters'], static fn($existing) => is_array($existing) && siteUploadSameName((string) ($existing['name'] ?? ''), $name)));
        if (count($same) > 1) { $results[] = ['file'=>$file,'name'=>$name,'action'=>'refused','reason'=>count($same) . ' creatures are already named "' . $name . '". Delete the extras in the monster creator, so it is clear which one to replace.']; continue; }
        if ($same && ($options['replace'] ?? false) !== true) { $results[] = ['file'=>$file,'name'=>$name,'action'=>'refused','reason'=>'A creature named "' . $name . '" already exists. Add --replace to put this one in its place.']; continue; }

        if ($same) {
            $id = (string) $same[0]; $old = $data['monsters'][$id];
            foreach (['tabId','subTabId','created'] as $keep) if (array_key_exists($keep, $old)) $monster[$keep] = $old[$keep];
            if (trim((string) ($monster['image'] ?? '')) === '' && isset($old['image'])) $monster['image'] = $old['image'];
            $monster['lastModified'] = $nowMs;
            $data['monsters'][$id] = $monster; $changed = true;
            $where = null;
            foreach ($data['tabs'] as $tab) foreach (($tab['subTabs'] ?? []) as $sub) if (in_array($id, $sub['monsters'] ?? [], true)) $where = ($tab['name'] ?? '') . ' / ' . ($sub['name'] ?? '');
            $results[] = ['file'=>$file,'name'=>$name,'action'=>'replaced','id'=>$id,'tab'=>$where,'abilities'=>array_sum(array_map('count', array_filter($monster['abilities'], 'is_array')))];
            continue;
        }

        // A new creature: into the named tab, or "Imported" when none is named.
        $tabId = null;
        foreach ($data['tabs'] as $key => $tab) if (is_array($tab) && siteUploadSameName((string) ($tab['name'] ?? ''), $tabName)) { $tabId = (string) $key; break; }
        if ($tabId === null) {
            if ($namedTab && ($options['createTab'] ?? false) !== true) {
                $names = array_column(siteUploadTabNames($data), 'name');
                $results[] = ['file'=>$file,'name'=>$name,'action'=>'refused','reason'=>'There is no tab named "' . $tabName . '". ' . ($names ? 'The tabs are: ' . implode(', ', $names) . '. ' : '') . 'Add --create-tab to make it.'];
                continue;
            }
            $tabId = 'tab_' . $nowMs . '_' . count($data['tabs']);
            $data['tabs'][$tabId] = ['name'=>siteUploadClip($tabName, 120), 'subTabs'=>[]];
        }
        $subId = null;
        foreach ($data['tabs'][$tabId]['subTabs'] ?? [] as $key => $sub) if (is_array($sub) && siteUploadSameName((string) ($sub['name'] ?? ''), $subName)) { $subId = (string) $key; break; }
        if ($subId === null) {
            $subId = 'subtab_' . $nowMs . '_' . count($data['tabs'][$tabId]['subTabs'] ?? []);
            $data['tabs'][$tabId]['subTabs'][$subId] = ['name'=>siteUploadClip($subName, 120), 'monsters'=>[]];
        }
        $requested = is_string($entry['requestedId'] ?? null) && preg_match('/^[A-Za-z0-9_-]{1,80}$/', $entry['requestedId']) ? $entry['requestedId'] : null;
        $base = $requested ?? ('monster_' . (trim((string) preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_') ?: 'creature'));
        $id = $base; $n = 2;
        while (isset($data['monsters'][$id])) $id = $base . '_' . $n++;
        $monster['tabId'] = $tabId; $monster['subTabId'] = $subId;
        $monster['created'] = $monster['created'] ?? $nowMs; $monster['lastModified'] = $nowMs;
        $data['monsters'][$id] = $monster;
        $data['tabs'][$tabId]['subTabs'][$subId]['monsters'] = array_values(array_unique([...($data['tabs'][$tabId]['subTabs'][$subId]['monsters'] ?? []), $id]));
        $changed = true;
        $results[] = ['file'=>$file,'name'=>$name,'action'=>'created','id'=>$id,'tab'=>$data['tabs'][$tabId]['name'] . ' / ' . $data['tabs'][$tabId]['subTabs'][$subId]['name'],
            'abilities'=>array_sum(array_map('count', array_filter($monster['abilities'], 'is_array')))];
    }
    return ['data'=>$data,'results'=>$results,'changed'=>$changed];
}
