<?php
declare(strict_types=1);
require_once __DIR__ . '/../_common.php';
function checkAutomationProjection(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$monster = ['name'=>'Secret monster', 'description'=>'private biography', 'speed'=>5, 'size'=>'2',
    'attributes'=>['might'=>4,'agility'=>1,'reason'=>0,'intuition'=>-1,'presence'=>2],
    'defenses'=>['stability'=>2,'immunities'=>[['type'=>'fire','value'=>5]],'weakness'=>['type'=>'cold','value'=>3]],
    'abilities'=>['triggered_action'=>[['name'=>'Retort','resource_cost'=>'Free', 'automation'=>['cards'=>[
        ['type'=>'trigger','match'=>['event'=>'damage','whose'=>'self']],
        ['type'=>'effect','effects'=>[['kind'=>'note','text'=>'private later card']]],
    ]]]]]];
$placement = ['id'=>'enemy','team'=>'enemy','monster'=>$monster,'metadata'=>['monster'=>$monster]];
$projected = sanitizePlacementForPlayerView($placement);
checkAutomationProjection(!isset($projected['monster']) && !isset($projected['metadata']['monster']), 'Full monster is removed.');
checkAutomationProjection($projected['automationTraits']['attributes']['agility'] === 1, 'Potency receives real agility.');
checkAutomationProjection($projected['automationTraits']['attributes']['intuition'] === -1, 'Negative characteristics survive.');
checkAutomationProjection($projected['automationTraits']['stability'] === 2, 'Stability survives.');
checkAutomationProjection($projected['automationTraits']['immunities'][0]['value'] === 5, 'Fire immunity survives.');
checkAutomationProjection($projected['automationTraits']['weaknesses'][0]['value'] === 3, 'Legacy weakness survives.');
checkAutomationProjection(count($projected['monsterTriggerHooks'][0]['blocks']) === 1, 'Only trigger cards are projected.');
checkAutomationProjection(!str_contains(json_encode($projected), 'private'), 'Descriptions and later cards remain private.');
checkAutomationProjection(sanitizePlacementForPlayerView($projected) === $projected, 'Projection is idempotent.');
$legacy = $placement; unset($legacy['monster']);
checkAutomationProjection(sanitizePlacementForPlayerView($legacy)['automationTraits'] === $projected['automationTraits'], 'Legacy metadata source is supported.');
$ally = $placement; $ally['team'] = 'ally';
checkAutomationProjection(sanitizePlacementForPlayerView($ally) === $ally, 'Existing ally projection remains unchanged.');
echo "automation projection passed\n";
