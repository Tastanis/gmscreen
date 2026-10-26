<?php
declare(strict_types=1);
// Brandon, October 2026: "Idk why you would have a condition that is in your character sheet and not in the vtt or
// vice versa. So probably merge them."
//
// The sheet's side of one condition list (handler.php sync-conditions): while the hero is on the map the map writes
// the sheet's mirror of the token's list, with the token's revision, so an older write never rolls a newer one back;
// with no token the sheet edits its own list, refused when somebody changed it since the page read it. These run the
// real request handler in an empty folder, as sheet-counters.test.php does.
function conditionSyncCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$source = realpath(__DIR__ . '/../../../../character_sheet');
$root = sys_get_temp_dir() . '/vtt-sheet-conditions-' . bin2hex(random_bytes(6));
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
$hero = static fn (string $who = 'cal') => json_decode((string) file_get_contents($site . '/data/character_sheets.json'), true)[$who]['hero'];
$live = static fn (string $who = 'cal') => (int) ($ask('GM', 'GET', ['action' => 'live', 'character' => $who])['revision'] ?? -1);
$write = static fn (string $user, array $fields) => $ask($user, 'POST', ['action' => 'sync-conditions', 'character' => 'cal', ...$fields]);
$list = static fn (array ...$conditions) => json_encode($conditions);
$slowedEot = ['name' => 'Slowed', 'duration' => ['type' => 'end-of-turn']];
$prone = ['name' => 'Prone', 'duration' => ['type' => 'save-ends']];

