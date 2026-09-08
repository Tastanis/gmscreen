<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/ScenePackage.php';
function verifyPackage(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$scene = ['id'=>'scene','name'=>'Balcony','mapUrl'=>'/maps/base.jpg','folderId'=>'castle'];
$snapshot = ['revision'=>19,'state'=>[
    'placements'=>['scene'=>['hero'=>['id'=>'hero','imageUrl'=>'/tokens/hero.png','levelId'=>'upper','hp'=>12,'conditions'=>['Prone'],'_entityRevision'=>5,'_movementUndo'=>[['row'=>2]],'_floorTraversal'=>['entry'=>'red']]],'other'=>['private-other'=>['id'=>'private-other']]],
    'sceneConfig'=>['scene'=>['mapLevels'=>['levels'=>[['id'=>'upper','imageUrl'=>'/maps/upper.png','cutouts'=>[['column'=>2,'row'=>2,'width'=>1,'height'=>1]]]]],
        'fogOfWar'=>['byLevel'=>['upper'=>['enabled'=>true,'revealedCells'=>['2,2'=>true]]]],'grid'=>['size'=>50],
        'userLevelState'=>['cal'=>['levelId'=>'upper']], 'pcTokenAssociations'=>['cal'=>'hero'], '_revision'=>7]],
    'drawings'=>['scene'=>['line'=>['id'=>'line','levelId'=>'upper','points'=>[[1,2],[3,4]],'_revision'=>4]]],
    'templates'=>['scene'=>['zone'=>['id'=>'zone','levelId'=>'upper','kind'=>'circle','radius'=>2,'_entityRevision'=>3]]],
    'combat'=>['secret'=>'not exported'],'routing'=>['activeSceneId'=>'other'],
]];
$before = $snapshot;
$package = ScenePackage::build($scene,$snapshot,['id'=>'castle','name'=>'Castle']);
verifyPackage($package['format']==='gmscreen-scene/v1' && $package['sourceRevision']===19, 'Package is versioned and identifies the coherent board revision.');
verifyPackage($package['scene']===$scene && $package['folder']['name']==='Castle', 'Scene catalog and folder metadata are included.');
verifyPackage($package['domains']['sceneConfig']['mapLevels']===$snapshot['state']['sceneConfig']['scene']['mapLevels'], 'Floor geometry is preserved.');
verifyPackage($package['domains']['sceneConfig']['fogOfWar']===$snapshot['state']['sceneConfig']['scene']['fogOfWar'], 'Fog is preserved.');
verifyPackage($package['domains']['placements']['hero']['hp']===12 && $package['domains']['placements']['hero']['conditions']===['Prone'], 'Token runtime values are preserved.');
verifyPackage(!isset($package['domains']['placements']['hero']['_movementUndo'],$package['domains']['placements']['hero']['_floorTraversal']), 'Stale movement receipts are omitted.');
verifyPackage(!isset($package['domains']['sceneConfig']['userLevelState'],$package['domains']['sceneConfig']['pcTokenAssociations']), 'Viewer preferences are excluded from a reusable scene package.');
verifyPackage($package['domains']['drawings']['line']['points']===[[1,2],[3,4]] && $package['domains']['templates']['zone']['radius']===2, 'Drawing and template details are preserved.');
verifyPackage(count($package['assetReferences'])===3 && in_array('/maps/base.jpg',$package['assetReferences'],true), 'Image references include the base map, upper map, and token.');
verifyPackage(!str_contains(json_encode($package),'private-other') && !isset($package['domains']['combat']), 'Other scenes and global combat are excluded.');
verifyPackage($snapshot===$before, 'Export never mutates its source snapshot.');
$preview = ScenePackage::preview($package);
verifyPackage($preview['counts']===['placements'=>1,'drawings'=>1,'templates'=>1,'floors'=>2], 'Import preview describes the exported domains.');
verifyPackage($preview['assetReferences']===$package['assetReferences'], 'Preview derives actual image references rather than trusting the manifest.');
$invalidCases = [];
$bad=$package; $bad['format']='unsupported'; $invalidCases[]=$bad;
$bad=$package; $bad['domains']['placements']['hero']['levelId']='missing'; $invalidCases[]=$bad;
$bad=$package; $bad['domains']['placements']['hero']['id']='wrong'; $invalidCases[]=$bad;
$bad=$package; $bad['domains']['sceneConfig']['mapLevels']['baseStairs']=[['id'=>'stairs','linkedLevelId'=>'missing']]; $invalidCases[]=$bad;
$bad=$package; $bad['domains']['sceneConfig']['fogOfWar']['byLevel']['missing']=[]; $invalidCases[]=$bad;
$bad=$package; $bad['scene']['mapUrl']='javascript:alert(1)'; $invalidCases[]=$bad;
$bad=$package; $bad['domains']['combat']=[]; $invalidCases[]=$bad;
foreach ($invalidCases as $bad) {
    $rejected=false;
    try { ScenePackage::preview($bad); } catch (InvalidArgumentException $error) { $rejected=true; }
    verifyPackage($rejected,'Malformed import preview is rejected.');
}
verifyPackage(ScenePackage::build($scene,['revision'=>0,'state'=>[]])['domains']['placements']===[], 'Unused catalog scenes can be exported.');
echo "Scene package: catalog, geometry, fog, placements, drawings/templates, references, scope and immutability passed.\n";
$reusable = $package;
$reusable['domains']['sceneConfig']['mapLevels']['baseStairs'] = [['id'=>'stairs','linkedLevelId'=>'upper']];
$reusable['domains']['sceneConfig']['mapLevels']['levels'][0]['stairs'] = [['id'=>'stairs','linkedLevelId'=>'level-0']];
$reusable['domains']['placements']['hero']['tokenId'] = 'hero';
$reusable['domains']['placements']['hero']['metadata'] = ['monsterId'=>'hero','abilities'=>[['id'=>'hero','text'=>'hero']]];
$reusable['domains']['placements']['hero']['conditions'] = [['name'=>'Marked','sourceId'=>'hero','duration'=>['targetTokenId'=>'hero'], 'instanceId'=>'old','riderExecutions'=>['rider'=>'turn-old']]];
$reusable['domains']['placements']['hero']['marks'] = ['test'=>['sourceId'=>'hero','targetId'=>'hero','abilityId'=>'hero']];
$source = $reusable;
$prepared = ScenePackage::prepareForNewScene($reusable,'scn-new-scene-123');
$copy = $prepared['package']; $ids = $prepared['idMap'];
$hero = $copy['domains']['placements'][$ids['placements']['hero']];
verifyPackage($hero['id']!=='hero' && $hero['tokenId']==='hero' && $hero['metadata']===$source['domains']['placements']['hero']['metadata'], 'Board IDs change without rewriting library or embedded ability IDs.');
verifyPackage($hero['conditions'][0]['sourceId']===$hero['id'] && $hero['conditions'][0]['duration']['targetTokenId']===$hero['id'] && !isset($hero['conditions'][0]['riderExecutions']), 'Condition references follow the copy and old execution receipts are removed.');
verifyPackage($hero['marks']['test']['targetId']===$hero['id'] && $hero['marks']['test']['abilityId']==='hero', 'Marks remap placement links, preserving ability IDs.');
$floors = $copy['domains']['sceneConfig']['mapLevels'];
verifyPackage($floors['baseStairs'][0]['linkedLevelId']===$ids['levels']['upper'] && $floors['levels'][0]['stairs'][0]['linkedLevelId']==='level-0', 'Stairs connect copied floors in both directions.');
verifyPackage($floors['baseStairs'][0]['id']===$floors['levels'][0]['stairs'][0]['id'] && $floors['baseStairs'][0]['id']!=='stairs', 'A copied stair and its mirror retain a shared fresh ID.');
verifyPackage(isset($copy['domains']['sceneConfig']['fogOfWar']['byLevel'][$ids['levels']['upper']]) && $hero['levelId']===$ids['levels']['upper'], 'Fog and occupants remain on the copied floor.');
verifyPackage($reusable===$source && $copy['scene']['folderId']===null, 'Preparation is immutable and does not inherit an external folder ID.');
verifyPackage(ScenePackage::prepareForNewScene($source,'scn-new-scene-123')['idMap']===$ids, 'Retry preparation has stable IDs.');
verifyPackage(ScenePackage::prepareForNewScene($source,'scn-another-scene-123')['idMap']['placements']!==$ids['placements'], 'Separate copies receive different IDs.');
$source['domains']['placements']['hero']['conditions'][0]['sourceId']='outside';
$rejected=false;
try { ScenePackage::prepareForNewScene($source,'scn-new-scene-123'); } catch (InvalidArgumentException $error) { $rejected=true; }
verifyPackage($rejected, 'Cross-scene effect references cannot silently point back to the original encounter.');
echo "Scene copy preparation: fresh IDs, linked geometry, combat references, stable retries and source preservation passed.\n";
