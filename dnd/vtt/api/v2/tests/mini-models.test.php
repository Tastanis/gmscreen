<?php
declare(strict_types=1);
// 3D minis on the server (docs/vtt-3d-minis.md): which .glb files are accepted, how they are
// stored and named, the model's saved shape, and that it reaches the VTT and survives a re-upload.
// Run by dnd/vtt/assets/js/ui/__tests__/mini-models.test.mjs.
require_once __DIR__ . '/../../../../strixhaven/monster-creator/includes/model-store.php';
require_once __DIR__ . '/../../../api/monster_helpers.php';
require_once __DIR__ . '/../../../../admin/site-upload/lib.php';
function miniCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

/** A one-triangle .glb, with optional changes to its description. */
function miniGlb(array $change = [], ?string $bin = null, array $set = []): string
{
    $bin ??= pack('g9', 0, 0, 0, 1, 0, 0, 0, 1, 0);
    $json = array_replace_recursive([
        'asset'=>['version'=>'2.0'], 'scene'=>0, 'scenes'=>[['nodes'=>[0]]], 'nodes'=>[['mesh'=>0]],
        'meshes'=>[['primitives'=>[['attributes'=>['POSITION'=>0], 'mode'=>4]]]],
        'accessors'=>[['bufferView'=>0, 'componentType'=>5126, 'count'=>3, 'type'=>'VEC3', 'min'=>[0,0,0], 'max'=>[1,1,0]]],
        'bufferViews'=>[['buffer'=>0, 'byteLength'=>strlen($bin)]], 'buffers'=>[['byteLength'=>strlen($bin)]],
    ], $change);
    $json = [...$json, ...$set];
    $text = json_encode($json, JSON_UNESCAPED_SLASHES);
    $text .= str_repeat(' ', (4 - strlen($text) % 4) % 4);
    $bin .= str_repeat("\0", (4 - strlen($bin) % 4) % 4);
    $body = pack('V2', strlen($text), 0x4E4F534A) . $text . pack('V2', strlen($bin), 0x004E4942) . $bin;
    return pack('V3', 0x46546C67, 2, 12 + strlen($body)) . $body;
}

