<?php
declare(strict_types=1);
// Breakable walls on the server: what may be stored, what a player is told, and that a broken
// wall stops no movement. The numbers and cases match breakable-walls.test.mjs.
require_once __DIR__ . '/../_common.php';
require_once __DIR__ . '/../../../lib/SceneImportValidation.php';
function wallCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function wallRefuses(array $value, string $expected, string $message): void {
    try { SceneEnvironment::validate('walls', $value); }
    catch (InvalidArgumentException $error) { wallCheck(str_contains($error->getMessage(), $expected), $message . ' (got: ' . $error->getMessage() . ')'); return; }
    throw new RuntimeException($message . ' (accepted)');
}
// A wall running north to south along x = 3, one square per piece, with a door in the middle.
$walls = static function (array $top = [], array $door = [], array $bottom = []): array {
    return ['version'=>1,
        'nodes'=>[['id'=>'n0','x'=>3,'y'=>0],['id'=>'n1','x'=>3,'y'=>1],['id'=>'n2','x'=>3,'y'=>2],['id'=>'n3','x'=>3,'y'=>3]],
        'segments'=>[
            ['id'=>'top','a'=>'n0','b'=>'n1','baseMode'=>'fixed','base'=>0,'height'=>2, ...$top],
            ['id'=>'door','a'=>'n1','b'=>'n2','baseMode'=>'fixed','base'=>0,'height'=>2,'interaction'=>'door', ...$door],
            ['id'=>'bottom','a'=>'n2','b'=>'n3','baseMode'=>'fixed','base'=>0,'height'=>2, ...$bottom],
        ]];
};

// ---- what may be stored
foreach (['glass','wood','stone','metal'] as $material) SceneEnvironment::validate('walls', $walls(['material'=>$material]));
SceneEnvironment::validate('walls', $walls(['material'=>'stone','broken'=>true], ['material'=>'wood','broken'=>true], ['material'=>'metal','broken'=>false]));
SceneEnvironment::validate('walls', $walls());
wallRefuses($walls(['material'=>'paper']), 'Invalid wall material', 'An unknown material is refused');
wallRefuses($walls(['material'=>null]), 'Invalid wall material', 'An empty material is refused');
wallRefuses($walls(['broken'=>true]), 'Only a wall with a material can be broken', 'A wall with no material cannot be broken');
wallRefuses($walls(['material'=>'stone','broken'=>'yes']), 'Invalid wall flag', 'Broken must be yes or no');
foreach (['left','right'] as $direction) {
    wallRefuses($walls(['material'=>'stone','movementDirection'=>$direction]), 'One-way walls cannot be breakable', "A wall passable only from the $direction can never be breakable");
    wallRefuses($walls(['material'=>'stone','sightDirection'=>$direction]), 'One-way walls cannot be breakable', "A wall seen through only from the $direction can never be breakable");
    SceneEnvironment::validate('walls', $walls(['movementDirection'=>$direction]));
}
echo "PASS wall materials and the broken flag are checked\n";

// ---- a broken wall stops no movement; the pieces beside it still do
$walker = static fn (float $column, float $row) => ['id'=>'t','column'=>$column,'row'=>$row,'width'=>1,'height'=>1,'levelId'=>'level-0'];
$crosses = static fn (array $model, int $row) => WallMovement::blocked($model, $walker(2, $row), $walker(3, $row), []);
wallCheck($crosses($walls(['material'=>'stone']), 0) === true, 'A breakable wall that is not broken is still a wall');
$broken = $walls(['material'=>'stone','broken'=>true]);
wallCheck($crosses($broken, 0) === false, 'The broken piece lets a walker through');
wallCheck($crosses($broken, 1) === true && $crosses($broken, 2) === true, 'The door and the wall beyond still block');
foreach ([['open'=>false], ['open'=>false,'locked'=>true], ['interaction'=>'window','sight'=>'pass']] as $door) {
    wallCheck($crosses($walls([], ['material'=>'wood','broken'=>true, ...$door]), 1) === false, 'A broken door or window is open for good: ' . json_encode($door));
}
$repaired = $broken; unset($repaired['segments'][0]['broken']);
wallCheck($crosses($repaired, 0) === true, 'Repairing puts the wall back');
// The server's own move check: a player is stopped by the standing wall and walks through the broken one.
$config = static fn (array $model) => ['environment'=>['walls'=>['revision'=>1,'value'=>$model]]];
$stopped = false;
try { WallMovement::assertAllowed($walker(2, 0), $walker(3, 0), $config($walls(['material'=>'stone'])), 'walk', [], false); }
catch (InvalidArgumentException $error) { $stopped = true; }
wallCheck($stopped, 'A player is stopped by a breakable wall that is standing');
WallMovement::assertAllowed($walker(2, 0), $walker(3, 0), $config($broken), 'walk', [], false);
WallMovement::assertAllowed($walker(2, 0), $walker(4, 0), $config($broken), 'forced', [], false);
echo "PASS a broken wall stops no movement\n";

