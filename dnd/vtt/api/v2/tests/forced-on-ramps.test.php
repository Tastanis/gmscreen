<?php
declare(strict_types=1);
// A creature pushed, pulled or slid along a ramp stays on the ramp and changes height with it,
// the same as one that walks it. Pushed off the side it falls from the ramp's height there.
// A ramp too steep to be a slope (a vine: a whole floor in one square) carries walkers only.
//
// The scene is the shape floating islands are built in: floor plates joined by ramps over open
// air. A sloping arch, 2 wide and 8 long, joins a mid island (12 high) to a high island (18 high);
// a vine one square long joins the mid island to a low island (6 high). The bathhouse stairs are
// the same kind of ramp. Every move goes through the real store.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function rampCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$ring = static fn ($l, $t, $r, $b) => [['x'=>$l,'y'=>$t],['x'=>$r,'y'=>$t],['x'=>$r,'y'=>$b],['x'=>$l,'y'=>$b]];
/** Everything on a 26 by 30 map outside the box is a hole in that floor. */
$holes = static fn ($l, $t, $r, $b) => [
    ['column'=>0,'row'=>0,'width'=>26,'height'=>$t], ['column'=>0,'row'=>$b,'width'=>26,'height'=>30-$b],
    ['column'=>0,'row'=>$t,'width'=>$l,'height'=>$b-$t], ['column'=>$r,'row'=>$t,'width'=>26-$r,'height'=>$b-$t],
];
$box = static fn ($l, $t, $r, $b) => [['column'=>$l,'row'=>$t],['column'=>$r,'row'=>$t],['column'=>$r,'row'=>$b],['column'=>$l,'row'=>$b]];
// The arch: columns 10 and 11, rows 10 to 17. Its head (green) is the south end, on the high island.
$arch = static fn ($direction, $to) => ['id'=>'arch','direction'=>$direction,'linkedLevelId'=>$to,'corners'=>$box(10,10,12,18),
    'edgeColors'=>['10,18-11,18'=>'green','11,18-12,18'=>'green','10,10-11,10'=>'red','11,10-12,10'=>'red']];
// The vine: the one square at column 15, row 7. Its head is the west end, on the mid island.
$vine = static fn ($direction, $to) => ['id'=>'vine','direction'=>$direction,'linkedLevelId'=>$to,'corners'=>$box(15,7,16,8),
    'edgeColors'=>['15,7-15,8'=>'green','16,7-16,8'=>'red']];
$levels = ['activeLevelId'=>'level-0','baseStairs'=>[],'levels'=>[
    ['id'=>'low','name'=>'Low','elevationSquares'=>6,'zIndex'=>0,'cutouts'=>$holes(16,4,21,10),'stairs'=>[$vine('up','mid')]],
    ['id'=>'mid','name'=>'Mid','elevationSquares'=>12,'zIndex'=>1,'cutouts'=>$holes(7,3,15,10),'stairs'=>[$arch('up','high'),$vine('down','low')]],
    ['id'=>'high','name'=>'High','elevationSquares'=>18,'zIndex'=>2,'cutouts'=>$holes(8,18,14,24),'stairs'=>[$arch('down','mid')]],
]];
$walls = ['version'=>1,'nodes'=>[],'segments'=>[],
    'roofs'=>[
        ['id'=>'plate-low','kind'=>'floor','levelId'=>'low','height'=>6.0,'points'=>$ring(16,4,21,10),'holes'=>[],'nodes'=>[]],
        ['id'=>'plate-mid','kind'=>'floor','levelId'=>'mid','height'=>12.0,'points'=>$ring(7,3,15,10),'holes'=>[],'nodes'=>[]],
        ['id'=>'plate-high','kind'=>'floor','levelId'=>'high','height'=>18.0,'points'=>$ring(8,18,14,24),'holes'=>[],'nodes'=>[]],
    ],
    'ramps'=>[
        ['id'=>'arch','left'=>10,'right'=>12,'top'=>10,'bottom'=>18,'base'=>12.0,'height'=>18.0,'fromLevel'=>'mid','toLevel'=>'high','direction'=>'south'],
        ['id'=>'vine','left'=>15,'right'=>16,'top'=>7,'bottom'=>8,'base'=>6.0,'height'=>12.0,'fromLevel'=>'low','toLevel'=>'mid','direction'=>'west'],
    ]];

/**
 * One creature on a fresh copy of the scene. Each step is [column, row, kind]. Returns, per step,
 * where the creature is left: [column, row, floor, height of its feet, fall in squares or null].
 */