$scratch = sys_get_temp_dir() . '/vtt-minis-' . bin2hex(random_bytes(6));
mkdir($scratch, 0700, true);
try {

// ---- which files are accepted ----------------------------------------------------------------
$good = miniGlb();
$check = monsterModelInspect($good);
miniCheck($check['ok'] && $check['stats']['meshes'] === 1 && $check['stats']['triangles'] === 1, 'A self-contained .glb is accepted and counted: ' . json_encode($check));
$refused = static function (string $bytes, string $because, string $message): void {
    $check = monsterModelInspect($bytes);
    miniCheck(!$check['ok'] && str_contains(implode(' ', $check['problems']), $because), $message . ': ' . json_encode($check['problems']));
};
$refused('<?php echo 1; ?>' . str_repeat('x', 30), 'not a .glb', 'A PHP file named .glb is refused');
$refused('glTF', 'too short', 'A stub is refused');
$refused(substr($good, 0, -4), 'cut short', 'A cut-off file is refused');
$refused(substr_replace($good, pack('V', 1), 4, 4), 'not glTF 2.0', 'glTF 1 is refused');
$refused(miniGlb(['buffers'=>[['byteLength'=>36, 'uri'=>'https://example.invalid/mesh.bin']]]), 'outside the .glb', 'A buffer that points outside the file is refused');
$refused(miniGlb(['images'=>[['uri'=>'skin.png']]]), 'outside the .glb', 'A texture that points outside the file is refused');
$refused(miniGlb(['images'=>[['bufferView'=>0, 'mimeType'=>'image/svg+xml']]]), 'PNG or JPEG', 'A texture of another kind is refused');
$refused(miniGlb(['extensionsRequired'=>['KHR_draco_mesh_compression']]), 'Draco', 'A file that needs Draco is refused');
$refused(miniGlb([], null, ['meshes'=>[]]), 'nothing to draw', 'A file with no meshes is refused');
$refused(miniGlb(['accessors'=>[['count'=>3 * 200001]]]), 'triangles', 'Too many triangles are refused');
miniCheck(monsterModelInspect(miniGlb(['extensionsRequired'=>['KHR_materials_unlit']]))['ok'], 'An extension the board reads is fine');

// ---- how a model is stored ---------------------------------------------------------------
$dir = $scratch . '/models';
$first = monsterModelStore($good, $dir);
miniCheck(monsterModelNameIsOurs($first['file']) && $first['stored'] === true && is_file($dir . '/' . $first['file']), 'Stored under a name made from its content: ' . $first['file']);
miniCheck($first['file'] === 'mini_' . substr(hash('sha256', $good), 0, 24) . '.glb', 'The name is the first 24 hex of its SHA-256');
$again = monsterModelStore($good, $dir);
miniCheck($again['file'] === $first['file'] && $again['stored'] === false && count(glob($dir . '/*')) === 1, 'The same file again keeps its one name and is not written twice');
$threw = false;
try { monsterModelStore('<?php system($_GET[1]); ?>', $dir); } catch (InvalidArgumentException $error) { $threw = str_contains($error->getMessage(), 'not accepted'); }
miniCheck($threw && count(glob($dir . '/*')) === 1, 'A refused file leaves nothing behind');
foreach (['mini_abc.glb', '../mini_' . str_repeat('a', 24) . '.glb', 'mini_' . str_repeat('a', 24) . '.php', 'MINI_' . str_repeat('a', 24) . '.glb', 'mini_' . str_repeat('a', 24) . '.glb.php'] as $name) miniCheck(!monsterModelNameIsOurs($name), 'Not a stored model name: ' . $name);
echo "PASS only self-contained .glb files are stored, each once, under a name made from its content\n";

// ---- the saved shape -----------------------------------------------------------------------
$file = $first['file'];
miniCheck(monsterModelNormalize(['file'=>$file]) === ['file'=>$file, 'scale'=>1.0, 'yaw'=>0.0, 'lift'=>0.0], 'Defaults: scale 1, no turn, no lift');
$n = monsterModelNormalize(['file'=>$file, 'scale'=>99, 'yaw'=>270, 'lift'=>-9]);
miniCheck($n['scale'] === 4.0 && abs($n['yaw'] + 90) < 1e-9 && $n['lift'] === -2.0, 'Settings are kept within range and the turn wraps: ' . json_encode($n));
foreach ([null, 'mini.glb', ['file'=>'https://example.invalid/x.glb'], ['file'=>'werewolf.glb'], ['url'=>'/x.glb']] as $bad) miniCheck(monsterModelNormalize($bad) === null, 'Not a model: ' . json_encode($bad));

// ---- it reaches the VTT --------------------------------------------------------------------
$monster = ['id'=>'wolf', 'name'=>'Werewolf', 'abilities'=>['action'=>[['name'=>'Bite']]], 'model'=>['file'=>$file, 'scale'=>1.2, 'extra'=>'dropped']];
$snapshot = normalizeMonsterSnapshot($monster);
miniCheck(($snapshot['model'] ?? null) === ['file'=>$file, 'scale'=>1.2, 'yaw'=>0.0, 'lift'=>0.0], 'The VTT\'s monster record carries the model in its saved shape: ' . json_encode($snapshot['model'] ?? null));
miniCheck(!isset(normalizeMonsterSnapshot([...$monster, 'model'=>['file'=>'../../etc/passwd']])['model']), 'A model with a name the store could not have made is dropped');
echo "PASS a monster's model reaches the VTT in one shape, and nothing else is turned into an address\n";

// ---- a creature uploaded again keeps its mini ----------------------------------------------
$data = ['tabs'=>['t'=>['name'=>'Foes', 'subTabs'=>['s'=>['name'=>'General', 'monsters'=>['wolf']]]]], 'monsters'=>['wolf'=>['name'=>'Werewolf', 'abilities'=>[], 'model'=>['file'=>$file, 'scale'=>1.2]]]];
$merged = siteUploadMergeCreatures($data, [['file'=>'werewolf.json', 'monster'=>['name'=>'Werewolf', 'abilities'=>['action'=>[]]]]], ['replace'=>true], 1000);
miniCheck(($merged['data']['monsters']['wolf']['model']['file'] ?? null) === $file, 'Replacing a creature with a file that names no model keeps its mini');
$other = 'mini_' . str_repeat('b', 24) . '.glb';
$merged = siteUploadMergeCreatures($data, [['file'=>'werewolf.json', 'monster'=>['name'=>'Werewolf', 'abilities'=>[], 'model'=>['file'=>$other]]]], ['replace'=>true], 1000);
miniCheck(($merged['data']['monsters']['wolf']['model']['file'] ?? null) === $other, 'A file that names a model replaces it');
echo "PASS a creature uploaded again keeps its mini unless the new file names another\n";

} finally {
    foreach (glob($scratch . '/models/*') ?: [] as $entry) @unlink($entry);
    @rmdir($scratch . '/models');
    @rmdir($scratch);
}
