<?php
declare(strict_types=1);
// Live editing of one hero's sheet (October 2026, approved by the Director): two people with the same sheet open see
// each other's changes at once; while someone edits a field it is locked on the other screens ("Cal is editing"),
// released when they leave it or 20 seconds after the last heartbeat; a save carries the revision the page last
// read, and a field somebody else changed since is not overwritten (the save is refused and the page reloads).
// Also temporary Stamina, its own number, through the handler. These run the real request handler in an empty folder.
function liveCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$source = realpath(__DIR__ . '/../../../../character_sheet');
$root = sys_get_temp_dir() . '/vtt-live-' . bin2hex(random_bytes(6));
$site = $root . '/character_sheet';
mkdir($site . '/data', 0777, true);
mkdir($root . '/includes', 0777, true);
copy($source . '/../includes/players.php', $root . '/includes/players.php');
foreach (['handler.php', 'AtomicJsonFile.php', 'CharacterWriteReceipts.php', 'SheetChanges.php'] as $file) copy($source . '/' . $file, $site . '/' . $file);
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
$ask = static function (string $user, string $method, array $fields) use ($site): array {
    $script = $site . '/ask-' . bin2hex(random_bytes(4)) . '.php';
    file_put_contents($script, '<?php session_save_path(' . var_export($site, true) . '); session_start(); $_SESSION["user"] = ' . var_export($user, true) . '; $_SERVER["REQUEST_METHOD"] = ' . var_export($method, true)
        . '; $' . ($method === 'POST' ? '_POST' : '_GET') . ' = ' . var_export($fields, true) . '; require ' . var_export($site . '/handler.php', true) . ';');
    $out = []; exec(escapeshellarg(PHP_BINARY) . ' -d display_errors=0 ' . escapeshellarg($script) . ' 2>&1', $out);
    @unlink($script);
    $answer = json_decode(implode("\n", $out), true);
    if (!is_array($answer)) throw new RuntimeException('The handler did not answer in JSON: ' . substr(implode("\n", $out), 0, 300));
    return $answer;
};
$save = static fn (string $user, array $values, ?int $base = null) => $ask($user, 'POST', ['action'=>'save-fields', 'character'=>'cal', 'changes'=>json_encode(array_map(
    static fn ($path, $value) => ['path'=>explode('.', $path), 'value'=>$value], array_keys($values), $values)), ...($base !== null ? ['baseRevision'=>(string) $base] : [])]);
$hero = static fn () => json_decode((string) file_get_contents($site . '/data/character_sheets.json'), true)['cal']['hero'];