// ---- what a player is told
$entry = ['revision'=>4, 'value'=>$walls(['material'=>'stone'], ['material'=>'wood','broken'=>true,'secret'=>true], ['material'=>'metal','broken'=>true])];
$seen = array_column(SceneEnvironment::project(['walls'=>$entry])['walls']['value']['segments'], null, 'id');
wallCheck(!array_key_exists('material', $seen['top']), 'A player is not told which standing walls are breakable');
wallCheck(($seen['bottom']['material'] ?? null) === 'metal' && ($seen['bottom']['broken'] ?? null) === true, 'A player is told a broken wall is broken, and what it was made of, to draw the rubble');
wallCheck(($seen['door']['broken'] ?? null) === true && !array_key_exists('secret', $seen['door']), 'A broken secret door reaches players as broken, without the secret flag');
$event = ['type'=>'environment.changed', 'sceneId'=>'scene', 'payload'=>['field'=>'walls', 'entry'=>$entry]];
$forPlayer = array_column(vttSyncV2ProjectEventForUser($event, ['isGM'=>false])['payload']['entry']['value']['segments'], null, 'id');
wallCheck(!array_key_exists('material', $forPlayer['top']) && ($forPlayer['bottom']['material'] ?? null) === 'metal', 'The live wall update hides materials from players the same way');
wallCheck(vttSyncV2ProjectEventForUser($event, ['isGM'=>true]) === $event, 'The GM keeps every material');
$snapshot = vttSyncV2ProjectSceneConfigForPlayer(['environment'=>['walls'=>$entry]]);
wallCheck(!array_key_exists('material', array_column($snapshot['environment']['walls']['value']['segments'], null, 'id')['top']), 'A player loading the scene is not told either');
echo "PASS players learn a wall's material only once it is broken\n";

// ---- only the GM saves walls, and a scene package may carry the marks
$path = sys_get_temp_dir() . '/vtt-breakable-walls-' . bin2hex(random_bytes(8)) . '.sqlite';
try {
    $store = new SyncV2Store($path);
    $command = ['type'=>'environment.set','sceneId'=>'scene','operationId'=>'walls-break-0001','baseRevision'=>0,'entityRevision'=>0,'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$broken]];
    $denied = false; try { $store->acceptBoardDomainCommand($command, 'cal', false); } catch (InvalidArgumentException $error) { $denied = true; }
    wallCheck($denied && $store->getSnapshot()['revision'] === 0, 'A player cannot break a wall');
    wallCheck($store->acceptBoardDomainCommand($command, 'GM', true)['status'] === 'accepted', 'The GM can');
    $saved = $store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls'];
    wallCheck($saved['revision'] === 1 && ($saved['value']['segments'][0]['broken'] ?? null) === true, 'The break is saved with the scene');
    $oneWay = [...$command, 'operationId'=>'walls-break-0002', 'baseRevision'=>1, 'entityRevision'=>1, 'payload'=>['field'=>'walls','expectedRevision'=>1,'value'=>$walls(['material'=>'stone','movementDirection'=>'left'])]];
    $refused = false; try { $store->acceptBoardDomainCommand($oneWay, 'GM', true); } catch (InvalidArgumentException $error) { $refused = str_contains($error->getMessage(), 'One-way'); }
    wallCheck($refused && $store->getSnapshot()['revision'] === 1, 'Even the GM cannot make a one-way wall breakable');
} finally {
    unset($store);
    foreach ([$path, $path . '-wal', $path . '-shm'] as $file) if (is_file($file)) @unlink($file);
}
echo "PASS only the GM breaks and repairs, and one-way walls stay unbreakable\n";
