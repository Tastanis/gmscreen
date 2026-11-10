<?php
declare(strict_types=1);
// Brandon, November 10, 2026: "don't let them climb it but not stand on it". A labelled object set climbable is climbed
// only when it can be stood on; a climbable trunk with no top just blocks, and the load check says how to fix it.
require_once __DIR__.'/../../../lib/SyncV2Store.php';
function topCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$square = fn (float $x, float $y, float $size = 1.) => [['x'=>$x,'y'=>$y],['x'=>$x+$size,'y'=>$y],['x'=>$x+$size,'y'=>$y+$size],['x'=>$x,'y'=>$y+$size]];
$walls = fn (array $object) => MapLabels::expand(['version'=>1,'labels'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[],'objects'=>[$object]])['segments'];
$trunk = ['id'=>'elder-trunk','label'=>'Elder tree','points'=>$square(4, 4, 2),'base'=>0,'top'=>6,'climbable'=>true,'standOn'=>false];
topCheck(array_filter($walls($trunk), fn ($e) => $e['climbable'] === true) === [], 'A climbable trunk with no top is not climbed');
topCheck(count(array_filter($walls([...$trunk, 'standOn'=>true]), fn ($e) => $e['climbable'] === true)) === 4, 'A tree with a top to stand on is climbed');
topCheck(array_filter($walls([...$trunk, 'climbable'=>false, 'standOn'=>true]), fn ($e) => $e['climbable'] === true) === [], 'Stood on but not climbable stays not climbable');
topCheck(MapLabels::climbable(['climbable'=>true]) === false && MapLabels::climbable(['climbable'=>true,'standOn'=>true]) === true, 'The rule itself');
$lines = implode("\n", MapLabels::check(['environment'=>['walls'=>['value'=>['version'=>1,'labels'=>1,'nodes'=>[],'segments'=>[],'roofs'=>[],'objects'=>[$trunk]]]]]));
topCheck(str_contains($lines, 'Elder tree is climbable but cannot be stood on, so it is not climbed. To climb it, give it a top to stand on (standOn).'), 'The check says how to fix it: ' . $lines);
echo "PASS a climbable object needs a top to stand on\n";