try {
    // ---- revisions ----------------------------------------------------------------------------
    $first = $ask('cal', 'GET', ['action'=>'load', 'character'=>'cal']);
    liveCheck($first['success'] === true && is_int($first['revision']), 'A load says the revision: ' . json_encode(array_keys($first)));
    $base = $first['revision'];
    $saved = $save('cal', ['hero.name'=>'Cal', 'hero.vitals.staminaMax'=>36, 'hero.vitals.currentStamina'=>30], $base);
    liveCheck($saved['success'] === true && $saved['revision'] === $base + 1, 'A save with a revision is told the new one: ' . json_encode($saved));
    $poll = $ask('GM', 'GET', ['action'=>'live', 'character'=>'cal']);
    liveCheck($poll['success'] === true && $poll['revision'] === $base + 1 && $poll['locks'] === [], 'The poll sees it: ' . json_encode($poll));
    liveCheck(($ask('sharon', 'GET', ['action'=>'live', 'character'=>'cal'])['success'] ?? false) === true, 'Any signed-in player may poll (the map panel shows any hero)');

    // ---- a stale save is refused, not written -------------------------------------------------
    // The Director's page read revision $base+1 and changes the class; Cal's page, still at $base+1, then saves the class too.
    $director = $save('GM', ['hero.class'=>'Talent'], $base + 1);
    liveCheck($director['success'] === true, 'The first save goes in');
    $stale = $save('cal', ['hero.class'=>'Elementalist'], $base + 1);
    liveCheck($stale['success'] === false && ($stale['stale'] ?? false) === true && $stale['conflicts'] === ['hero.class'] && $hero()['class'] === 'Talent', 'A save of a field changed since the page read it is refused: ' . json_encode($stale));
    $other = $save('cal', ['hero.ancestry'=>'Human'], $base + 1);
    liveCheck($other['success'] === true && $hero()['ancestry'] === 'Human', 'A field nobody else changed still saves from that page');
    $list = $save('GM', ['actions.mains'=>[['name'=>'Mind Spike']]], $other['revision']);
    $listStale = $save('cal', ['actions.mains'=>[['name'=>'Old copy']]], $other['revision']);
    liveCheck(($listStale['stale'] ?? false) === true && $hero() !== null, 'A list (abilities) is one field: a stale copy of it is refused too');
    $counter = $ask('cal', 'POST', ['action'=>'save-fields', 'character'=>'cal', 'baseRevision'=>'0', 'changes'=>json_encode([['path'=>['hero', 'surges'], 'value'=>1, 'from'=>0]])]);
    liveCheck($counter['success'] === true, 'A counter moved by an amount is never stale: amounts add up');
    $oldPage = $save('cal', ['hero.class'=>'Null']);
    liveCheck($oldPage === ['success'=>true, 'applied'=>1], 'A page that sends no revision is answered as before: ' . json_encode($oldPage));

    // ---- field locks --------------------------------------------------------------------------
    $taken = $ask('cal', 'POST', ['action'=>'lock', 'character'=>'cal', 'field'=>'hero.complication']);
    liveCheck($taken['success'] === true && $taken['locked'] === true && $taken['expiresIn'] === 20, 'Cal takes the lock: ' . json_encode($taken));
    $refused = $ask('GM', 'POST', ['action'=>'lock', 'character'=>'cal', 'field'=>'hero.complication']);
    liveCheck($refused['success'] === false && $refused['locked'] === false && $refused['holder']['user'] === 'cal' && str_contains($refused['error'], 'is editing'), 'Another person is refused and told who: ' . json_encode($refused));
    $seen = $ask('GM', 'GET', ['action'=>'live', 'character'=>'cal']);
    liveCheck(count($seen['locks']) === 1 && $seen['locks'][0]['field'] === 'hero.complication' && $seen['locks'][0]['mine'] === false, 'The poll shows the lock to others: ' . json_encode($seen['locks']));
    $blocked = $save('GM', ['hero.complication'=>'Mine now'], $seen['revision']);
    liveCheck($blocked['success'] === false && ($blocked['locked'] ?? false) === true && ($hero()['complication'] ?? '') === '', 'A save into a field somebody holds is refused: ' . json_encode($blocked));
    liveCheck($save('cal', ['hero.complication'=>'Cursed'], $seen['revision'])['success'] === true, 'The holder saves');
    liveCheck(($ask('cal', 'POST', ['action'=>'heartbeat', 'character'=>'cal', 'field'=>'hero.complication'])['locked'] ?? false) === true, 'A heartbeat renews it');
    $released = $ask('cal', 'POST', ['action'=>'unlock', 'character'=>'cal', 'field'=>'hero.complication']);
    liveCheck($released['released'] === true && ($ask('GM', 'POST', ['action'=>'lock', 'character'=>'cal', 'field'=>'hero.complication'])['locked'] ?? false) === true, 'Released on blur, the Director may take it');
    liveCheck(($ask('sharon', 'POST', ['action'=>'lock', 'character'=>'cal', 'field'=>'hero.name'])['error'] ?? '') === 'Permission denied', 'Taking a lock on another player\'s sheet is a write: refused');
    liveCheck(($ask('cal', 'POST', ['action'=>'lock', 'character'=>'cal', 'field'=>'../x'])['success'] ?? true) === false, 'A field name must be plain');

    // ---- temporary Stamina through the handler ------------------------------------------------
    $gain = $ask('cal', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'gainTemp'=>'6']);
    liveCheck($gain['success'] === true && $gain['tempStamina'] === 6 && $hero()['vitals']['tempStamina'] === 6, 'Temporary Stamina gained: ' . json_encode($gain));
    $lower = $ask('cal', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'gainTemp'=>'4']);
    liveCheck($lower['tempStamina'] === 6, 'keeps the higher');
    $hit = $ask('cal', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'staminaDelta'=>'-8']);
    liveCheck($hit['tempStamina'] === 0 && $hit['currentStamina'] === 28, 'Damage takes temporary Stamina first: ' . json_encode($hit));
    $ask('cal', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'gainTemp'=>'5']);
    $heal = $ask('cal', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'staminaDelta'=>'50']);
    liveCheck($heal['currentStamina'] === 36 && $heal['tempStamina'] === 5, 'Healing stops at the maximum and leaves temporary Stamina: ' . json_encode($heal));
    $token = $ask('GM', 'POST', ['action'=>'sync-stamina', 'character'=>'cal', 'source'=>'vtt', 'delta'=>'-1', 'tempStamina'=>'0']);
    liveCheck($token['success'] === true && $token['tempStamina'] === 0 && $token['currentStamina'] === 35, 'A token\'s write carries its temporary Stamina: ' . json_encode($token));
    $read = $ask('GM', 'GET', ['action'=>'sync-stamina', 'character'=>'cal']);
    liveCheck(array_key_exists('tempStamina', $read), 'and its read says it');
    $ask('cal', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'gainTemp'=>'7']);
    $ended = $ask('GM', 'POST', ['action'=>'sync-vitals', 'character'=>'cal', 'source'=>'vtt', 'tempStamina'=>'0']);
    liveCheck($ended['tempStamina'] === 0 && $hero()['vitals']['tempStamina'] === 0, 'The end of combat sets it to none');
    // An old sheet with Stamina above the maximum reads as temporary Stamina.
    $data = json_decode((string) file_get_contents($site . '/data/character_sheets.json'), true);
    $data['cal']['hero']['vitals']['currentStamina'] = 41; unset($data['cal']['hero']['vitals']['tempStamina']);
    file_put_contents($site . '/data/character_sheets.json', json_encode($data));
    $migrated = $ask('cal', 'GET', ['action'=>'load', 'character'=>'cal'])['data']['hero']['vitals'];
    liveCheck($migrated['currentStamina'] === 36 && $migrated['tempStamina'] === 5, 'Over-max Stamina loads as temporary Stamina: ' . json_encode($migrated));
    $party = $ask('GM', 'GET', ['action'=>'party-vitals']);
    liveCheck(($party['party']['cal']['tempStamina'] ?? null) === 5, 'The party read gives it too');
} finally { $remove($root); }

// The lock record by itself: a lock lapses 20 seconds after its last heartbeat.
$dir = sys_get_temp_dir() . '/vtt-live-unit-' . bin2hex(random_bytes(4));
mkdir($dir);
require_once $source . '/SheetChanges.php';
try {
    $file = $dir . '/character_sheets.json';
    file_put_contents($file, '{}');
    liveCheck(SheetLive::lock($dir, 'cal', 'hero.name', 'cal', 'Cal', 1000)['locked'] === true, 'taken at 1000');
    liveCheck(SheetLive::lock($dir, 'cal', 'hero.name', 'GM', 'GM', 1019)['locked'] === false, 'held at 1019');
    liveCheck(SheetLive::lock($dir, 'cal', 'hero.name', 'GM', 'GM', 1020)['locked'] === true, 'lapsed at 1020: the next person takes it');
    liveCheck(SheetLive::state($dir, $file, 'cal', 'cal', 1041)['locks'] === [], 'and it lapses for them too with no heartbeat');
} finally { $remove($dir); }

echo "sheet live: revisions, stale saves refused, field locks, temporary Stamina: ok\n";
