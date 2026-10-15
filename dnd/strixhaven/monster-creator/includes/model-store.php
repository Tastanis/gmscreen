<?php
declare(strict_types=1);

/**
 * 3D minis: the monsters' model files (docs/vtt-3d-minis.md).
 *
 * A model is a binary glTF (.glb) with everything it needs inside it. It is checked here, then
 * stored under a name made from its own content (mini_<first 24 hex of its SHA-256>.glb) in
 * monster-creator/models/, where models/.htaccess runs nothing. The same file sent twice keeps
 * its one name, so nothing is stored twice and a monster's model address never changes under it.
 * Nothing of an uploader's file name is ever used.
 *
 * The browser and the upload tool hold files to the same rules (dnd/vtt/assets/js/ui/mini-model.js).
 * Who may store a model is the caller's business (the Monster Creator: the Director; the site
 * upload: the key).
 */

const MONSTER_MODEL_MAX_BYTES = 12582912; // 12 MB
const MONSTER_MODEL_MAX_TRIANGLES = 200000;
const MONSTER_MODEL_MAX_IMAGES = 16;
const MONSTER_MODEL_NAME_PATTERN = '/^mini_[a-f0-9]{24}\.glb$/D';
const MONSTER_MODEL_SUPPORTED_EXTENSIONS = [
    'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization', 'KHR_materials_emissive_strength',
    'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_clearcoat', 'KHR_materials_sheen',
    'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_iridescence', 'KHR_materials_anisotropy',
    'KHR_lights_punctual',
];

/** Whether a name is one this store could have made: nothing else is ever served or removed as a model. */
function monsterModelNameIsOurs($name): bool
{
    return is_string($name) && preg_match(MONSTER_MODEL_NAME_PATTERN, $name) === 1;
}

/** The name a model's bytes are stored under. */
function monsterModelName(string $bytes): string
{
    return 'mini_' . substr(hash('sha256', $bytes), 0, 24) . '.glb';
}

/**
 * Checks a .glb file. Returns ['ok'=>bool, 'problems'=>list<string>, 'stats'=>array].
 * The problems are plain sentences for the person reading them.
 */
