<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Character sheets seem to be changing without permission. I need a scan to find out
// whats working and whats broken ... zepha's might and agility were just randomly reset to zero. and when they did
// a respite, i think it didnt give him back any of his recoveries or something."
//
// Every save sent the WHOLE character as the page held it, and the stored record was replaced with it. An old
// copy of a sheet that saved rolled newer values back and stored its blanks. Now a page sends only the fields it
// changed, a whole-sheet save (all a page from before the change can send) is refused untouched, a respite is
// worked out from the stored record, and every write is noted. These run the real request handler, copied with
// its own files into an empty folder so the site's sheets are not touched. The page's side is
// assets/js/ui/__tests__/sheet-changes.test.mjs.
function sheetCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$source = realpath(__DIR__ . '/../../../../character_sheet');
$site = sys_get_temp_dir() . '/vtt-sheets-' . bin2hex(random_bytes(6));
mkdir($site . '/data', 0777, true);
foreach (['handler.php', 'AtomicJsonFile.php', 'CharacterWriteReceipts.php', 'SheetChanges.php'] as $file) copy($source . '/' . $file, $site . '/' . $file);
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
// One request to the copied handler, as a signed-in user: its JSON answer.
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
$stored = static fn () => json_decode((string) file_get_contents($site . '/data/character_sheets.json'), true);
$fields = static fn (array $changes) => ['action'=>'save-fields', 'character'=>'zepha', 'changes'=>json_encode($changes)];