$run = static function (array $start, array $steps) use ($levels, $walls): array {
    $database = sys_get_temp_dir() . '/vtt-forced-ramp-' . bin2hex(random_bytes(6)) . '.sqlite';
    $rows = [];
    try {
        $store = new SyncV2Store($database);
        $size = $start[3] ?? 1;
        $board = ['placements'=>['scene'=>[['id'=>'t','name'=>'t','team'=>'ally','column'=>$start[0],'row'=>$start[1],'width'=>$size,'height'=>$size,'levelId'=>$start[2]]]],
            'sceneState'=>['scene'=>['mapLevels'=>$levels]]];
        $store->migrateLegacyPlacements($board); $store->migrateLegacyBoardDomains($board);
        $snap = $store->getSnapshot();
        $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'forced-ramp-env','sceneId'=>'scene','baseRevision'=>$snap['revision'],
            'entityRevision'=>$snap['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$walls]], 'gm', true);
        $effects = new CollisionEffects(new PDO('sqlite:' . $database), 'default');
        foreach ($steps as $n => [$column, $row, $kind]) {
            $snap = $store->getSnapshot(); $token = $snap['state']['placements']['scene']['t']; $operation = 'forced-ramp-' . str_pad((string) $n, 4, '0', STR_PAD_LEFT);
            $store->acceptTokenMove(['type'=>'token.move','operationId'=>$operation,'sceneId'=>'scene','entityId'=>'t','baseRevision'=>$snap['revision'],
                'entityRevision'=>$token['_entityRevision'] ?? 0,'payload'=>['column'=>$column,'row'=>$row,'movementKind'=>$kind]], 'gm', true);
            $snap = $store->getSnapshot(); $after = $snap['state']['placements']['scene']['t'];
            $fall = $effects->list('gm', true, $operation);
            $rows[] = [(float) $after['column'], (float) $after['row'], $after['levelId'], round(WallMovement::height($after, $snap['state']['sceneConfig']['scene']), 3),
                $fall ? $fall[0]['details']['squares'] : null];
        }
        unset($store, $effects);
    } finally { @unlink($database); }
    return $rows;
};
$last = static fn (array $rows) => $rows[count($rows) - 1];
$is = static function (array $row, array $expected, string $message): void {
    rampCheck($row == $expected, $message . ': ' . json_encode($row) . ', expected ' . json_encode($expected));
};

// ---- along the arch -------------------------------------------------------
// Two squares down it on foot, then pushed three more: still on it, three squares lower down the slope.
foreach ([1 => [14.625, 16.875], 2 => [15.0, 17.25]] as $size => [$after, $before]) {
    $rows = $run([10, 18, 'high', $size], [[10, 17, 'walk'], [10, 16, 'walk'], [10, 13, 'forced']]);
    $is($rows[1], [10.0, 16.0, 'high', $before, null], "A size $size creature walks two squares down the arch");
    $is($rows[2], [10.0, 13.0, 'high', $after, null], "Pushed three squares along the arch, a size $size creature stays on it and comes down with it");
}
// From a plate the server knows it is standing on, straight onto the arch: carried, and not a fall,
// however many squares the one move covers.
foreach (['forced', 'walk'] as $kind) {
    $rows = $run([10, 21, 'high'], [[10, 19, 'walk'], [10, 15, $kind]]);
    $is($rows[1], [10.0, 15.0, 'high', 16.125, null], "Four squares from the island down the arch in one $kind move is not a fall");
}
$rows = $run([10, 21, 'high', 2], [[10, 19, 'walk'], [10, 14, 'forced']]);
$is($rows[1], [10.0, 14.0, 'high', 15.75, null], 'A size 2 creature pushed from the island onto the arch is carried too');
// Up it: from the mid island onto the arch, then off its head onto the high island.
$rows = $run([10, 7, 'mid'], [[10, 8, 'walk'], [10, 13, 'forced'], [10, 18, 'forced']]);
$is($rows[1], [10.0, 13.0, 'mid', 14.625, null], 'Pushed up the arch from the mid island, it climbs with the slope');
$is($rows[2], [10.0, 18.0, 'high', 18.0, null], 'Pushed on past the head of the arch, it is on the high island');
// Down it and off its foot.
$rows = $run([10, 20, 'high'], [[10, 16, 'forced'], [10, 9, 'forced']]);
$is($rows[0], [10.0, 16.0, 'high', 16.875, null], 'Pushed onto the arch from the high island');
$is($rows[1], [10.0, 9.0, 'mid', 12.0, null], 'Pushed on past the foot of the arch, it is on the mid island, with no fall');
// The whole length in one push, each way.
$is($last($run([11, 18, 'high'], [[11, 9, 'forced']])), [11.0, 9.0, 'mid', 12.0, null], 'Pushed the whole arch downward in one move');
$is($last($run([11, 9, 'mid'], [[11, 18, 'forced']])), [11.0, 18.0, 'high', 18.0, null], 'Pushed the whole arch upward in one move');
// Back off the arch the way it came.
$is($last($run([10, 18, 'high'], [[10, 16, 'walk'], [10, 20, 'forced']])), [10.0, 20.0, 'high', 18.0, null], 'Pushed back up onto the high island');
echo "PASS a creature pushed along a ramp is carried by it\n";

// ---- off the side of the arch --------------------------------------------
// It falls from the height the arch has at that point, to the ground far below.
$is($last($run([11, 18, 'high'], [[11, 17, 'walk'], [11, 16, 'walk'], [11, 15, 'walk'], [13, 15, 'forced']])), [13.0, 15.0, 'level-0', 0.0, 16], 'Walked onto the arch, then pushed off its side');
$is($last($run([11, 18, 'high'], [[11, 15, 'forced'], [13, 15, 'forced']])), [13.0, 15.0, 'level-0', 0.0, 16], 'Pushed along the arch, then pushed off its side');
// A size 2 creature half off the two-wide arch is still on it; all the way off, it falls.
$rows = $run([10, 21, 'high', 2], [[10, 19, 'walk'], [10, 14, 'forced'], [11, 14, 'forced'], [12, 14, 'forced']]);
$is($rows[2], [11.0, 14.0, 'high', 15.75, null], 'A size 2 creature pushed half off the side of the arch stays on');
$is($rows[3], [12.0, 14.0, 'level-0', 0.0, 16], 'Pushed all the way off, it falls from the arch');
// A push that only cuts the corner of the arch on its way out over open air is a fall from the island.
$is($last($run([13, 19, 'high'], [[13, 18, 'walk'], [9, 14, 'forced']])), [9.0, 14.0, 'level-0', 0.0, 18], 'A push across the corner of the arch and out over air');
// A push across the foot of the arch, along the mid island, changes nothing.
$is($last($run([8, 9, 'mid'], [[13, 9, 'forced']])), [13.0, 9.0, 'mid', 12.0, null], 'A push along the island past the foot of the arch');
echo "PASS pushed off the side of a ramp, a creature falls from the ramp's height\n";

// ---- the vine: too steep to be shoved along -------------------------------
// Walking it is a route, both ways, with no fall, in one move or square by square.
$is($last($run([13, 7, 'mid'], [[14, 7, 'walk'], [17, 7, 'walk']])), [17.0, 7.0, 'low', 6.0, null], 'Walking down the vine in one move');
$is($last($run([18, 7, 'low'], [[17, 7, 'walk'], [14, 7, 'walk']])), [14.0, 7.0, 'mid', 12.0, null], 'Walking up the vine in one move');
$rows = $run([13, 7, 'mid'], [[14, 7, 'walk'], [15, 7, 'walk'], [16, 7, 'walk']]);
$is($rows[1], [15.0, 7.0, 'mid', 9.0, null], 'Stepping onto the vine is not a fall');
$is($rows[2], [16.0, 7.0, 'low', 6.0, null], 'Stepping off its foot onto the low island');
// Shoved over the edge where the vine hangs, a creature falls the same as over any other edge.
$is($last($run([13, 7, 'mid'], [[14, 7, 'walk'], [17, 7, 'forced']])), [17.0, 7.0, 'low', 6.0, 6], 'Pushed off the island over the vine: a fall of 6 onto the low island');
$is($last($run([13, 6, 'mid'], [[14, 6, 'walk'], [17, 6, 'forced']])), [17.0, 6.0, 'low', 6.0, 6], 'The same one row away from the vine');
$is($last($run([13, 7, 'mid'], [[14, 7, 'walk'], [15, 7, 'forced']])), [15.0, 7.0, 'level-0', 0.0, 12], 'Pushed one square, into the gap the vine hangs in: a fall to the ground');
// A creature part-way down the vine that is pushed along it is knocked off.
$is($last($run([13, 7, 'mid'], [[14, 7, 'walk'], [15, 7, 'walk'], [17, 7, 'forced']])), [17.0, 7.0, 'low', 6.0, 3], 'Pushed while on the vine: it drops the rest of the way');
// A push is never carried up a vine.
rampCheck($last($run([18, 7, 'low'], [[17, 7, 'walk'], [14, 7, 'forced']]))[2] === 'level-0', 'A push toward the vine from below does not climb it');
echo "PASS a vine carries walkers; a creature shoved along it falls\n";

// ---- how steep is too steep ------------------------------------------------
rampCheck(abs(FloorGeometry::stairGrade($arch('up', 'high'), 'mid', $levels) - 0.75) < 1e-9, 'The arch rises three quarters of a square a square');
rampCheck(abs(FloorGeometry::stairGrade($vine('down', 'low'), 'mid', $levels) - 6.0) < 1e-9, 'The vine rises six squares in one');
// The bathhouse stairs: two squares up over three.
$bath = ['baseStairs'=>[['id'=>'s','direction'=>'up','linkedLevelId'=>'first','corners'=>$box(16,10,17,13),'edgeColors'=>['16,13-17,13'=>'red','16,10-17,10'=>'green']]],
    'levels'=>[['id'=>'first','elevationSquares'=>2,'zIndex'=>1]]];
rampCheck(abs(FloorGeometry::stairGrade($bath['baseStairs'][0], 'level-0', $bath) - 2 / 3) < 1e-9, 'The bathhouse stairs rise two thirds of a square a square');
rampCheck(FloorGeometry::move(['column'=>16,'row'=>13,'width'=>1,'height'=>1,'levelId'=>'level-0'], ['column'=>16,'row'=>9], $bath, 'forced')['levelId'] === 'first', 'A push the length of the bathhouse stairs carries the creature up them');
// The line: a ramp rising one and a half squares a square or more is a climb.
foreach ([[4, 3, true], [5, 4, true], [3, 2, false], [6, 4, false], [2, 1, false]] as [$rise, $length, $carried]) {
    $map = ['baseStairs'=>[['id'=>'s','direction'=>'up','linkedLevelId'=>'top','corners'=>$box(4,4,5,4 + $length),'edgeColors'=>['4,4-5,4'=>'green','4,' . (4 + $length) . '-5,' . (4 + $length)=>'red']]],
        'levels'=>[['id'=>'top','elevationSquares'=>$rise,'zIndex'=>1]]];
    rampCheck(abs(FloorGeometry::stairGrade($map['baseStairs'][0], 'level-0', $map) - $rise / $length) < 1e-9, "A stair $rise high over $length squares");
    $foot = ['column'=>4,'row'=>4 + $length,'width'=>1,'height'=>1,'levelId'=>'level-0'];
    $pushed = FloorGeometry::move($foot, ['column'=>4,'row'=>3], $map, 'forced')['levelId'];
    rampCheck(($pushed === 'top') === $carried, "A stair $rise high over $length squares " . ($carried ? 'carries' : 'does not carry') . ' a pushed creature');
    rampCheck(FloorGeometry::move($foot, ['column'=>4,'row'=>3], $map)['levelId'] === 'top', 'A walker always uses it');
}
echo "PASS slopes carry a pushed creature; climbs do not\n";

// ---- carried or not --------------------------------------------------------
$on = static fn ($level, $stair, $entry) => ['levelId'=>$level, '_floorTraversal'=>$entry === null ? null : ['stairId'=>$stair, 'entry'=>$entry]];
rampCheck(FloorGeometry::carriedByStair($on('high', 'arch', 'green'), $levels), 'Onto a ramp going down by its head: carried');
rampCheck(FloorGeometry::carriedByStair($on('mid', 'arch', 'red'), $levels), 'Onto a ramp going up by its foot: carried');
rampCheck(!FloorGeometry::carriedByStair($on('mid', 'arch', 'barrier'), $levels), 'Into a ramp from the side: not carried');
rampCheck(!FloorGeometry::carriedByStair($on('high', 'arch', 'red'), $levels), 'By the wrong end: not carried');
rampCheck(!FloorGeometry::carriedByStair($on('high', 'arch', null), $levels) && !FloorGeometry::carriedByStair($on('low', 'arch', 'red'), $levels), 'Not on a ramp, or not on this floor\'s ramp: not carried');
echo "PASS a creature is carried only by the end of the ramp that belongs to its floor\n";

// ---- a stair over the floor it rises from (a building's stair, as on the bathhouse) ----------
// The lower floor's plate runs on under the stair. A creature carried by the stair stands at the
// stair's height, not at the height of the plate it came from; before, it was held at the plate's
// height to the top and rose the whole way in the last step (the ruler read 5 for a 4-square stair).
$houseStair = ['id'=>'stair','corners'=>$box(16,10,17,13),'edgeColors'=>['16,10-17,10'=>'green','16,13-17,13'=>'red']];
$house = [
    'mapLevels'=>['baseStairs'=>[[...$houseStair,'direction'=>'up','linkedLevelId'=>'first']],
        'levels'=>[['id'=>'first','zIndex'=>1,'elevationSquares'=>2,'cutouts'=>[['column'=>0,'row'=>10,'width'=>30,'height'=>20]],'stairs'=>[[...$houseStair,'direction'=>'down','linkedLevelId'=>'level-0']]]]],
    'environment'=>['walls'=>['value'=>['version'=>1,'nodes'=>[],'segments'=>[],
        'roofs'=>[['id'=>'ground','kind'=>'floor','levelId'=>'level-0','height'=>0.0,'points'=>$ring(10,9,22,20)], ['id'=>'first','kind'=>'floor','levelId'=>'first','height'=>2.0,'points'=>$ring(10,2,22,10)]],
        'ramps'=>[['id'=>'stair','left'=>16,'right'=>17,'top'=>10,'bottom'=>13,'base'=>0.0,'height'=>2.0,'fromLevel'=>'level-0','toLevel'=>'first','direction'=>'north']]]]],
];
$at = static fn (float $row, string $level, ?string $entry, ?string $plate) => ['id'=>'t','column'=>16,'row'=>$row,'width'=>1,'height'=>1,'levelId'=>$level,
    '_floorTraversal'=>$entry === null ? null : ['stairId'=>'stair','entry'=>$entry], '_supportSurfaceId'=>$plate];
$feet = static fn (array $token) => round(WallMovement::height($token, $house), 2);
rampCheck([$feet($at(12, 'level-0', 'red', 'ground')), $feet($at(11, 'level-0', 'red', 'ground')), $feet($at(10, 'level-0', 'red', 'ground'))] === [0.33, 1.0, 1.67], 'Going up, it rises with the stair though the ground floor still lies under it');
rampCheck([$feet($at(10, 'first', 'green', null)), $feet($at(11, 'first', 'green', null)), $feet($at(12, 'first', 'green', null))] === [1.67, 1.0, 0.33], 'Coming down, the same heights');
rampCheck($feet($at(12, 'level-0', null, 'ground')) === 0.0, 'A creature under the stair that never came onto it stands on the ground floor');
rampCheck($feet($at(12, 'level-0', 'barrier', 'ground')) === 0.0, 'So does one that walked in under it from the side');
rampCheck($feet($at(14, 'level-0', null, 'ground')) === 0.0 && $feet($at(8, 'first', null, 'first')) === 2.0, 'Off the stair, the plate decides as before');
// The whole way up and down, as moves: no fall either way, and the right floor at each end.
$walkHouse = static function (array $token, array $rows, string $kind) use ($house): array {
    $surfaces = FloorSupport::surfaces($house['environment']['walls']['value']); $out = [];
    foreach ($rows as $row) {
        $next = [...$token, 'row'=>$row];
        $floor = FloorGeometry::move($token, $next, $house['mapLevels'], $kind, [], $surfaces, static fn ($p) => 0.0);
        $next['levelId'] = $floor['levelId']; $next['_floorTraversal'] = $floor['traversal'];
        if (array_key_exists('supportSurfaceId', $floor)) $next['_supportSurfaceId'] = $floor['supportSurfaceId'];
        elseif (!empty($next['_supportSurfaceId']) && !TeleportLanding::retained($next, $house)) $next['_supportSurfaceId'] = null;
        $fall = FallOutcome::plan($token, $next, $house, $kind, [], $floor['cause'] ?? '');
        $out[] = [$next['levelId'], round(WallMovement::height($next, $house), 2), $fall['squares'] ?? null];
        $token = $next;
    }
    return $out;
};
foreach (['walk', 'forced'] as $kind) {
    rampCheck($walkHouse($at(13, 'level-0', null, 'ground'), [12, 11, 10, 9], $kind) === [['level-0', 0.33, null], ['level-0', 1.0, null], ['level-0', 1.67, null], ['first', 2.0, null]], "Up the house stair by $kind, square by square");
    rampCheck($walkHouse($at(9, 'first', null, 'first'), [10, 11, 12, 13], $kind) === [['first', 1.67, null], ['first', 1.0, null], ['first', 0.33, null], ['level-0', 0.0, null]], "Down the house stair by $kind, square by square");
}
echo "PASS a creature on a stair stands at the stair's height, over the floor it came from\n";
