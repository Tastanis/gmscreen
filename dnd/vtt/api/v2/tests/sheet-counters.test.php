<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Some weird things seem to not be syncing or staying correctly sometimes." And of the
// sheets and the map: "I also want to make sure that the VTT character sheet is working correctly and everything
// is syncing there right."
//
// Stamina, Recoveries, surges, Victories and the heroic resource are changed from four places: the sheet page,
// the map's side panel, a hero's token, and ability automation. Each holds a copy of the number, and each used to
// write "the number is now N" from its copy. A copy that was behind (a token on the Director's map while the
// player healed on a phone; a panel open since before a hit) wrote the sheet back to where it had been.
//
// Now each says how much it changed the number by, and that is added to the number the server holds. A token's
// Stamina maximum, itself a copy, is never written back unless somebody typed a new one on the token. Use
// Recovery is worked out from the stored record. These run the real request handler in an empty folder.
function counterCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$source = realpath(__DIR__ . '/../../../../character_sheet');
// The site's layout: the handler in character_sheet/, the player list in includes/ beside it.
$root = sys_get_temp_dir() . '/vtt-counters-' . bin2hex(random_bytes(6));
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
$set = static fn (string $who, array $values) => $ask('GM', 'POST', ['action'=>'save-fields', 'character'=>$who, 'changes'=>json_encode(array_map(
    static fn ($path, $value) => ['path'=>explode('.', $path), 'value'=>$value], array_keys($values), $values))]);
$map = static fn (string $user, string $action, array $fields) => $ask($user, 'POST', ['action'=>$action, 'character'=>'cal', 'source'=>'vtt', ...$fields]);