try {
    // An old sheet: free text, as the classic sheet stored it.
    $ask('GM', 'POST', ['action' => 'save-fields', 'character' => 'cal', 'changes' => json_encode([
        ['path' => ['hero', 'name'], 'value' => 'Cal'], ['path' => ['hero', 'vitals', 'staminaMax'], 'value' => 30],
        ['path' => ['hero', 'conditions'], 'value' => ['Slowed, save ends', 'custom thing']],
    ])]);
    conditionSyncCheck($hero()['conditions'] === ['Slowed, save ends', 'custom thing'], 'The old free text is left as it is until the list next changes (read leniently by the pages)');
    // The stamina read a token makes when placed carries the sheet's conditions (a new token with none takes them).
    $read = $ask('GM', 'GET', ['action' => 'sync-stamina', 'character' => 'cal']);
    conditionSyncCheck(($read['conditions'] ?? null) === ['Slowed, save ends', 'custom thing'], 'A placed token is given the sheet\'s conditions: ' . json_encode($read));

    // ---- the hero on the map: the token's list, mirrored -------------------------------------------------
    $answer = $write('sharon', ['source' => 'vtt', 'conditions' => $list($slowedEot), 'placementId' => 'cal-token', 'revision' => '5']);
    conditionSyncCheck($answer['success'] === true && $answer['applied'] === true && $hero()['conditions'] === [$slowedEot], 'Any map user\'s page writes the mirror of the token\'s list, as for Stamina: ' . json_encode($answer));
    conditionSyncCheck($hero()['conditionsSource'] === ['placementId' => 'cal-token', 'revision' => 5], 'with the token it mirrors');
    // A slower page sends revision 4 (the token as it was before): not taken.
    $stale = $write('GM', ['source' => 'vtt', 'conditions' => $list(), 'placementId' => 'cal-token', 'revision' => '4']);
    conditionSyncCheck(($stale['stale'] ?? false) === true && $hero()['conditions'] === [$slowedEot], 'An older revision of the token never rolls the mirror back');
    // The same list again (the Director's page and the hero's player's page both write): nothing written.
    $before = $live();
    $same = $write('cal', ['source' => 'vtt', 'conditions' => $list($slowedEot), 'placementId' => 'cal-token', 'revision' => '5']);
    conditionSyncCheck(($same['applied'] ?? true) === false && $live() === $before, 'The same list again is answered and not written (no reload anywhere, no loop)');
    // Removed on the token: the mirror follows.
    $write('GM', ['source' => 'vtt', 'conditions' => $list($prone), 'placementId' => 'cal-token', 'revision' => '6']);
    conditionSyncCheck($hero()['conditions'] === [$prone] && $live() === $before + 1, 'A newer token list replaces the mirror, and pages showing the sheet are told');
    // A new token of the hero (placed again): its revisions start again.
    $write('GM', ['source' => 'vtt', 'conditions' => $list(), 'placementId' => 'cal-token-2', 'revision' => '1']);
    conditionSyncCheck($hero()['conditions'] === [] && $hero()['conditionsSource']['placementId'] === 'cal-token-2', 'Another token of the hero is followed from its first revision');
    // Junk is dropped, names are kept as given, at most one of each.
    $write('GM', ['source' => 'vtt', 'conditions' => json_encode([['name' => ' Dazed ', 'duration' => 'nonsense'], ['nope' => 1], 'text', ['name' => 'Dazed'], ['name' => 'hiddenEffect']]), 'placementId' => 'cal-token-2', 'revision' => '2']);
    conditionSyncCheck($hero()['conditions'] === [['name' => 'Dazed', 'duration' => ['type' => 'save-ends']]], 'Only conditions are kept: ' . json_encode($hero()['conditions']));
    conditionSyncCheck(($write('GM', ['source' => 'vtt', 'conditions' => '{"a":1}'])['success'] ?? true) === false, 'A list is a list');

    // ---- no token: the sheet's own list ------------------------------------------------------------------
    $revision = $live();
    $own = $write('cal', ['source' => 'sheet', 'conditions' => $list($slowedEot), 'baseRevision' => (string) $revision]);
    conditionSyncCheck($own['success'] === true && $hero()['conditions'] === [$slowedEot] && !isset($hero()['conditionsSource']) && $own['revision'] === $revision + 1,
        'The hero\'s own page edits the list when the hero is not on the map: ' . json_encode($own));
    // A page that read the sheet before that change cannot overwrite it.
    $old = $write('GM', ['source' => 'sheet', 'conditions' => $list(), 'baseRevision' => (string) $revision]);
    conditionSyncCheck(($old['success'] ?? true) === false && ($old['stale'] ?? false) === true && $hero()['conditions'] === [$slowedEot], 'A stale page is refused and told to reload: ' . json_encode($old));
    // The sheet's rule for its own list: another player cannot.
    $other = $write('sharon', ['source' => 'sheet', 'conditions' => $list(), 'baseRevision' => '']);
    conditionSyncCheck(($other['success'] ?? true) === false && $hero()['conditions'] === [$slowedEot], 'Another player cannot edit a hero\'s own list');
    $gm = $write('GM', ['source' => 'sheet', 'conditions' => $list(), 'baseRevision' => (string) $live()]);
    conditionSyncCheck($gm['success'] === true && $hero()['conditions'] === [], 'The Director can');
    conditionSyncCheck(($ask('cal', 'GET', ['action' => 'sync-conditions', 'character' => 'cal', 'conditions' => '[]'])['success'] ?? true) === false, 'Conditions are written with POST');

    // ---- deltas (late October 2026): only what one change did, never a whole list ----------------------------
    $delta = static fn (string $user, array $ops, array $extra = []) => $write($user, ['source' => 'vtt', 'delta' => json_encode($ops), ...$extra]);
    $restrained = ['name' => 'Restrained', 'duration' => ['type' => 'end-of-turn']];
    // An old sheet's text stays on the sheet; a stale token's change adds only the changed condition.
    $ask('GM', 'POST', ['action' => 'save-fields', 'character' => 'cal', 'changes' => json_encode([['path' => ['hero', 'conditions'], 'value' => ['Weakened, save ends']]])]);
    $added = $delta('sharon', [['op' => 'add', 'condition' => $restrained]], ['placementId' => 'old-map-cal', 'revision' => '12']);
    conditionSyncCheck($added['success'] === true && $added['applied'] === true
        && $hero()['conditions'] === [['name' => 'Weakened', 'duration' => ['type' => 'save-ends']], $restrained], 'A delta adds only its condition to the sheet\'s own list: ' . json_encode($hero()['conditions']));
    conditionSyncCheck(($hero()['conditionsSource']['names']['restrained'] ?? null) === 12, 'with that token\'s revision for that condition');
    // The same delta from a second page: taken once, nothing written.
    $before = $live();
    $again = $delta('GM', [['op' => 'add', 'condition' => $restrained]], ['placementId' => 'old-map-cal', 'revision' => '12']);
    conditionSyncCheck(($again['applied'] ?? true) === false && $live() === $before, 'The same change again is answered and not written');
    // A late, older change of the same condition never undoes a newer one; another condition's older change still lands.
    $delta('GM', [['op' => 'remove', 'condition' => $restrained]], ['placementId' => 'old-map-cal', 'revision' => '11']);
    conditionSyncCheck(in_array($restrained, $hero()['conditions'], true), 'An older revision of that condition is not taken');
    $delta('GM', [['op' => 'add', 'condition' => $prone]], ['placementId' => 'old-map-cal', 'revision' => '11']);
    conditionSyncCheck(in_array($prone, $hero()['conditions'], true), 'Another condition\'s change from that older revision is');
    // Save ends turned end of turn.
    $delta('GM', [['op' => 'duration', 'condition' => ['name' => 'Prone', 'duration' => ['type' => 'end-of-turn']], 'from' => 'save-ends']], ['placementId' => 'old-map-cal', 'revision' => '13']);
    conditionSyncCheck(in_array(['name' => 'Prone', 'duration' => ['type' => 'end-of-turn']], $hero()['conditions'], true) && !in_array($prone, $hero()['conditions'], true), 'A duration change replaces the condition');
    // The Director's new-fight wipe (no token revision): applied as it comes; its undo puts the list back.
    $was = $hero()['conditions'];
    $delta('GM', array_map(static fn ($c) => ['op' => 'remove', 'condition' => $c], $was), ['reason' => 'new-fight']);
    conditionSyncCheck($hero()['conditions'] === [], 'The new fight clears the sheet');
    $delta('GM', array_map(static fn ($c) => ['op' => 'add', 'condition' => $c], $was), ['reason' => 'new-fight-undo']);
    conditionSyncCheck($hero()['conditions'] === $was, 'Undo puts it back');
    conditionSyncCheck(($delta('GM', [], [])['success'] ?? false) === true && ($write('GM', ['source' => 'vtt', 'delta' => '{"a":1}'])['success'] ?? true) === false, 'A delta is a list');
    echo "sheet-conditions: ok\n";
} finally {
    $remove($root);
}
