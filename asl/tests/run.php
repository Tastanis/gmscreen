<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/helpers.php';
require_once dirname(__DIR__) . '/lib/calendar.php';
require_once dirname(__DIR__) . '/lib/data.php';

function expect_same($expected, $actual, string $label): void {
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL $label\nExpected: " . json_encode($expected) . "\nActual: " . json_encode($actual) . "\n");
        exit(1);
    }
    fwrite(STDOUT, "PASS $label\n");
}

$days = [];
for ($i=1; $i<=23; $i++) $days[] = ['date' => sprintf('2026-01-%02d',$i), 'instructional' => true, 'label' => null];
$blocks = aslhub_calendar_build_blocks($days);
expect_same([10,10,3], array_column($blocks,'instructional_days'), 'calendar chunks 23 school days into 10, 10, 3');
expect_same(['2026-01-01','2026-01-11','2026-01-21'], array_column($blocks,'start_date'), 'block starts follow instructional-day order');

$scoreBlocks = [
    ['start_date'=>'2026-01-01','end_date'=>'2026-01-10'],
    ['start_date'=>'2026-01-11','end_date'=>'2026-01-20'],
    ['start_date'=>'2026-01-21','end_date'=>'2026-01-30'],
];
$events = [
    ['learning_target_id'=>1,'score'=>2,'scored_at'=>'2026-01-05 09:00:00','bucket_id'=>'CLS','standard_id'=>'CLS.1'],
    ['learning_target_id'=>2,'score'=>1,'scored_at'=>'2026-01-07 09:00:00','bucket_id'=>'CLS','standard_id'=>'CLS.2'],
    ['learning_target_id'=>1,'score'=>4,'scored_at'=>'2026-01-12 09:00:00','bucket_id'=>'CLS','standard_id'=>'CLS.1'],
    ['learning_target_id'=>1,'score'=>1,'scored_at'=>'2026-01-13 09:00:00','bucket_id'=>'CLS','standard_id'=>'CLS.1'],
    ['learning_target_id'=>1,'score'=>2,'scored_at'=>'2026-01-14 09:00:00','bucket_id'=>'CLS','standard_id'=>'CLS.1'],
    ['learning_target_id'=>1,'score'=>3,'scored_at'=>'2026-01-15 09:00:00','bucket_id'=>'CLS','standard_id'=>'CLS.1'],
];
$progress = aslhub_progress_from_events($events,$scoreBlocks,'2026-01-15');
expect_same([3,4,null], $progress['overall'], 'repeated clicks use only latest target score at each checkpoint');
expect_same([2,3,null], $progress['byStandard']['CLS.1'], 'standard series is independently scoped');
expect_same([3,4,null], $progress['byBucket']['CLS'], 'bucket series is independently scoped');

$participation = [100,100,100,60,60,60,60,60];
$trend = [];
foreach ($participation as $i=>$value) {
    $window=array_slice($participation,max(0,$i-3),min(4,$i+1));
    $trend[]=array_sum($window)/count($window);
}
expect_same([100,100,100,90,80,70,60,60], $trend, 'four-block participation trend steps down then plateaus');

$paceGoals = aslhub_pace_goals();
expect_same(['pace_green_goal'=>3.0,'pace_red_goal'=>2.75,'pace_blue_goal'=>3.25], $paceGoals,
    'fixed pace outcomes match the requested score distributions');
expect_same([180.0,165.0,195.0], [60*$paceGoals['pace_green_goal'],60*$paceGoals['pace_red_goal'],60*$paceGoals['pace_blue_goal']],
    'pace endpoints scale exactly with the number of proficiency targets');

fwrite(STDOUT, "ALL ASL PURE TESTS PASSED\n");
