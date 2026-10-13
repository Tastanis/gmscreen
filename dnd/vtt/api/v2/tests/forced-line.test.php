<?php
declare(strict_types=1);
// Brandon, October 12, 2026: "Ability pushes go in a straight line, yes."
//
// The picker offered a fan: every square further from the pusher. It offers one line now, from the pusher's middle
// through the target's middle and on (for a pull, from the target toward the puller), and the server holds an
// ability's push or pull to that line. A forced move that names no pusher is the Director's own forced drag, or a
// leg of a slide, and goes where it is put: a slide may go round things, and the Director may always move a
// creature by hand. The browser's side is forced-move-cells.test.mjs, which reads the same cases.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function lineCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function lineThrows(callable $run, string $needle, string $message): void {
    try { $run(); } catch (InvalidArgumentException $e) { lineCheck(str_contains($e->getMessage(), $needle), $message . ': refused, but with "' . $e->getMessage() . '"'); return; }
    throw new RuntimeException($message . ': it was allowed');
}
$token = static fn (string $id, array $at): array => ['id'=>$id, 'column'=>$at[0], 'row'=>$at[1], 'width'=>$at[2] ?? 1, 'height'=>$at[2] ?? 1];

$cases = json_decode(file_get_contents(__DIR__ . '/fixtures/forced-line-cases.json'), true, 16, JSON_THROW_ON_ERROR)['cases'];
lineCheck(count($cases) >= 18, 'the shared cases are there');
foreach ($cases as $case) {
    $cell = ForcedMovement::lineCell($token('pusher', $case['pusher']), $token('target', $case['target']), $case['squares'], $case['verb']);
    lineCheck($cell === ['column'=>$case['square'][0], 'row'=>$case['square'][1]], "{$case['verb']} {$case['squares']} of a target at " . json_encode($case['target']) . ' by one at ' . json_encode($case['pusher']) . ': ' . json_encode($cell));
}
lineCheck(ForcedMovement::lineCell($token('a', [5, 5]), $token('b', [5, 5]), 2, 'push') === null, 'no line when they share a middle');

// An open floor, a pusher at 10,10 and a target east of it at 11,10.
$config = ['mapLevels'=>['levels'=>[]], 'environment'=>['walls'=>['revision'=>1, 'value'=>['version'=>1, 'nodes'=>[], 'segments'=>[], 'roofs'=>[]]]]];
$pusher = $token('pusher', [10, 10]); $target = $token('target', [11, 10]); $others = ['pusher'=>$pusher, 'target'=>$target];
$push = static fn (array $intent) => ForcedMovement::plan($target, [...$target, 'column'=>$intent['column'], 'row'=>$intent['row']], $intent, 'forced', $others, $config);
$by = ['id'=>'pusher', 'verb'=>'push'];

$plan = $push(['column'=>14, 'row'=>10, 'by'=>$by]);
lineCheck($plan['column'] == 14 && $plan['row'] == 10 && $plan['damage'] === 0, 'a push straight away from the pusher goes the whole way');
lineCheck($push(['column'=>12, 'row'=>10, 'by'=>$by])['column'] == 12, 'and may stop short of its full distance');
lineThrows(fn () => $push(['column'=>14, 'row'=>11, 'by'=>$by]), 'straight line away from the pusher', 'a push to one side of the line');
lineThrows(fn () => $push(['column'=>12, 'row'=>9, 'by'=>$by]), 'straight line away from the pusher', 'a push at a slant from a pusher straight behind');
lineThrows(fn () => $push(['column'=>9, 'row'=>10, 'by'=>$by]), 'straight line away from the pusher', 'a push back toward the pusher');
// The same squares with nobody named: the Director's own forced drag, or a leg of a slide.
lineCheck($push(['column'=>14, 'row'=>11])['column'] == 14, 'a forced move that names no pusher goes where it is put');
lineCheck($push(['column'=>12, 'row'=>9, 'beyond'=>2])['row'] == 9, 'and so does a leg of a slide');
// A pusher that has left the map has no line to hold it to.
lineCheck($push(['column'=>14, 'row'=>11, 'by'=>['id'=>'gone', 'verb'=>'push']])['column'] == 14, 'a pusher no longer on the map is not checked against');

// A pull, from four squares east of the puller.
$far = $token('target', [14, 10]); $pullOthers = ['pusher'=>$pusher, 'target'=>$far];
$pull = static fn (array $intent) => ForcedMovement::plan($far, [...$far, 'column'=>$intent['column'], 'row'=>$intent['row']], $intent, 'forced', $pullOthers, $config);
lineCheck($pull(['column'=>11, 'row'=>10, 'by'=>['id'=>'pusher', 'verb'=>'pull']])['column'] == 11, 'a pull straight toward the puller arrives beside it');
lineThrows(fn () => $pull(['column'=>12, 'row'=>11, 'by'=>['id'=>'pusher', 'verb'=>'pull']]), 'straight line toward the puller', 'a pull to one side of the line');

// A creature on the line is still slammed into: the push aims its whole distance and stops at the creature.
$blocker = $token('blocker', [13, 10]);
$slam = ForcedMovement::plan($target, [...$target, 'column'=>12, 'row'=>10], ['column'=>15, 'row'=>10, 'by'=>$by], 'forced', [...$others, 'blocker'=>$blocker], $config);
lineCheck($slam['column'] == 12 && $slam['collidedIds'] === ['blocker'] && $slam['damage'] === 3, 'a push of 4 into a creature two squares on stops beside it with 3 left over: ' . json_encode($slam));

// The source must be said properly or not at all.
foreach ([['id'=>'pusher'], ['id'=>'pusher', 'verb'=>'slide'], ['id'=>'', 'verb'=>'push'], ['id'=>7, 'verb'=>'push'], 'pusher', ['id'=>'pusher', 'verb'=>'push', 'extra'=>1]] as $k => $bad) {
    lineThrows(fn () => ForcedMovement::assertIntent(['column'=>14, 'row'=>10, 'by'=>$bad]), 'Invalid forced movement source', "a malformed source ($k)");
}
ForcedMovement::assertIntent(['column'=>14, 'row'=>10, 'by'=>$by]);

echo "forced line: an ability's push or pull is held to its one straight line\n";
