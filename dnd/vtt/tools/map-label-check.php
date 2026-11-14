<?php
declare(strict_types=1);
// The load check of a labelled map, run on a package before it is delivered:
//   php dnd/vtt/tools/map-label-check.php "<map>.vttmap"
// Prints what the app will list to the Director on import (MapLabels::check), how many objects got walls and stood-on
// tops, and the stairs worked out from ramps. Reads the package only; writes nothing.
require_once __DIR__ . '/../lib/SyncV2Store.php';

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) { fwrite(STDERR, "Usage: php map-label-check.php <map.vttmap>\n"); exit(2); }
$file = json_decode((string) file_get_contents($path), true);
$package = $file['package'] ?? $file;
$config = $package['domains']['sceneConfig'] ?? null;
if (!is_array($config)) { fwrite(STDERR, "No scene in that file.\n"); exit(2); }
try {
    foreach ($config['environment'] ?? [] as $field => $entry) SceneEnvironment::validate($field, $entry['value']);
} catch (InvalidArgumentException $error) { echo 'REFUSED by the app: ' . $error->getMessage() . "\n"; exit(1); }
$walls = $config['environment']['walls']['value'] ?? [];
if (!MapLabels::labelled($walls)) echo "Not labelled (walls.labels is not 1): the app guesses as it does for old maps.\n";
$config['environment']['walls']['value'] = MapLabels::expand($walls, $config);
$lines = MapLabels::check($config);
$levels = MapLabels::labelled($walls) ? MapLabels::stairs($walls['ramps'] ?? [], $config['mapLevels'] ?? []) : ($config['mapLevels'] ?? []);
$objects = $walls['objects'] ?? [];
echo count($objects) . ' objects, ' . count(array_filter($objects, fn ($o) => ($o['standOn'] ?? false) === true)) . ' stood on; '
    . count(WallBoxes::boxes($config['environment']['walls']['value'])) . " standing tops built.\n";
echo count($levels['baseStairs'] ?? []) + array_sum(array_map(fn ($l) => count($l['stairs'] ?? []), $levels['levels'] ?? [])) . " stair ends from ramps.\n";
// Breakable floor plates (plan part 4): each plate's material and how many grid squares break one at a time.
$plateSquares = [];
$cutsOf = []; foreach ($config['mapLevels']['levels'] ?? [] as $level) $cutsOf[$level['id'] ?? ''] = $level['cutouts'] ?? [];
foreach (FloorSupport::surfaces(['nodes' => $walls['nodes'] ?? [], 'roofs' => array_map(fn ($r) => [...$r, 'broken' => []], $walls['roofs'] ?? [])]) as $roof) {
    if (!FloorSupport::breakablePlate($roof)) continue;
    $squares = FloorSupport::plateSquares($roof, $cutsOf[$roof['levelId'] ?? ''] ?? []);
    foreach ($squares as [$c, $r]) $plateSquares[] = FloorSupport::squareId($roof['id'], $c, $r);
    echo 'Breakable floor ' . $roof['id'] . ' (' . $roof['material'] . '): ' . count($squares) . " squares.
";
}
echo $lines ? "Load check:\n- " . implode("\n- ", $lines) . "\n" : "Load check: nothing to report.\n";
// The art's breakable pieces (board3d/breakable-art.mjs), when the pieces file is given as a second argument:
//   php dnd/vtt/tools/map-label-check.php "<map>.vttmap" "<art pieces>.json"
// Every breakable thing on the map should have a piece, named as its label is (the object's id, else its walls' group,
// else the wall's id), and every piece a thing that breaks (plan part 4, November 8, 2026). A breakable floor plate's
// squares are pieces "<plate id>@<col>,<row>", one for every grid square the plate covers.
if (isset($argv[2])) {
    $pieces = json_decode((string) @file_get_contents($argv[2]), true)['pieces'] ?? null;
    if (!is_array($pieces)) { echo "Art pieces: that file has no pieces.\n"; exit(1); }
    $used = []; $missing = [];
    foreach ($config['environment']['walls']['value']['segments'] ?? [] as $edge) {
        if (!is_string($edge['material'] ?? null)) continue;
        $names = array_values(array_filter([$edge['object'] ?? null, $edge['group'] ?? null, $edge['id'] ?? null], 'is_string'));
        $name = null; foreach ($names as $candidate) if (isset($pieces[$candidate])) { $name = $candidate; break; }
        if ($name !== null) $used[$name] = true; else $missing[$names[0] ?? '?'] = true;
    }
    foreach ($plateSquares as $name) { if (isset($pieces[$name])) $used[$name] = true; else $missing[$name] = true; }
    $unused = array_values(array_diff(array_keys($pieces), array_keys($used)));
    echo count($used) . ' breakable things have their piece in the art (' . count($pieces) . " pieces in the file).\n";
    if ($missing) echo 'Breakable with NO piece in the art (it will break, and its art will stay): ' . implode(', ', array_keys($missing)) . "\n";
    if ($unused) echo 'Pieces nothing on the map breaks: ' . implode(', ', $unused) . "\n";
}