try {
    $set('cal', ['hero.name'=>'Cal', 'hero.vitals.staminaMax'=>60, 'hero.vitals.currentStamina'=>40, 'hero.vitals.recoveriesMax'=>8, 'hero.vitals.currentRecoveries'=>3,
        'hero.surges'=>2, 'hero.victories'=>1, 'hero.resource.value'=>4]);

    // ---- a token on the map ------------------------------------------------------------------
    // The Director's token still reads 45 of 30 (an old copy); Cal's sheet has since gone to 40 of 60. He takes 5.
    $answer = $map('GM', 'sync-stamina', ['delta'=>'-5', 'staminaMax'=>'30', 'operationId'=>'token-hit-0001']);
    $vitals = $hero()['vitals'];
    counterCheck($vitals['currentStamina'] === 35 && $vitals['staminaMax'] === 60, 'A hit on a token that was behind takes 5 off the sheet\'s Stamina and leaves its maximum alone: ' . json_encode($vitals));
    counterCheck($answer['success'] === true && $answer['currentStamina'] === 35 && $answer['staminaMax'] === 60 && $answer['hasStamina'] === true, 'and the token is told where the sheet now stands: ' . json_encode($answer));
    // The same request again (a retry after a lost answer) is not applied twice.
    $again = $map('GM', 'sync-stamina', ['delta'=>'-5', 'staminaMax'=>'30', 'operationId'=>'token-hit-0001']);
    counterCheck(($again['replayed'] ?? false) === true && $hero()['vitals']['currentStamina'] === 35, 'A retried hit lands once');
    // A player's page moving an ally's token: any signed-in map user may, as before.
    $map('sharon', 'sync-stamina', ['delta'=>'3']);
    counterCheck($hero()['vitals']['currentStamina'] === 38, 'Healing from another player\'s page is added too');
    // THE FAULT BRANDON ASKED ABOUT. A token showing 0 of 0 because its sheet could not be read, then touched:
    // what a map page from before this change sends is the two numbers it holds.
    $map('GM', 'sync-stamina', ['currentStamina'=>'0', 'staminaMax'=>'0']);
    counterCheck($hero()['vitals']['staminaMax'] === 60, 'A maximum a page merely holds is never written to the sheet, least of all 0: ' . json_encode($hero()['vitals']));
    $map('GM', 'sync-stamina', ['currentStamina'=>'38', 'staminaMax'=>'30']);
    counterCheck($hero()['vitals']['staminaMax'] === 60 && $hero()['vitals']['currentStamina'] === 38, 'nor an old one');
    // The maximum is set on the sheet (a token only shows it).
    $set('cal', ['hero.vitals.staminaMax'=>70]);
    $map('GM', 'sync-stamina', ['delta'=>'-1', 'staminaMax'=>'']);
    $map('GM', 'sync-stamina', ['delta'=>'-1', 'staminaMax'=>'999']);
    counterCheck($hero()['vitals']['staminaMax'] === 70 && $hero()['vitals']['currentStamina'] === 36, 'Whatever maximum the map sends along is not taken: ' . json_encode($hero()['vitals']));
    counterCheck(($map('GM', 'sync-stamina', [])['success'] ?? null) === false && ($map('GM', 'sync-stamina', ['staminaMax'=>'5'])['success'] ?? null) === false, 'A request that says nothing of Stamina is refused');
    // A token that had no number at all has no amount to give: what it reads is set.
    $map('GM', 'sync-stamina', ['currentStamina'=>'36']);
    counterCheck($hero()['vitals']['currentStamina'] === 36, 'A plain number is still taken where there is no amount');

    // ---- the map's side panel ----------------------------------------------------------------
    $answer = $map('cal', 'sync-vitals', ['staminaDelta'=>'-7', 'operationId'=>'panel-hit-0001']);
    counterCheck($answer['success'] === true && $answer['currentStamina'] === 29 && $hero()['vitals']['currentStamina'] === 29, 'Damage from the panel is an amount: ' . json_encode($answer));
    $map('cal', 'sync-vitals', ['staminaDelta'=>'-7', 'operationId'=>'panel-hit-0001']);
    counterCheck($hero()['vitals']['currentStamina'] === 29, 'applied once');
    // Use Recovery, from the stored record: 70 / 3 = 23.
    $used = $map('cal', 'sync-vitals', ['useRecovery'=>'1', 'operationId'=>'panel-recovery-01']);
    $vitals = $hero()['vitals'];
    counterCheck($used['spent'] === 1 && $used['recoveryValue'] === 23 && $vitals['currentStamina'] === 52 && $vitals['currentRecoveries'] === 2, 'A Recovery heals a third of the maximum and costs one: ' . json_encode([$used, $vitals]));
    $map('cal', 'sync-vitals', ['useRecovery'=>'1', 'operationId'=>'panel-recovery-01']);
    counterCheck($hero()['vitals']['currentRecoveries'] === 2, 'once');
    $map('cal', 'sync-vitals', ['useRecovery'=>'1']);
    counterCheck($hero()['vitals']['currentStamina'] === 70 && $hero()['vitals']['currentRecoveries'] === 1, 'It heals as far as the maximum, no further: ' . json_encode($hero()['vitals']));
    // Temporary Stamina above the maximum is not lowered by a Recovery.
    $map('GM', 'sync-stamina', ['delta'=>'10']);
    $map('cal', 'sync-vitals', ['useRecovery'=>'1']);
    counterCheck($hero()['vitals']['currentStamina'] === 80 && $hero()['vitals']['currentRecoveries'] === 0, 'Stamina above the maximum stays where it is: ' . json_encode($hero()['vitals']));
    $none = $map('cal', 'sync-vitals', ['useRecovery'=>'1']);
    counterCheck($none['success'] === true && $none['spent'] === 0 && str_contains($none['reason'], 'No Recoveries') && $hero()['vitals']['currentStamina'] === 80, 'With none left nothing changes, and it says why: ' . json_encode($none));
    // Victories, surges: one more is one more, whoever else also added one.
    $map('cal', 'sync-victories', ['delta'=>'1']); $map('sharon', 'sync-victories', ['delta'=>'1']);
    $map('cal', 'sync-surges', ['delta'=>'1']); $map('cal', 'sync-surges', ['delta'=>'-5']);
    counterCheck($hero()['victories'] === 3 && $hero()['surges'] === 0, 'Two pages that each add a Victory add two; surges never go below none: ' . json_encode([$hero()['victories'], $hero()['surges']]));

    // The heroic resource from the panel's plus and minus: an amount, never below none on a sheet that does not
    // allow it. (A spend by an ability was an amount already: "spend".)
    $gain = $map('cal', 'sync-resource', ['delta'=>'2', 'operationId'=>'panel-resource-01']);
    $map('cal', 'sync-resource', ['delta'=>'2', 'operationId'=>'panel-resource-01']);
    counterCheck($gain['success'] === true && $gain['resource'] === 6 && $hero()['resource']['value'] === 6, 'Two more of the heroic resource, once: ' . json_encode($gain));
    $map('sharon', 'sync-resource', ['delta'=>'-9']);
    counterCheck($hero()['resource']['value'] === 0, 'It stops at none');
    $map('cal', 'sync-resource', ['delta'=>'4']);

    // ---- the sheet page ----------------------------------------------------------------------
    // Its plus and minus buttons say what the page believed the number was. The page believed 0 surges and
    // pressed plus; meanwhile the map had given 2.
    $map('cal', 'sync-surges', ['delta'=>'2']);
    $ask('cal', 'POST', ['action'=>'save-fields', 'character'=>'cal', 'changes'=>json_encode([['path'=>['hero', 'surges'], 'value'=>1, 'from'=>0]])]);
    counterCheck($hero()['surges'] === 3, 'A plus on a page that was behind adds one to the stored number: ' . $hero()['surges']);
    $ask('cal', 'POST', ['action'=>'save-fields', 'character'=>'cal', 'changes'=>json_encode([
        ['path'=>['hero', 'vitals', 'currentStamina'], 'value'=>'75', 'from'=>'77'], ['path'=>['hero', 'surges'], 'value'=>0, 'from'=>9], ['path'=>['hero', 'resource', 'value'], 'value'=>6, 'from'=>4],
        ['path'=>['hero', 'wealth'], 'value'=>'2', 'from'=>'1']])]);
    $now = $hero();
    counterCheck($now['vitals']['currentStamina'] === 78 && $now['surges'] === 0 && $now['resource']['value'] === 6 && $now['wealth'] === '2',
        'Stamina typed two lower goes two lower; a counter never goes below none; what is not a counter is simply set: ' . json_encode([$now['vitals']['currentStamina'], $now['surges'], $now['resource']['value'], $now['wealth']]));
    $ask('cal', 'POST', ['action'=>'save-fields', 'character'=>'cal', 'changes'=>json_encode([['path'=>['hero', 'surges'], 'value'=>4], ['path'=>['hero', 'victories'], 'value'=>'', 'from'=>3]])]);
    counterCheck($hero()['surges'] === 4 && $hero()['victories'] === '', 'A change that does not say where it came from, or is not a number, is set as it is');

    // A save names itself, so one whose answer was lost is not added twice, and can be asked after.
    $plus = ['action'=>'save-fields', 'character'=>'cal', 'operationId'=>'sheet-save-0001', 'changes'=>json_encode([['path'=>['hero', 'surges'], 'value'=>5, 'from'=>4]])];
    $first = $ask('cal', 'POST', $plus); $second = $ask('cal', 'POST', $plus);
    counterCheck($first['success'] === true && $first['replayed'] === false && $second['replayed'] === true && $hero()['surges'] === 5, 'The same save sent twice adds once: ' . json_encode([$first, $second, $hero()['surges']]));
    $status = $ask('cal', 'GET', ['action'=>'operation-status', 'character'=>'cal', 'operationId'=>'sheet-save-0001']);
    counterCheck($status['recorded'] === true && $ask('cal', 'GET', ['action'=>'operation-status', 'character'=>'cal', 'operationId'=>'sheet-save-none'])['recorded'] === false, 'and the page can ask whether a save was stored');
    try { $other = $ask('cal', 'POST', [...$plus, 'changes'=>json_encode([['path'=>['hero', 'surges'], 'value'=>9]])]); } catch (Throwable $error) { $other = ['success'=>false]; }
    counterCheck(($other['success'] ?? null) !== true && $hero()['surges'] === 5, 'A name used again for a different save is refused');
    $ask('cal', 'POST', ['action'=>'save-fields', 'character'=>'cal', 'changes'=>json_encode([['path'=>['hero', 'surges'], 'value'=>4]])]);

    // ---- the party's Stamina for the Director's page -----------------------------------------
    $party = $ask('GM', 'GET', ['action'=>'party-vitals']);
    counterCheck($party['success'] === true && $party['party']['cal'] === ['hasStamina'=>true, 'currentStamina'=>78, 'staminaMax'=>70], 'One read gives each hero\'s Stamina: ' . json_encode($party['party']['cal'] ?? null));
    counterCheck($party['party']['zepha'] === ['hasStamina'=>false], 'A sheet with no Stamina maximum has no Stamina to show, not 0 of 0: ' . json_encode($party['party']['zepha'] ?? null));
    counterCheck($ask('GM', 'GET', ['action'=>'sync-stamina', 'character'=>'zepha'])['hasStamina'] === false && $ask('GM', 'GET', ['action'=>'sync-stamina', 'character'=>'cal'])['hasStamina'] === true, 'and a single read says so too');
    $same = $ask('GM', 'GET', ['action'=>'party-vitals', 'since'=>$party['stamp']]);
    counterCheck($same === ['success'=>true, 'unchanged'=>true, 'stamp'=>$party['stamp']], 'While no sheet has been written the answer is "unchanged": ' . json_encode($same));
    counterCheck(($ask('cal', 'GET', ['action'=>'party-vitals'])['error'] ?? '') === 'Permission denied', 'It is the Director\'s read');
    // An unreadable store answers an error, never noughts.
    file_put_contents($site . '/data/character_sheets.json', '{ not json');
    $broken = $ask('GM', 'GET', ['action'=>'party-vitals']);
    counterCheck($broken['success'] === false && !isset($broken['party']), 'Sheets that cannot be read give an error, not empty heroes: ' . json_encode($broken));
} finally { $remove($root); }

