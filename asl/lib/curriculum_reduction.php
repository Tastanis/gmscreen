<?php
/** Explicit, reviewed curriculum migration. Never invoked by page loading. */
require_once __DIR__ . '/competencies.php';
const ASLHUB_REDUCTION_REVISION = 'curriculum_reduction_2026_v1';

function aslhub_reduction_lock(PDO $pdo): void {
    if ((int)$pdo->query("SELECT GET_LOCK('aslhub_curriculum_scores', 10)")->fetchColumn() !== 1) {
        throw new RuntimeException('Curriculum or grades are being updated. Try again shortly.');
    }
}
function aslhub_reduction_unlock(PDO $pdo): void {
    $pdo->query("SELECT RELEASE_LOCK('aslhub_curriculum_scores')");
}

/** Replay the highest CURRENT source score, including later corrections/clears. */
function aslhub_merge_score_history(array $events): array {
    usort($events, fn($a,$b)=>strcmp($a['scored_at'],$b['scored_at']) ?: ((int)$a['id'] <=> (int)$b['id']));
    $state=[]; $result=[]; $previous=1;
    foreach ($events as $i=>$event) {
        $state[(int)$event['learning_target_id']]=max(1,(int)$event['score']);
        // One final observation for simultaneous events prevents artificial improvements.
        if (isset($events[$i+1]) && $events[$i+1]['scored_at'] === $event['scored_at']) continue;
        $score=max($state);
        if ($score !== $previous) {
            $result[]=['score'=>$score,'scored_at'=>$event['scored_at'],'scored_by'=>$event['scored_by'] ?? null];
            $previous=$score;
        }
    }
    return $result;
}

function aslhub_reduction_snapshot(PDO $pdo): array {
    $state=[];
    foreach (['users','asl_learning_targets','asl_standards','asl_skill_buckets','asl_rubric_levels',
        'user_learning_targets','user_learning_target_score_history','asl_self_assessments',
        'asl_learning_target_resources','asl_settings'] as $table) {
        $rows=$pdo->query("SELECT * FROM $table" . ($pdo->inTransaction() ? " FOR UPDATE" : ""))->fetchAll(PDO::FETCH_ASSOC);
        if ($table==='asl_settings') $rows=array_values(array_filter($rows,fn($r)=>str_starts_with($r['setting_key'],'competenc') || $r['setting_key']===ASLHUB_REDUCTION_REVISION));
        usort($rows,fn($a,$b)=>strcmp(json_encode($a),json_encode($b)));
        $state[$table]=$rows;
    }
    return $state;
}

function aslhub_reduction_plan(PDO $pdo, array $destination): array {
    $state=aslhub_reduction_snapshot($pdo);
    foreach ($state['asl_settings'] as $setting) if ($setting['setting_key']===ASLHUB_REDUCTION_REVISION) throw new RuntimeException('This curriculum reduction has already been applied.');
    $old=aslhub_competency_bundle(true); $new=aslhub_competency_bundle();
    $byCode=[]; foreach ($state['asl_learning_targets'] as $t) $byCode[$t['target_code']]=$t;
    $expected=[];
    foreach ($old['courses'] as $course) foreach ($course['competencies'] as $c) foreach ($c['elements'] ?: [['key'=>'whole']] as $e) foreach ($c['modes'] as $mode) {
        $code=aslhub_competency_target_code($course['level'],$c['key'],$e['key'],$mode);
        if (empty($byCode[$code]['active'])) throw new RuntimeException('Existing curriculum differs from the expected original. No changes applied.');
        $expected[]=$code;
    }
    foreach ($byCode as $code=>$t) if ($t['active'] && !in_array($code,$expected,true)) throw new RuntimeException('Unexpected active skills require review before reduction.');
    $mergeKeys=[
        'modification'=>['manner_intensity'=>['manner','degree']],
        'connections'=>['list_contrast'=>['list','contrast']],
        'time'=>['whole'=>['frame','frequency','relationships']],
        'formation'=>['whole'=>['compound','nounverb']],
        'depicting'=>['whole'=>['shape','entity','handling','bodypart']],
        'enactment'=>['whole'=>['character','roleshift']],
        'spatial'=>['whole'=>['layout','referent','directional']],
        'conversation'=>['whole'=>['turns','repair']],
    ];
    $merges=[]; $counts=[];
    foreach ($new['courses'] as $course) {
        $level=$course['level']; $count=0;
        foreach ($course['competencies'] as $c) foreach ($c['elements'] ?: [['key'=>'whole']] as $e) foreach ($c['modes'] as $mode) {
            $count++;
            $sourceKeys=$mergeKeys[$c['key']][$e['key']] ?? null;
            if (!$sourceKeys) continue;
            $code=aslhub_competency_target_code($level,$c['key'],$e['key'],$mode);
            // Destinations must be genuinely new, never overwrite an earlier migration.
            if (isset($byCode[$code])) throw new RuntimeException('A merge destination already exists; review it before applying.');
            $ids=array_map(fn($k)=>(int)$byCode[aslhub_competency_target_code($level,$c['key'],$k,$mode)]['id'],$sourceKeys);
            $users=[];
            foreach ($state['user_learning_targets'] as $r) if (in_array((int)$r['learning_target_id'],$ids,true)) $users[(int)$r['user_id']]['current'][]=$r;
            foreach ($state['user_learning_target_score_history'] as $r) if (in_array((int)$r['learning_target_id'],$ids,true)) $users[(int)$r['user_id']]['events'][]=$r;
            foreach ($state['asl_self_assessments'] as $r) if (in_array((int)$r['learning_target_id'],$ids,true)) $users[(int)$r['user_id']]['self'][]=(int)$r['score'];
            $scores=[];
            foreach ($users as $uid=>$u) {
                $current=$u['current'] ?? []; $events=$u['events'] ?? [];
                $latest=[]; foreach ($events as $r) {
                    $id=(int)$r['learning_target_id'];
                    if (!isset($latest[$id]) || [$r['scored_at'],(int)$r['id']] > [$latest[$id]['scored_at'],(int)$latest[$id]['id']]) $latest[$id]=$r;
                }
                // Missing/mismatched history needs explicit review, never invent dates.
                $currById=[]; foreach ($current as $r) $currById[(int)$r['learning_target_id']]=$r;
                foreach ($ids as $id) if (max(1,(int)($currById[$id]['score'] ?? 1)) !== max(1,(int)($latest[$id]['score'] ?? 1))) {
                    throw new RuntimeException("Current score and history disagree for student $uid, target $id. Resolve before migration.");
                }
                $history=aslhub_merge_score_history($events);
                $score=max([1,...array_map(fn($r)=>max(1,(int)$r['score']),$current)]);
                $scores[]=['student_id'=>$uid,'score'=>$score,'source_scores'=>array_column($current,'score','learning_target_id'),'history'=>$history,
                    'has_teacher_record'=>(bool)($current || $events),
                    'self_score'=>empty($u['self']) ? null : max($u['self'])];
            }
            $merges[]=['code'=>$code,'level'=>$level,'title'=>$c['title'],'element'=>$e['label'] ?? $c['title'],'mode'=>$mode,'sources'=>$ids,'students'=>$scores];
        }
        $counts[$level]=['targets'=>$count,'annual_growth_points'=>2*$count];
    }
    $retired=[];
    foreach ([1,2,3] as $level) foreach ([['nonmanual','discourse','expression'],['nonmanual','discourse','reception'],['history','education','single'],['history','rights','single']] as [$key,$element,$mode]) {
        $target=$byCode[aslhub_competency_target_code($level,$key,$element,$mode)];
        $records=array_values(array_filter($state['user_learning_targets'],fn($r)=>(int)$r['learning_target_id']===(int)$target['id'] && (int)$r['score']>1));
        $retired[]=['level'=>$level,'title'=>$target['title'],'mode'=>$mode,'target_id'=>(int)$target['id'],'graded_records'=>array_map(fn($r)=>['student_id'=>(int)$r['user_id'],'score'=>(int)$r['score']],$records)];
    }
    $digest=hash('sha256',json_encode([$destination,$state,$new],JSON_THROW_ON_ERROR));
    return ['review_digest'=>$digest,'destination'=>$destination,'courses'=>$counts,'retired_without_transfer'=>$retired,'merges'=>$merges];
}