function monsterModelInspect(string $bytes): array
{
    $problems = [];
    $stats = ['bytes'=>strlen($bytes), 'meshes'=>0, 'primitives'=>0, 'triangles'=>0, 'nodes'=>0, 'materials'=>0, 'images'=>0, 'animations'=>0, 'skins'=>0];
    $fail = static fn(string $why): array => ['ok'=>false, 'problems'=>[$why], 'stats'=>$stats];
    if (strlen($bytes) > MONSTER_MODEL_MAX_BYTES) $problems[] = sprintf('The file is %.1f MB; a mini may be at most %d MB.', strlen($bytes) / 1048576, MONSTER_MODEL_MAX_BYTES / 1048576);
    if (strlen($bytes) < 20) return $fail('It is not a .glb file (too short).');
    $header = unpack('Vmagic/Vversion/Vlength/VjsonLength/VjsonType', substr($bytes, 0, 20));
    if ($header['magic'] !== 0x46546C67) return $fail('It is not a .glb file (a binary glTF starts with "glTF").');
    if ($header['version'] !== 2) return $fail('It is not glTF 2.0.');
    if ($header['length'] !== strlen($bytes)) return $fail('The file is cut short or has extra bytes at its end.');
    if ($header['jsonType'] !== 0x4E4F534A || 20 + $header['jsonLength'] > strlen($bytes)) return $fail('Its first part is not the glTF description.');
    try { $json = json_decode(substr($bytes, 20, $header['jsonLength']), true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { return $fail('Its glTF description is not valid JSON.'); }
    if (!is_array($json) || array_is_list($json)) return $fail('Its glTF description is not an object.');
    $offset = 20 + $header['jsonLength'];
    if ($offset + 8 <= strlen($bytes)) {
        $bin = unpack('Vlength/Vtype', substr($bytes, $offset, 8));
        if ($bin['type'] !== 0x004E4942 || $offset + 8 + $bin['length'] > strlen($bytes)) $problems[] = 'Its second part is not the binary data.';
    }
    if (!str_starts_with((string) ($json['asset']['version'] ?? ''), '2.')) $problems[] = 'Its glTF description does not say version 2.';
    $list = static fn(string $key): array => is_array($json[$key] ?? null) && array_is_list($json[$key]) ? $json[$key] : [];
    foreach ($list('buffers') as $index => $buffer) {
        if (is_array($buffer) && array_key_exists('uri', $buffer)) $problems[] = 'Buffer ' . $index . ' points to a file outside the .glb. Everything must be inside the one file.';
    }
    foreach ($list('images') as $index => $image) {
        if (!is_array($image)) continue;
        if (array_key_exists('uri', $image)) $problems[] = 'Image ' . $index . ' points to a picture outside the .glb. Pack textures into the file.';
        elseif (!in_array($image['mimeType'] ?? null, ['image/png', 'image/jpeg'], true)) $problems[] = 'Image ' . $index . ' is ' . (is_string($image['mimeType'] ?? null) ? $image['mimeType'] : 'of no stated kind') . '; use PNG or JPEG textures.';
    }
    foreach ((is_array($json['extensionsRequired'] ?? null) ? $json['extensionsRequired'] : []) as $name) {
        if (!in_array((string) $name, MONSTER_MODEL_SUPPORTED_EXTENSIONS, true)) $problems[] = 'It needs the glTF extension ' . (string) $name . ', which the board cannot read (export without Draco or meshopt compression).';
    }
    $accessors = $list('accessors');
    foreach ($list('meshes') as $mesh) {
        $stats['meshes']++;
        foreach ((is_array($mesh['primitives'] ?? null) ? $mesh['primitives'] : []) as $primitive) {
            $stats['primitives']++;
            $mode = $primitive['mode'] ?? 4;
            $source = is_int($primitive['indices'] ?? null) ? $primitive['indices'] : ($primitive['attributes']['POSITION'] ?? null);
            $count = is_int($source) && is_int($accessors[$source]['count'] ?? null) ? $accessors[$source]['count'] : 0;
            if ($mode === 4) $stats['triangles'] += intdiv($count, 3);
            elseif ($mode === 5 || $mode === 6) $stats['triangles'] += max(0, $count - 2);
        }
    }
    $stats['nodes'] = count($list('nodes'));
    $stats['materials'] = count($list('materials'));
    $stats['images'] = count($list('images'));
    $stats['animations'] = count($list('animations'));
    $stats['skins'] = count($list('skins'));
    if ($stats['meshes'] === 0) $problems[] = 'It has no meshes: there is nothing to draw.';
    if ($stats['triangles'] > MONSTER_MODEL_MAX_TRIANGLES) $problems[] = 'It has ' . $stats['triangles'] . ' triangles; a mini may have at most ' . MONSTER_MODEL_MAX_TRIANGLES . '.';
    if ($stats['images'] > MONSTER_MODEL_MAX_IMAGES) $problems[] = 'It has ' . $stats['images'] . ' textures; a mini may have at most ' . MONSTER_MODEL_MAX_IMAGES . '.';
    return ['ok'=>$problems === [], 'problems'=>$problems, 'stats'=>$stats];
}

/**
 * Checks and stores a model. Returns ['file'=>name, 'stored'=>bool (false when it was already
 * there), 'stats'=>...]. Throws InvalidArgumentException with the problems, in plain words,
 * when the file is refused; RuntimeException when it could not be written.
 */
function monsterModelStore(string $bytes, string $dir): array
{
    $check = monsterModelInspect($bytes);
    if (!$check['ok']) throw new InvalidArgumentException('The model was not accepted: ' . implode(' ', $check['problems']));
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException('The models folder could not be made.');
    $name = monsterModelName($bytes);
    $path = rtrim($dir, '/') . '/' . $name;
    if (is_file($path) && hash_file('sha256', $path) === hash('sha256', $bytes)) return ['file'=>$name, 'stored'=>false, 'stats'=>$check['stats']];
    $temporary = $path . '.tmp.' . bin2hex(random_bytes(6));
    if (file_put_contents($temporary, $bytes, LOCK_EX) !== strlen($bytes)) { @unlink($temporary); throw new RuntimeException('The model could not be written.'); }
    @chmod($temporary, 0644);
    if (!rename($temporary, $path)) { @unlink($temporary); throw new RuntimeException('The model could not be written.'); }
    return ['file'=>$name, 'stored'=>true, 'stats'=>$check['stats']];
}

/**
 * A monster's model in its one saved shape, or null: {file, scale, yaw, lift}. The same rules as
 * mini-model.js's storedMiniModel. A file name this store could not have made is dropped.
 */
function monsterModelNormalize($value): ?array
{
    if (!is_array($value)) return null;
    $file = is_string($value['file'] ?? null) ? trim($value['file']) : '';
    if (!monsterModelNameIsOurs($file)) return null;
    $number = static fn($raw, float $low, float $high, float $fallback): float => is_numeric($raw) && is_finite((float) $raw) ? max($low, min($high, (float) $raw)) : $fallback;
    $yaw = is_numeric($value['yaw'] ?? null) && is_finite((float) $value['yaw']) ? fmod(fmod((float) $value['yaw'] + 180, 360) + 360, 360) - 180 : 0.0;
    return ['file'=>$file, 'scale'=>$number($value['scale'] ?? null, 0.25, 4, 1), 'yaw'=>$yaw, 'lift'=>$number($value['lift'] ?? null, -2, 4, 0)];
}