// The parts by themselves.
require_once $source . '/SheetChanges.php';
counterCheck([SheetChanges::whole(3), SheetChanges::whole('3'), SheetChanges::whole(' -4 '), SheetChanges::whole(3.0)] === [3, 3, -4, 3]
    && [SheetChanges::whole(''), SheetChanges::whole(null), SheetChanges::whole(3.5), SheetChanges::whole('3 or so'), SheetChanges::whole([3]), SheetChanges::whole(true)] === [null, null, null, null, null, null], 'What counts as a whole number');
$talent = ['hero'=>['stats'=>['reason'=>2], 'resource'=>['value'=>1, 'allowNegative'=>true]]];
counterCheck(SheetChanges::floorOf($talent, 'hero.resource.value') === -3 && SheetChanges::move($talent, 'hero.resource.value', -9)['hero']['resource']['value'] === -3, 'A resource that may go negative goes as far as the sheet\'s own rule: 1 + Reason below none');
counterCheck(SheetChanges::move(['hero'=>['resource'=>['value'=>1]]], 'hero.resource.value', -9)['hero']['resource']['value'] === 0, 'and any other stops at none');
counterCheck(SheetChanges::move(['hero'=>['vitals'=>['currentStamina'=>3]]], 'hero.vitals.currentStamina', -9)['hero']['vitals']['currentStamina'] === -6, 'Stamina goes below none: a dying hero');
counterCheck(SheetChanges::move([], 'hero.victories', 2)['hero']['victories'] === 2, 'A counter that was never stored counts from none');
try { SheetChanges::move([], 'hero.name', 1); counterCheck(false, 'A field that is not a counter was moved'); } catch (InvalidArgumentException $error) {}
counterCheck(SheetChanges::recoveryValue(['recoveryValue'=>'12', 'staminaMax'=>60]) === 12 && SheetChanges::recoveryValue(['recoveryValue'=>'', 'staminaMax'=>61]) === 20 && SheetChanges::recoveryValue([]) === 0, 'The recovery value is the sheet\'s own, else a third of the maximum');
// What the sheet page used to do with no maximum: Stamina set to none. Now the full value is healed.
$blank = SheetChanges::useRecovery(['hero'=>['vitals'=>['recoveryValue'=>10, 'staminaMax'=>'', 'currentStamina'=>4, 'currentRecoveries'=>2]]]);
counterCheck($blank['spent'] === 1 && $blank['currentStamina'] === 14 && $blank['currentRecoveries'] === 1, 'A sheet with a recovery value and no maximum heals the value: ' . json_encode([$blank['currentStamina'], $blank['currentRecoveries']]));
$nothing = SheetChanges::useRecovery(['hero'=>['vitals'=>['currentStamina'=>4, 'currentRecoveries'=>2]]]);
counterCheck($nothing['spent'] === 0 && $nothing['currentRecoveries'] === 2 && str_contains($nothing['reason'], 'no recovery value'), 'One with neither spends nothing and says why');

// Receipts answer a retry made moments later; they are not kept for ever (they were, and the file grew with every hit).
require_once $source . '/CharacterWriteReceipts.php';
$data = ['_vttOperations'=>['old-receipt-01'=>['createdAt'=>time() - 200000, 'response'=>[]], 'new-receipt-01'=>['createdAt'=>time() - 60, 'response'=>[]]]];
for ($i = 0; $i < 450; $i++) CharacterWriteReceipts::record($data, sprintf('many-receipt-%04d', $i), 'gm', 'cal', 'sync-stamina', ['delta'=>1], ['success'=>true]);
counterCheck(!isset($data['_vttOperations']['old-receipt-01']) && count($data['_vttOperations']) === 400 && isset($data['_vttOperations']['many-receipt-0449']) && !isset($data['_vttOperations']['many-receipt-0000']),
    'Receipts older than two days go, and only the newest four hundred are kept: ' . count($data['_vttOperations']));

echo "sheet counters: a change is an amount added to the stored number; a token's maximum is never written back; Use Recovery is the server's\n";