try {
    // Zepha's sheet as his player set it up on one device.
    $loaded = $ask('zepha', 'POST', ['action'=>'load', 'character'=>'zepha']);
    sheetCheck(($loaded['success'] ?? false) === true && $loaded['data']['hero']['stats']['might'] === 0, 'A new sheet loads');
    $setup = $ask('zepha', 'POST', $fields([
        ['path'=>['hero', 'name'], 'value'=>'Zepha'], ['path'=>['hero', 'stats', 'might'], 'value'=>2], ['path'=>['hero', 'stats', 'agility'], 'value'=>1],
        ['path'=>['hero', 'vitals', 'recoveriesMax'], 'value'=>8], ['path'=>['hero', 'vitals', 'staminaMax'], 'value'=>57],
        ['path'=>['hero', 'vitals', 'currentRecoveries'], 'value'=>1], ['path'=>['hero', 'vitals', 'currentStamina'], 'value'=>33],
        ['path'=>['hero', 'victories'], 'value'=>3], ['path'=>['hero', 'xp'], 'value'=>10],
    ]));
    sheetCheck($setup === ['success'=>true, 'applied'=>9], 'The page says what it changed and those fields are set: ' . json_encode($setup));
    $zepha = $stored()['zepha']['hero'];
    sheetCheck($zepha['stats']['might'] === 2 && $zepha['stats']['agility'] === 1 && $zepha['vitals']['recoveriesMax'] === 8 && $zepha['name'] === 'Zepha', 'and they are what is stored');

    // THE FAULT. A second copy of the sheet, open since before any of that, still showing blank Might and Agility.
    // What a page from before the change sends: the whole sheet as it holds it.
    $before = file_get_contents($site . '/data/character_sheets.json');
    $stale = $loaded['data']; $stale['hero']['stats']['might'] = ''; $stale['hero']['stats']['agility'] = ''; $stale['hero']['wealth'] = '3';
    $refused = $ask('zepha', 'POST', ['action'=>'save', 'character'=>'zepha', 'data'=>json_encode($stale)]);
    sheetCheck(($refused['success'] ?? null) === false && ($refused['reload'] ?? null) === true && str_contains($refused['error'], 'Reload the page'), 'A whole-sheet save is refused, and says to reload: ' . json_encode($refused));
    sheetCheck(file_get_contents($site . '/data/character_sheets.json') === $before, 'and it changes nothing at all: not the blanks, not the one field it did change');
    // What a page of today sends from that same old copy: only the field its player touched.
    $ask('zepha', 'POST', $fields([['path'=>['hero', 'wealth'], 'value'=>'3']]));
    $zepha = $stored()['zepha']['hero'];
    sheetCheck($zepha['wealth'] === '3' && $zepha['stats']['might'] === 2 && $zepha['stats']['agility'] === 1 && $zepha['vitals']['recoveriesMax'] === 8, 'An old copy that changes one field changes that field and rolls nothing back: ' . json_encode($zepha['stats']));
    // A characteristic is never set to nothing, even if a page asks.
    $ask('zepha', 'POST', $fields([['path'=>['hero', 'stats', 'might'], 'value'=>''], ['path'=>['hero', 'stats', 'agility'], 'value'=>null], ['path'=>['hero', 'stats', 'reason'], 'value'=>3]]));
    $stats = $stored()['zepha']['hero']['stats'];
    sheetCheck($stats['might'] === 2 && $stats['agility'] === 1 && $stats['reason'] === 3, 'An emptied Might or Agility keeps its stored score; a score that is given is set: ' . json_encode($stats));
    sheetCheck($ask('zepha', 'POST', $fields([]))['applied'] === 0, 'Nothing changed, nothing written');

    // RESPITE, asked from a page that is behind (it never saw the maximums): the server works it out from the record.
    $rested = $ask('zepha', 'POST', ['action'=>'respite', 'character'=>'zepha']);
    $hero = $stored()['zepha']['hero'];
    sheetCheck(($rested['success'] ?? false) === true && $hero['vitals']['currentRecoveries'] === 8 && $hero['vitals']['currentStamina'] === 57, 'A respite gives back every Recovery and all Stamina, from the stored maximums: ' . json_encode($hero['vitals']));
    sheetCheck($hero['xp'] === 13 && $hero['victories'] === 0 && $rested['victories'] === 3, 'and turns Victories into XP: ' . json_encode([$hero['xp'], $hero['victories']]));
    sheetCheck($hero['stats']['might'] === 2 && $hero['wealth'] === '3' && $rested['data']['hero']['vitals']['currentRecoveries'] === 8 && $rested['notes'] === [], 'and touches nothing else; the page is handed the sheet as it now is');
    // A sheet with no Recoveries maximum is not set to none: it is told.
    $ask('GM', 'POST', ['action'=>'save-fields', 'character'=>'cal', 'changes'=>json_encode([['path'=>['hero', 'vitals', 'currentRecoveries'], 'value'=>4], ['path'=>['hero', 'vitals', 'staminaMax'], 'value'=>40], ['path'=>['hero', 'vitals', 'currentStamina'], 'value'=>12]])]);
    $cal = $ask('GM', 'POST', ['action'=>'respite', 'character'=>'cal']);
    $calVitals = $stored()['cal']['hero']['vitals'];
    sheetCheck($calVitals['currentRecoveries'] === 4 && $calVitals['currentStamina'] === 40 && count($cal['notes']) === 1 && str_contains($cal['notes'][0], 'no Recoveries maximum'), 'With no Recoveries maximum the Recoveries are left alone and the page is told: ' . json_encode([$calVitals, $cal['notes']]));

    // Who may: a player his own sheet, the Director any; nobody the server's own parts.
    sheetCheck(($ask('cal', 'POST', $fields([['path'=>['hero', 'wealth'], 'value'=>'99']]))['error'] ?? '') === 'Permission denied', 'One player cannot change another\'s sheet');
    sheetCheck(($ask('GM', 'POST', $fields([['path'=>['hero', 'wealth'], 'value'=>'4']]))['success'] ?? false) === true, 'The Director can');
    foreach ([[['path'=>['_vttOperations', 'x'], 'value'=>1]], [['path'=>['hero', '__proto__'], 'value'=>1]], [['path'=>[], 'value'=>1]], [['path'=>'hero.name', 'value'=>1]], [['value'=>1]], 'hero'] as $k => $bad) {
        $answer = $ask('zepha', 'POST', is_array($bad) ? $fields($bad) : ['action'=>'save-fields', 'character'=>'zepha', 'changes'=>json_encode($bad)]);
        sheetCheck(($answer['success'] ?? null) === false, "A malformed change ($k) is refused: " . json_encode($answer));
    }
    $ask('zepha', 'POST', $fields([['path'=>['hero', 'heroTokens'], 'value'=>[true, true]]]));
    sheetCheck(($stored()['zepha']['hero']['heroTokens'] ?? [false, false]) !== [true, true], 'Hero tokens are the party\'s and are not set from a sheet save: ' . json_encode($stored()['zepha']['hero']['heroTokens'] ?? null));

    // The record of what changed, and the day's copy.
    $lines = array_values(array_filter(explode("\n", (string) file_get_contents($site . '/data/sheet_changes.json'))));
    $first = json_decode($lines[0], true);
    sheetCheck($first['by'] === 'zepha' && $first['request'] === 'save-fields' && $first['character'] === 'zepha', 'Each write is noted: who, which request, which character: ' . json_encode([$first['by'], $first['request']]));
    $might = array_values(array_filter($first['changes'], static fn ($c) => $c['path'] === 'hero.stats.might'))[0] ?? null;
    sheetCheck($might === ['path'=>'hero.stats.might', 'from'=>0, 'to'=>2], 'with each field\'s old and new value: ' . json_encode($might));
    $respite = array_values(array_filter(array_map(static fn ($l) => json_decode($l, true), $lines), static fn ($e) => $e['request'] === 'respite' && $e['character'] === 'zepha'))[0];
    sheetCheck(in_array(['path'=>'hero.vitals.currentRecoveries', 'from'=>1, 'to'=>8], $respite['changes'], true), 'The respite is in it too: ' . json_encode($respite['changes']));
    sheetCheck(count(glob($site . '/data/backups/daily_character_sheets_*.json')) === 1, 'One copy of the sheets is kept for the day');
    sheetCheck(str_ends_with('sheet_changes.json', '.json') && str_ends_with('daily_character_sheets_20261013.json', '.json'), 'Both are .json, which the data folder\'s keep-out rule covers');
} finally { $remove($site); }

