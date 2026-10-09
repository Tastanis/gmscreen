<?php
declare(strict_types=1);
// A free-standing object (a pillar, a crate, a crystal) is a ring of walls that share a `group`
// name. What may be stored, what a player is told, and that a map package carries it.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function groupCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function groupRefused(array $value, string $because, string $message): void {
    try { SceneEnvironment::validate('walls', $value); }
    catch (InvalidArgumentException $error) { groupCheck(str_contains($error->getMessage(), $because), $message . ': refused for the wrong reason: ' . $error->getMessage()); return; }
    throw new RuntimeException($message . ': it was accepted');
}
/** Two walls end to end, each with the extra fields given. */
$walls = static fn (array $first = [], array $second = []) => ['version'=>1,
    'nodes'=>[['id'=>'a','x'=>0,'y'=>0],['id'=>'b','x'=>1,'y'=>0],['id'=>'c','x'=>2,'y'=>0]],
    'segments'=>[['id'=>'one','a'=>'a','b'=>'b', ...$first], ['id'=>'two','a'=>'b','b'=>'c', ...$second]]];

// ---- what may be stored -----------------------------------------------------------------
SceneEnvironment::validate('walls', $walls(['material'=>'stone','group'=>'orchard-break-T6'], ['material'=>'stone','group'=>'orchard-break-T6']));
SceneEnvironment::validate('walls', $walls(['material'=>'wood','group'=>'crate_1.a:b'], ['material'=>'stone','group'=>'pillar-2']));
SceneEnvironment::validate('walls', $walls(['material'=>'wood','group'=>'crate-1','broken'=>true], ['material'=>'wood']));
SceneEnvironment::validate('walls', $walls(['material'=>'glass','group'=>str_repeat('x', 128)]));
foreach (['', 'two words', 'tab\there', str_repeat('x', 129), 'café'] as $name) groupRefused($walls(['material'=>'stone','group'=>$name]), 'Invalid wall group name', 'Group name ' . json_encode($name));
groupRefused($walls(['material'=>'stone','group'=>7]), 'Invalid wall group name', 'A number as a group name');
groupRefused($walls(['group'=>'crate-1']), 'A wall group needs a material', 'A group name on a wall that cannot break');
groupRefused($walls(['material'=>'wood','group'=>'crate-1'], ['material'=>'stone','group'=>'crate-1']), 'must share a material', 'Two materials in one object');
groupRefused($walls(['material'=>'wood','group'=>'crate-1','movementDirection'=>'left']), 'One-way walls cannot be breakable', 'A one-way wall in an object');
echo "PASS a group is a plain name, needs a material, and holds one material\n";

// ---- what a player is told -------------------------------------------------------------
$seen = array_column(SceneEnvironment::project(['walls'=>['revision'=>1,'value'=>$walls(['material'=>'stone','group'=>'tooth','broken'=>true], ['material'=>'wood','group'=>'crate'])]])['walls']['value']['segments'], null, 'id');
groupCheck(($seen['one']['group'] ?? null) === 'tooth' && ($seen['one']['material'] ?? null) === 'stone', 'A player is sent the group and material of a broken object, to draw its heap');
groupCheck(!array_key_exists('group', $seen['two']) && !array_key_exists('material', $seen['two']), 'and neither for one that still stands');
echo "PASS a player learns an object is one thing only when it is broken\n";

// ---- a map package carries material and group ----------------------------------------------
require_once __DIR__ . '/../../../lib/ScenePackage.php';
$grid = ['size'=>100,'locked'=>true,'visible'=>false,'offsetX'=>0,'offsetY'=>0];
$package = ['format'=>'gmscreen-scene/v1', 'sourceRevision'=>0,
    'scene'=>['id'=>'scn-groups-test', 'name'=>'Groups test', 'folderId'=>null, 'mapUrl'=>'/dnd/vtt/storage/uploads/ground.jpg', 'thumbnailUrl'=>null, 'grid'=>$grid],
    'folder'=>null,
    'domains'=>['placements'=>[], 'drawings'=>[], 'templates'=>[], 'sceneConfig'=>['grid'=>$grid, 'mapLevels'=>['baseStairs'=>[], 'levels'=>[]],
        'environment'=>['walls'=>['revision'=>1, 'value'=>$walls(['material'=>'stone','group'=>'orchard-break-T6'], ['material'=>'glass'])]]]]];
SceneImportValidation::validate($package);
$copied = array_column(ScenePackage::prepareForNewScene($package, 'scn-groups-copy-123')['package']['domains']['sceneConfig']['environment']['walls']['value']['segments'], null, 'id');
groupCheck($copied['one']['material'] === 'stone' && $copied['one']['group'] === 'orchard-break-T6' && $copied['two']['material'] === 'glass' && !isset($copied['two']['group']), 'Material and group come through a package unchanged: ' . json_encode($copied));
foreach ([
    'a material on a one-way wall' => ['material'=>'stone','movementDirection'=>'right'],
    'a group with no material' => ['group'=>'crate-1'],
    'a bad group name' => ['material'=>'stone','group'=>'no spaces allowed'],
    'a material the app does not know' => ['material'=>'ice'],
] as $what => $extra) {
    $bad = $package; $bad['domains']['sceneConfig']['environment']['walls']['value'] = $walls($extra);
    $refused = false;
    try { SceneImportValidation::validate($bad); } catch (InvalidArgumentException $error) { $refused = true; }
    groupCheck($refused, "A package with $what is refused on import");
}
$bad = $package; $bad['domains']['sceneConfig']['environment']['walls']['value'] = $walls(['material'=>'stone','group'=>'g'], ['material'=>'wood','group'=>'g']);
$refused = false;
try { SceneImportValidation::validate($bad); } catch (InvalidArgumentException $error) { $refused = true; }
groupCheck($refused, 'A package with two materials in one group is refused on import');
echo "PASS a map package carries material and group, and bad ones are refused\n";

// ---- the GM breaks an object by hand as one save ----------------------------------------
$store = new SyncV2Store(':memory:');
$store->migrateLegacyPlacements(['placements'=>['scene'=>[['id'=>'t','column'=>5,'row'=>5]]]]);
$snap = $store->getSnapshot();
$set = static fn (string $operation, array $value, int $expected) => $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>$operation,'sceneId'=>'scene','baseRevision'=>$store->getSnapshot()['revision'],
    'entityRevision'=>(int) ($store->getSnapshot()['state']['sceneConfig']['scene']['_revision'] ?? 0),'payload'=>['field'=>'walls','expectedRevision'=>$expected,'value'=>$value]], 'gm', true);
groupCheck($set('groups-make-object', $walls(['material'=>'stone','group'=>'tooth'], ['material'=>'stone','group'=>'tooth']), 0)['status'] === 'accepted', 'The GM saves an object');
groupCheck($set('groups-break-object', $walls(['material'=>'stone','group'=>'tooth','broken'=>true], ['material'=>'stone','group'=>'tooth','broken'=>true]), 1)['status'] === 'accepted', 'and breaks it');
try { $set('groups-mixed-object', $walls(['material'=>'stone','group'=>'tooth'], ['material'=>'wood','group'=>'tooth']), 2); groupCheck(false, 'Two materials in one object were saved'); }
catch (InvalidArgumentException $error) { groupCheck(str_contains($error->getMessage(), 'must share a material'), 'The server refuses two materials in one object'); }
echo "PASS the server holds the same rules for a save by hand\n";