function aslhub_apply_reduction(PDO $pdo, array $destination, string $reviewDigest, callable $backup): array {
    aslhub_reduction_lock($pdo);
    $importLocked=false;
    try {
        if ((int)$pdo->query("SELECT GET_LOCK('aslhub_competencies_import', 10)")->fetchColumn() !== 1) throw new RuntimeException('Curriculum import is busy.');
        $importLocked=true;
        $plan=aslhub_reduction_plan($pdo,$destination);
        if (!hash_equals($plan['review_digest'],$reviewDigest)) throw new RuntimeException('Grades or curriculum changed after preview. Generate a fresh preview.');
        $backup($pdo); // Must succeed before any mutation.
        $pdo->beginTransaction();
        try {
            // Verify once more inside the transaction after backup.
            $fresh=aslhub_reduction_plan($pdo,$destination);
            if (!hash_equals($fresh['review_digest'],$reviewDigest)) throw new RuntimeException('Data changed during backup. Generate a fresh preview.');
            aslhub_write_competencies($pdo,aslhub_competency_bundle());
            foreach ($plan['merges'] as $merge) {
                $q=$pdo->prepare('SELECT id FROM asl_learning_targets WHERE target_code=?'); $q->execute([$merge['code']]); $id=(int)$q->fetchColumn();
                foreach ($merge['students'] as $student) {
                    $history=$student['history'];
                    if ($student['has_teacher_record']) $pdo->prepare('INSERT INTO user_learning_targets (user_id,learning_target_id,score,completed_at) VALUES (?,?,?,?)')
                        ->execute([$student['student_id'],$id,$student['score'],$history ? $history[count($history)-1]['scored_at'] : null]);
                    foreach ($history as $event) $pdo->prepare('INSERT INTO user_learning_target_score_history (user_id,learning_target_id,score,scored_at,scored_by) VALUES (?,?,?,?,?)')
                        ->execute([$student['student_id'],$id,$event['score'],$event['scored_at'],$event['scored_by']]);
                    if ($student['self_score'] !== null) $pdo->prepare('INSERT INTO asl_self_assessments (user_id,learning_target_id,score) VALUES (?,?,?)')->execute([$student['student_id'],$id,$student['self_score']]);
                }
                foreach ($merge['sources'] as $source) $pdo->prepare('UPDATE asl_learning_target_resources SET learning_target_id=? WHERE learning_target_id=?')->execute([$id,$source]);
            }
            aslhub_set_setting($pdo,'manual_connected_signing_v1','1');
            aslhub_set_setting($pdo,ASLHUB_REDUCTION_REVISION,json_encode($plan,JSON_THROW_ON_ERROR));
            aslhub_set_setting($pdo,'competencies_installed',aslhub_competency_bundle()['version']);
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
        return $plan;
    } finally {
        if ($importLocked) $pdo->query("SELECT RELEASE_LOCK('aslhub_competencies_import')");
        aslhub_reduction_unlock($pdo);
    }
}