// The parts by themselves.
require_once $source . '/SheetChanges.php';
$sheet = ['hero'=>['name'=>'A', 'stats'=>['might'=>2], 'vitals'=>['recoveriesMax'=>'8', 'currentRecoveries'=>0, 'staminaMax'=>0, 'currentStamina'=>5], 'victories'=>'2', 'xp'=>''], 'features'=>[['name'=>'x']]];
$changed = SheetChanges::apply($sheet, [['path'=>['features'], 'value'=>[['name'=>'y'], ['name'=>'z']]], ['path'=>['sidebar', 'lists', 'languages'], 'value'=>['Caelian']]]);
sheetCheck($changed['features'] === [['name'=>'y'], ['name'=>'z']] && $changed['sidebar']['lists']['languages'] === ['Caelian'] && $changed['hero'] === $sheet['hero'], 'A list is set whole; a part that was not there is made; the rest is as it was');
$rested = SheetChanges::respite($sheet);
sheetCheck($rested['sheet']['hero']['vitals']['currentRecoveries'] === 8 && $rested['sheet']['hero']['vitals']['currentStamina'] === 5 && $rested['sheet']['hero']['xp'] === 2 && count($rested['notes']) === 1, 'A respite reads numbers kept as text, and leaves Stamina alone when its maximum is nought');
$differences = SheetChanges::differences(['hero'=>['name'=>'A', 'level'=>3, 'list'=>[1, 2]], '_vttOperations'=>['a'=>1]], ['hero'=>['name'=>'A', 'level'=>'3', 'list'=>[1, 2, 3]], '_vttOperations'=>['b'=>2]]);
sheetCheck($differences === [['path'=>'hero.list', 'from'=>'[2 entries]', 'to'=>'[3 entries]']], 'The record notes what truly differs: not 3 against "3", not the server\'s receipts; a list by its size: ' . json_encode($differences));

echo "sheet field saves: only what a page changed is set; a whole-sheet save is refused; respite is the server's; every write is noted\n";
