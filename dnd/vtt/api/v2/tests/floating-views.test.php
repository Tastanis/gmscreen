<?php
declare(strict_types=1);
// The two settings for what a viewer is shown of floating plates over and under them: what a map
// design may carry, that players are sent it, and that a package keeps it. The browser's side is in
// floating-views.test.mjs. Neither setting changes a rule; creatures are shown by line of sight.
require_once __DIR__ . '/../_common.php';
require_once __DIR__ . '/../../../lib/SceneImportValidation.php';
require_once __DIR__ . '/../../../lib/ScenePackage.php';
function viewCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function viewRefuses(array $value, string $expected, string $message): void {
    try { SceneEnvironment::validate('walls', $value); }
    catch (InvalidArgumentException $error) { viewCheck(str_contains($error->getMessage(), $expected), $message . ' (got: ' . $error->getMessage() . ')'); return; }
    throw new RuntimeException($message . ' (accepted)');
}
$ring = [['x'=>8,'y'=>18],['x'=>14,'y'=>18],['x'=>14,'y'=>24],['x'=>8,'y'=>24]];
$design = static fn (array $view) => ['version'=>1, 'nodes'=>[], 'segments'=>[],
    'roofs'=>[['id'=>'island','kind'=>'floor','levelId'=>'high','height'=>18.0,'points'=>$ring,'holes'=>[],'nodes'=>[],'floating'=>true]], 'ramps'=>[], 'view'=>$view];

viewCheck(SceneEnvironment::VIEW_ABOVE === ['off','shape','tier'] && SceneEnvironment::VIEW_BELOW === ['black','dim'], 'The choices are the ones the browser knows');
foreach (SceneEnvironment::VIEW_ABOVE as $above) foreach (SceneEnvironment::VIEW_BELOW as $below) {
    SceneEnvironment::validate('walls', $design(['above'=>$above, 'below'=>$below]));
    SceneEnvironment::validate('walls', $design(['slant'=>0.18, 'above'=>$above, 'below'=>$below]));
}
SceneEnvironment::validate('walls', $design(['above'=>'tier']));
SceneEnvironment::validate('walls', $design(['below'=>'dim']));
foreach (['on', 'Shape', '', 1, true, null, ['shape']] as $bad) viewRefuses($design(['above'=>$bad]), 'plates above', 'Plates above: ' . json_encode($bad) . ' is refused');
foreach (['dimmed', 'Dim', '', 0, false, null, ['dim']] as $bad) viewRefuses($design(['below'=>$bad]), 'plates below', 'Plates below: ' . json_encode($bad) . ' is refused');
viewRefuses($design(['above'=>'shape', 'glow'=>true]), 'view', 'An unknown view setting is still refused');
echo "PASS a design may say how floating plates over and under a viewer are shown\n";

$stored = SceneEnvironment::apply([], ['field'=>'walls', 'expectedRevision'=>0, 'value'=>$design(['slant'=>0.18, 'above'=>'tier', 'below'=>'dim'])]);
viewCheck($stored['walls']['value']['view'] === ['slant'=>0.18, 'above'=>'tier', 'below'=>'dim'], 'The settings are stored with the design');
viewCheck(SceneEnvironment::project($stored)['walls']['value']['view'] === ['slant'=>0.18, 'above'=>'tier', 'below'=>'dim'], 'A player is sent them: every screen draws the same scene');
$package = ['format'=>'gmscreen-scene/v1', 'sourceRevision'=>0,
    'scene'=>['id'=>'scn-views-test', 'name'=>'Views test', 'folderId'=>null, 'mapUrl'=>'/dnd/vtt/storage/uploads/ground.jpg', 'thumbnailUrl'=>null, 'grid'=>['size'=>72,'locked'=>true,'visible'=>false,'offsetX'=>0,'offsetY'=>0]],
    'folder'=>null,
    'domains'=>['placements'=>[], 'drawings'=>[], 'templates'=>[], 'sceneConfig'=>['grid'=>['size'=>72,'locked'=>true,'visible'=>false,'offsetX'=>0,'offsetY'=>0],
        'mapLevels'=>['baseStairs'=>[], 'levels'=>[['id'=>'high','name'=>'High','elevationSquares'=>18,'zIndex'=>1,'cutouts'=>[],'stairs'=>[]]]],
        'environment'=>['walls'=>['revision'=>1, 'value'=>$design(['slant'=>0.18, 'above'=>'tier', 'below'=>'dim'])]]]]];
SceneImportValidation::validate($package);
$copied = ScenePackage::prepareForNewScene($package, 'scn-views-copy-123')['package']['domains']['sceneConfig']['environment']['walls']['value'];
viewCheck($copied['view'] === ['slant'=>0.18, 'above'=>'tier', 'below'=>'dim'], 'A package carries them unchanged');
$bad = $package; $bad['domains']['sceneConfig']['environment']['walls']['value']['view']['above'] = 'everything';
$refused = false;
try { SceneImportValidation::validate($bad); } catch (InvalidArgumentException $error) { $refused = true; }
viewCheck($refused, 'A package with an unknown choice is refused on import');
echo "PASS the settings are stored, sent to players and carried by a package\n";
