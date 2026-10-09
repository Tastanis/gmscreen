<?php
declare(strict_types=1);
// Floating plates and the height slant on the server: what a map design may carry, that a
// package keeps it, and that a player is sent it. Neither changes any rule: they are how a scene
// is drawn. The browser's side is in height-view.test.mjs.
require_once __DIR__ . '/../_common.php';
require_once __DIR__ . '/../../../lib/SceneImportValidation.php';
function floatCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function floatRefuses(array $value, string $expected, string $message): void {
    try { SceneEnvironment::validate('walls', $value); }
    catch (InvalidArgumentException $error) { floatCheck(str_contains($error->getMessage(), $expected), $message . ' (got: ' . $error->getMessage() . ')'); return; }
    throw new RuntimeException($message . ' (accepted)');
}
$ring = [['x'=>8,'y'=>18],['x'=>14,'y'=>18],['x'=>14,'y'=>24],['x'=>8,'y'=>24]];
$design = static fn (array $plate = [], array $extra = []) => ['version'=>1, 'nodes'=>[], 'segments'=>[],
    'roofs'=>[['id'=>'island','kind'=>'floor','levelId'=>'high','height'=>18.0,'points'=>$ring,'holes'=>[],'nodes'=>[], ...$plate]], 'ramps'=>[], ...$extra];

// ---- the floating mark
SceneEnvironment::validate('walls', $design());
SceneEnvironment::validate('walls', $design(['floating'=>true]));
SceneEnvironment::validate('walls', $design(['floating'=>false]));
foreach (['yes', 1, 0, null, [], 'true'] as $bad) floatRefuses($design(['floating'=>$bad]), 'floating', 'The floating mark is true or false, not ' . json_encode($bad));
echo "PASS a plate may be marked floating\n";

// ---- the height slant
SceneEnvironment::validate('walls', $design([], ['view'=>['slant'=>0.12]]));
SceneEnvironment::validate('walls', $design([], ['view'=>['slant'=>0]]));
SceneEnvironment::validate('walls', $design([], ['view'=>['slant'=>0.0]]));
SceneEnvironment::validate('walls', $design([], ['view'=>['slant'=>0.36]]));
SceneEnvironment::validate('walls', $design([], ['view'=>[]]));
foreach ([-0.01, 0.37, 1, 5, '0.12', null, true, [0.1], NAN, INF] as $bad) floatRefuses($design([], ['view'=>['slant'=>$bad]]), 'slant', 'A slant of ' . json_encode(is_float($bad) && !is_finite($bad) ? (string) $bad : $bad) . ' is refused');
floatRefuses($design([], ['view'=>'flat']), 'view', 'View settings are a list of named values');
floatRefuses($design([], ['view'=>['slant'=>0.1,'tilt'=>3]]), 'view', 'An unknown view setting is refused, not stored');
floatCheck(SceneEnvironment::MAX_VIEW_SLANT === 0.36, 'The steepest slant is the usual one');
echo "PASS a design may carry a height slant from 0 to the usual one\n";

// ---- it is stored, and a player is sent it
$stored = SceneEnvironment::apply([], ['field'=>'walls', 'expectedRevision'=>0, 'value'=>$design(['floating'=>true], ['view'=>['slant'=>0.12]])]);
floatCheck($stored['walls']['revision'] === 1 && $stored['walls']['value']['roofs'][0]['floating'] === true && $stored['walls']['value']['view']['slant'] === 0.12, 'The mark and the slant are stored with the design');
$player = SceneEnvironment::project($stored);
floatCheck($player['walls']['value']['roofs'][0]['floating'] === true && $player['walls']['value']['view']['slant'] === 0.12, 'A player is sent both: their screen draws the same scene');
// Removing a floor removes its plates; the slant stays.
$without = SceneEnvironment::removeLevels($stored, ['high']);
floatCheck($without['walls']['value']['roofs'] === [] && $without['walls']['value']['view']['slant'] === 0.12, 'Deleting a floor keeps the scene\'s slant');
echo "PASS the mark and the slant are stored and sent to players\n";

// ---- a map package carries both
require_once __DIR__ . '/../../../lib/ScenePackage.php';
$floors = ['baseStairs'=>[], 'levels'=>[['id'=>'high','name'=>'High','elevationSquares'=>18,'zIndex'=>1,'cutouts'=>[],'stairs'=>[]]]];
$package = ['format'=>'gmscreen-scene/v1', 'sourceRevision'=>0,
    'scene'=>['id'=>'scn-floating-test', 'name'=>'Floating test', 'folderId'=>null, 'mapUrl'=>'/dnd/vtt/storage/uploads/ground.jpg', 'thumbnailUrl'=>null, 'grid'=>['size'=>100,'locked'=>true,'visible'=>false,'offsetX'=>0,'offsetY'=>0]],
    'folder'=>null,
    'domains'=>['placements'=>[], 'drawings'=>[], 'templates'=>[], 'sceneConfig'=>['grid'=>['size'=>100,'locked'=>true,'visible'=>false,'offsetX'=>0,'offsetY'=>0], 'mapLevels'=>$floors,
        'environment'=>['walls'=>['revision'=>1, 'value'=>$design(['floating'=>true], ['view'=>['slant'=>0.12]])]]]]];
$prepared = ScenePackage::prepareForNewScene($package, 'scn-floating-copy-123');
$copied = $prepared['package']['domains']['sceneConfig']['environment']['walls']['value'];
floatCheck($copied['roofs'][0]['floating'] === true, 'A plate keeps its floating mark through a package');
floatCheck($copied['roofs'][0]['levelId'] === $prepared['idMap']['levels']['high'], 'and still follows its floor to the new id of that floor');
floatCheck($copied['view'] === ['slant'=>0.12], 'The slant of the scene comes through a package unchanged');
SceneImportValidation::validate($package);
$bad = $package; $bad['domains']['sceneConfig']['environment']['walls']['value']['view']['slant'] = 2;
$refused = false;
try { SceneImportValidation::validate($bad); } catch (InvalidArgumentException $error) { $refused = true; }
floatCheck($refused, 'A package with a slant out of range is refused on import');
echo "PASS a map package carries the mark and the slant\n";
