<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Popup tests for others, liike for other people to roll a test. those arent working."
//
// A test asked of a player is for that player and the Director only, so the copy sent over the channel every
// player shares is blanked. A page that took the blank as the whole of it never fetched its own copy, and the
// player meant to roll never saw the test while live push was on. The shared channel's blank now says "ask".
// A player's own copy from the server is unchanged: the request for the one it is for, a plain blank for the rest.
//
// And when the player it was meant for is not on the VTT page, the server sends it to the Director, as before; it
// now also keeps who it was meant for, so the Director's waiting panel can say so.
// The browser's side is assets/js/sync-v2/__tests__/redacted-ask.test.mjs.
require_once __DIR__ . '/../_common.php';
function deliveryCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$request = ['id'=>'req-1', 'sceneId'=>'s', 'initiatorId'=>'gm', 'recipientId'=>'sharon', 'status'=>'pending', 'attribute'=>'Might', 'targetIds'=>['pc']];
$event = ['revision'=>7, 'operationId'=>'op-requested-7', 'type'=>'requestedTest.changed', 'actorId'=>'gm', 'sceneId'=>'s', 'entityId'=>'req-1', 'entityRevision'=>null,
    'payload'=>['requestId'=>'req-1', 'request'=>$request, 'visibleTo'=>['gm', 'sharon']], 'serverTime'=>1];

$shared = vttSyncV2ProjectEventForUser($event, ['isGM'=>false]);
deliveryCheck($shared['type'] === 'sync.redacted' && $shared['revision'] === 7 && $shared['payload'] === ['ask'=>true], 'The copy for the channel all players share is blank and says ask: ' . json_encode($shared));
deliveryCheck(!str_contains(json_encode($shared), 'sharon') && !str_contains(json_encode($shared), 'Might') && $shared['actorId'] === null, 'and gives nothing of the request away');

$forSharon = vttSyncV2ProjectEventForUser($event, ['isGM'=>false, 'user'=>'Sharon']);
deliveryCheck($forSharon['type'] === 'requestedTest.changed' && ($forSharon['payload']['request']['recipientId'] ?? null) === 'sharon', 'The player it is for is given the request when she asks: ' . json_encode($forSharon['type']));

$forCal = vttSyncV2ProjectEventForUser($event, ['isGM'=>false, 'user'=>'cal']);
deliveryCheck($forCal['type'] === 'sync.redacted' && $forCal['payload'] === [], 'Another player who asks is given a plain blank, with nothing more to ask for: ' . json_encode($forCal));

deliveryCheck(vttSyncV2ProjectEventForUser($event, ['isGM'=>true, 'user'=>'gm']) === $event, 'The Director is given it whole');

// Who it was meant for, when that player is not on the VTT page.
$database = sys_get_temp_dir() . '/vtt-delivery-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database, 'delivery-world', 10, 10, 10);
try {
    $store->touchPresence('gm', true);
    $store->touchPresence('cal', false);
    $ask = static fn (string $id, string $player, string $name) => $store->acceptRequestedTestCommand(['operationId'=>'delivery-create-' . $id, 'type'=>'requestedTest.create', 'baseRevision'=>$store->getSnapshot()['revision'], 'sceneId'=>'scene', 'entityId'=>$id,
        'payload'=>['request'=>['recipientId'=>$player, 'attribute'=>'Might', 'rollMode'=>'individual', 'targetIds'=>['token-' . $id], 'targetNames'=>[$name], 'test'=>['batchId'=>'batch-1']]]], 'gm', true)['event']['payload']['request'];
    $here = $ask('one', 'cal', 'Cal');
    deliveryCheck($here['recipientId'] === 'cal' && $here['wantedRecipientId'] === '', 'A player on the VTT page gets his own test, and nobody was skipped: ' . json_encode([$here['recipientId'], $here['wantedRecipientId']]));
    $away = $ask('two', 'Sharon', 'Sharon');
    deliveryCheck($away['recipientId'] === 'gm' && $away['wantedRecipientId'] === 'sharon' && $away['targetNames'] === ['Sharon'], 'A player who is not on the VTT page: the test goes to the Director, and the record says whose it was: ' . json_encode([$away['recipientId'], $away['wantedRecipientId']]));
    $stored = $store->getSnapshot()['state']['requestedTests']['two'];
    deliveryCheck($stored['wantedRecipientId'] === 'sharon', 'and it is kept with the request');
    $own = $ask('three', '__gm__', 'Ogre');
    deliveryCheck($own['recipientId'] === 'gm' && $own['wantedRecipientId'] === '', 'A test the Director was always meant to make skipped nobody');
    unset($store);
} finally { @unlink($database); }

// The Director's waiting panel says who was skipped.
$panel = file_get_contents(__DIR__ . '/../../../assets/js/ui/requested-test-coordinator.js');
deliveryCheck(str_contains($panel, 'record.wantedRecipientId && record.wantedRecipientId !== record.recipientId') && str_contains($panel, 'Not on the VTT page, so it came to you: '), 'The waiting panel names the players whose tests came to the Director');

echo "requested test delivery: the shared blank says ask; each player's own copy is his; the Director is told who was skipped\n";
