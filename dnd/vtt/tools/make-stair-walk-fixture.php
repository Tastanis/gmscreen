<?php
declare(strict_types=1);
// Writes the answers the server's floor code gives for walks over stairs, so the browser's copy
// of the rule (assets/js/ui/stair-walk.mjs) can be checked against them. Run again whenever
// FloorGeometry.php changes how a stair is crossed:
//
//   php dnd/vtt/tools/make-stair-walk-fixture.php > dnd/vtt/assets/js/ui/__tests__/fixtures/stair-walk-server.json
//
// Every case is a short chain of moves by one token; each move starts from what the last one left.
require_once __DIR__ . '/../lib/FloorGeometry.php';
mt_srand(20261008);

$box = static fn ($l, $t, $r, $b) => [['column'=>$l,'row'=>$t],['column'=>$r,'row'=>$t],['column'=>$r,'row'=>$b],['column'=>$l,'row'=>$b]];
/** A straight stair over the box, its head on the named side. */
$stair = static function (string $id, int $l, int $t, int $r, int $b, string $head) use ($box): array {
    $colors = [];
    $edges = ['north'=>[], 'south'=>[], 'west'=>[], 'east'=>[]];
    for ($x = $l; $x < $r; $x++) { $edges['north'][] = "$x,$t-" . ($x + 1) . ",$t"; $edges['south'][] = "$x,$b-" . ($x + 1) . ",$b"; }
    for ($y = $t; $y < $b; $y++) { $edges['west'][] = "$l,$y-$l," . ($y + 1); $edges['east'][] = "$r,$y-$r," . ($y + 1); }
    $foot = ['north'=>'south', 'south'=>'north', 'west'=>'east', 'east'=>'west'][$head];
    foreach ($edges[$head] as $key) $colors[$key] = 'green';
    foreach ($edges[$foot] as $key) $colors[$key] = 'red';
    return ['id'=>$id, 'corners'=>$box($l, $t, $r, $b), 'edgeColors'=>$colors];
};
$scenes = [];
foreach ([
    ['one wide, head north', 10, 10, 11, 13, 'north'], ['two wide, head south', 10, 10, 12, 18, 'south'],
    ['one wide, head east', 8, 12, 12, 13, 'east'], ['three wide, head west', 9, 9, 13, 12, 'west'], ['one square, head west', 12, 11, 13, 12, 'west'],
] as [$name, $l, $t, $r, $b, $head]) {
    $shape = $stair('s', $l, $t, $r, $b, $head);
    // Once from the ground to a floor, once between two floors with a hidden floor between them.
    $scenes[] = ['name'=>"$name, ground to a floor", 'box'=>[$l, $t, $r, $b], 'levels'=>['upper', 'level-0'], 'mapLevels'=>[
        'baseStairs'=>[[...$shape, 'direction'=>'up', 'linkedLevelId'=>'upper']],
        'levels'=>[['id'=>'upper', 'zIndex'=>1, 'elevationSquares'=>3, 'stairs'=>[[...$shape, 'direction'=>'down', 'linkedLevelId'=>'level-0']]]]]];
    $scenes[] = ['name'=>"$name, between two floors", 'box'=>[$l, $t, $r, $b], 'levels'=>['top', 'mid'], 'mapLevels'=>[
        'baseStairs'=>[],
        'levels'=>[
            ['id'=>'top', 'zIndex'=>5, 'elevationSquares'=>18, 'stairs'=>[[...$shape, 'direction'=>'down', 'linkedLevelId'=>'mid']]],
            ['id'=>'attic', 'zIndex'=>3, 'hidden'=>true, 'stairs'=>[[...$shape, 'direction'=>'up', 'linkedLevelId'=>'top']]],
            ['id'=>'mid', 'zIndex'=>2, 'elevationSquares'=>12, 'stairs'=>[[...$shape, 'direction'=>'up', 'linkedLevelId'=>'top']]],
        ]]];
}
$cases = [];
foreach ($scenes as $scene) {
    [$l, $t, $r, $b] = $scene['box'];
    $alongRows = ($b - $t) >= ($r - $l) && !str_contains($scene['name'], 'head east') && !str_contains($scene['name'], 'head west');
    for ($n = 0; $n < 24; $n++) {
        $size = [1, 1, 1, 2, 2, 3][mt_rand(0, 5)];
        $half = static fn () => mt_rand(0, 11) === 0 ? .5 : 0;
        // Start just off one end of the stair (or, now and then, anywhere near it), heading for it.
        $heading = mt_rand(0, 1) ? 1 : -1;
        $acrossAt = $alongRows ? mt_rand($l - ($size > 1 ? 1 : 0), $r - 1) : mt_rand($t - ($size > 1 ? 1 : 0), $b - 1);
        $alongAt = $heading > 0 ? ($alongRows ? $t : $l) - $size - mt_rand(0, 1) : ($alongRows ? $b : $r) + mt_rand(0, 1);
        [$column, $row] = mt_rand(0, 4) === 0 ? [mt_rand($l - 2, $r + 1), mt_rand($t - 2, $b + 1)] : ($alongRows ? [$acrossAt, $alongAt] : [$alongAt, $acrossAt]);
        $token = ['column'=>$column + $half(), 'row'=>$row + $half(), 'width'=>$size, 'height'=>$size, 'levelId'=>$scene['levels'][mt_rand(0, 1)]];
        $moves = [];
        // A walk that mostly keeps going one way along the stair, as a climb does, with the odd
        // sidestep, turn back and long move.
        for ($k = 0; $k < 7; $k++) {
            if (mt_rand(0, 7) === 0) $heading = -$heading;
            $along = $heading * [1, 1, 1, 2, 2, 5][mt_rand(0, 5)]; $across = [0, 0, 0, 0, 0, 0, 1, -1, 2][mt_rand(0, 8)];
            [$toColumn, $toRow] = $alongRows ? [$token['column'] + $across, $token['row'] + $along] : [$token['column'] + $along, $token['row'] + $across];
            if ($toColumn < 0 || $toRow < 0) continue;
            $result = FloorGeometry::move($token, ['column'=>$toColumn, 'row'=>$toRow], $scene['mapLevels']);
            // [from column, from row, size, floor, stair entry or null, to column, to row] => [floor, changed floor by the stair, entry or null]
            $moves[] = [[$token['column'], $token['row'], $size, $token['levelId'], $token['_floorTraversal']['entry'] ?? null, $toColumn, $toRow],
                [$result['levelId'], $result['cause'] === 'stairs', $result['traversal']['entry'] ?? null]];
            $token = [...$token, 'column'=>$toColumn, 'row'=>$toRow, 'levelId'=>$result['levelId'], '_floorTraversal'=>$result['traversal']];
        }
        if ($moves) $cases[] = ['scene'=>$scene['name'], 'moves'=>$moves];
    }
}
$scenesOut = [];
foreach ($scenes as $scene) $scenesOut[$scene['name']] = $scene['mapLevels'];
echo json_encode(['note'=>'Written by dnd/vtt/tools/make-stair-walk-fixture.php from FloorGeometry.php. Do not edit by hand.', 'scenes'=>$scenesOut, 'cases'=>$cases], JSON_UNESCAPED_SLASHES), "\n";
