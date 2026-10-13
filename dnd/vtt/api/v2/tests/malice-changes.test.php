<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Malace sometimes pops back or doenst work right. make sure it comes and goes
// correctly. and doesnt pop back."
//
// Malice was sent as "set Malice to N", N being the sending page's own copy. An old page, a second Director page,
// or two changes arriving out of order put an old number back, and the server took whatever it was given. A change
// is now an amount ("add", "take") that the server applies to the stored number, and End Round says which round it
// is ending, so the round's Malice is gained once. The browser's side is malice-changes.test.mjs.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function maliceCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$database = sys_get_temp_dir() . '/vtt-malice-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database);
try {
    $store->migrateLegacyPlacements(['placements'=>['scene'=>[]]]);
    $n = 0;
    $send = static function (string $type, array $payload, string $actor = 'GM', ?int $base = null) use ($store, &$n) {
        return $store->acceptCombatCommand(['operationId'=>'malice-test-' . (++$n), 'type'=>$type, 'baseRevision'=>$base ?? $store->getSnapshot()['revision'], 'sceneId'=>'scene', 'payload'=>$payload], $actor, strtoupper($actor) === 'GM' || $actor === 'gm2');
    };
    $malice = static fn () => (int) ($store->getSnapshot()['state']['combat']['scene']['malice'] ?? -1);
    $refused = static function (callable $try): ?string { try { $try(); return null; } catch (InvalidArgumentException $error) { return $error->getMessage(); } };

    $send('combat.start', ['startingTeam'=>'enemy', 'encounterId'=>'enc-malice', 'combat'=>['active'=>true, 'malice'=>4, 'groups'=>[], 'lastEffects'=>[]]]);
    $start = $malice();
    maliceCheck($start >= 5, 'Combat starts with the seed and the opening gain: ' . $start);

    // A spend and a gain are amounts.
    $spent = $send('combat.patch', ['patch'=>['maliceDelta'=>-3]]);
    maliceCheck($malice() === $start - 3 && $spent['event']['payload']['combat']['malice'] === $start - 3, 'Three taken: ' . $malice());
    $send('combat.patch', ['patch'=>['maliceDelta'=>2]]);
    maliceCheck($malice() === $start - 1, 'Two added: ' . $malice());

    // Two pages, both looking at the same number, each change it: both changes count, whichever lands first.
    $seen = $store->getSnapshot()['revision'];
    $send('combat.patch', ['patch'=>['maliceDelta'=>-2]], 'GM', $seen);
    $send('combat.patch', ['patch'=>['maliceDelta'=>5]], 'gm2', $seen);
    maliceCheck($malice() === $start - 1 - 2 + 5, 'Two Director pages changing it from the same view: neither undoes the other: ' . $malice());

    // The round's gain is not wiped by a change that was sent before it and arrives after it.
    $before = $malice(); $seen = $store->getSnapshot()['revision']; $round = (int) $store->getSnapshot()['state']['combat']['scene']['round'];
    $send('round.advance', ['expectedRound'=>$round]);
    $gained = $malice() - $before;
    maliceCheck($gained >= 2, 'End Round adds the round\'s Malice: ' . $gained);
    $send('combat.patch', ['patch'=>['maliceDelta'=>-1]], 'GM', $seen);
    maliceCheck($malice() === $before + $gained - 1, 'A spend sent before End Round and arriving after it takes one and keeps the gain: ' . $malice());

    // End Round twice for the same round (a second Director page, a double click): once.
    $held = $malice();
    $again = $send('round.advance', ['expectedRound'=>$round]);
    maliceCheck(($again['status'] ?? '') === 'conflict' && ($again['error'] ?? '') === 'round_mismatch' && $malice() === $held, 'A second End Round for a round already ended is refused and gains nothing: ' . json_encode([$again['status'] ?? null, $again['error'] ?? null, $malice()]));
    maliceCheck((int) $store->getSnapshot()['state']['combat']['scene']['round'] === $round + 1, 'and the round is not skipped');
    // A page that does not say which round it is ending (an old one) is taken as before.
    $send('round.advance', []);
    maliceCheck((int) $store->getSnapshot()['state']['combat']['scene']['round'] === $round + 2, 'An End Round that names no round still ends the round');

    // Never below nought, and only whole amounts, and only from the Director.
    $send('combat.patch', ['patch'=>['maliceDelta'=>-999]]);
    maliceCheck($malice() === 0, 'Malice does not go below nought');
    foreach ([1.5, '2', null, 5000] as $bad) maliceCheck($refused(fn () => $send('combat.patch', ['patch'=>['maliceDelta'=>$bad]])) === 'A Malice change must be a whole number.', 'An amount of ' . json_encode($bad) . ' is refused');
    maliceCheck(str_contains((string) $refused(fn () => $send('combat.patch', ['patch'=>['maliceDelta'=>3]], 'cal')), 'not permitted'), 'A player cannot change Malice');
    maliceCheck($malice() === 0, 'and nothing changed');

    // The old form still works for a page that has not reloaded since the change.
    $send('combat.patch', ['patch'=>['malice'=>6]]);
    maliceCheck($malice() === 6, 'A page still sending "set Malice to" is taken at its word, as before');

    $send('combat.end', ['encounterId'=>'enc-malice']);
    maliceCheck($malice() <= 0, 'Out of combat there is no Malice: ' . $malice());
    unset($store);
} finally { @unlink($database); }
echo "malice changes: amounts the server applies; the round's gain once; never an old number put back\n";
