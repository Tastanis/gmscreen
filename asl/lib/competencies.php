<?php
/** Bundled curriculum: semantic keys, never titles or source numbers, identify scores. */
require_once __DIR__ . '/calendar.php';

function aslhub_competency_bundle(): array {
    return json_decode(file_get_contents(dirname(__DIR__) . '/data/competencies-2026.json'), true, 512, JSON_THROW_ON_ERROR);
}

function aslhub_competencies_installed(PDO $pdo): bool {
    $q = $pdo->prepare('SELECT setting_value FROM asl_settings WHERE setting_key = ?');
    $q->execute(['competencies_installed']);
    return (bool)$q->fetchColumn();
}

/** Versioned prose-only patch: keep target IDs, scores, history and calendar intact. */
function aslhub_update_manual_wording(PDO $pdo, callable $backup): void {
    $revision = 'manual_connected_signing_v1';
    // Read fresh, including after the lock; the general settings helper caches per request.
    $setting = function(string $key) use ($pdo): string {
        $q = $pdo->prepare('SELECT setting_value FROM asl_settings WHERE setting_key=?');
        $q->execute([$key]);
        return (string)$q->fetchColumn();
    };
    if (!aslhub_competencies_installed($pdo) || $setting($revision) === '1') return;
    if ((int)$pdo->query("SELECT GET_LOCK('aslhub_competencies_import', 10)")->fetchColumn() !== 1) throw new RuntimeException('Curriculum update is busy.');
    try {
        if ($setting($revision) === '1') return;
        $backup($pdo);
        $pdo->beginTransaction();
        try {
            foreach (aslhub_competency_bundle()['courses'] as $course) {
                $level = (int)$course['level'];
                $manual = array_values(array_filter($course['competencies'], fn($c) => $c['key'] === 'manual'));
                if (count($manual) !== 1) throw new RuntimeException('Missing manual competency.');
                $c = $manual[0];
                $sid = 'C'.$level.'.manual';
                $metadata = json_decode($setting('competency_'.$sid), true);
                if (!$metadata || $metadata['key'] !== 'manual') throw new RuntimeException('Missing installed manual competency.');
                foreach ($c['elements'] as $element) foreach ($c['modes'] as $mode) {
                    $q = $pdo->prepare('SELECT id FROM asl_learning_targets WHERE target_code=? AND standard_id=? AND asl_level=? AND active=1');
                    $q->execute([aslhub_competency_target_code($level,'manual',$element['key'],$mode),$sid,$level]);
                    $id = $q->fetchColumn();
                    if (!$id) throw new RuntimeException('Missing existing manual target; no changes applied.');
                    foreach ($c['rubric'] as $score=>$parts) {
                        $q = $pdo->prepare('SELECT COUNT(*) FROM asl_rubric_levels WHERE learning_target_id=? AND score=?');
                        $q->execute([$id,$score]);
                        if ((int)$q->fetchColumn() !== 1) throw new RuntimeException('Missing existing descriptor; no changes applied.');
                        $pdo->prepare('UPDATE asl_rubric_levels SET descriptor=? WHERE learning_target_id=? AND score=?')
                            ->execute([aslhub_competency_text($parts,$element['replacement'] ?? $element['label']),$id,$score]);
                    }
                }
                $metadata['rubric'] = $c['rubric'];
                aslhub_set_setting($pdo,'competency_'.$sid,json_encode($metadata,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
            }
            aslhub_set_setting($pdo,$revision,'1');
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    } finally { $pdo->query("SELECT RELEASE_LOCK('aslhub_competencies_import')"); }
}

function aslhub_competency_text(array $parts, ?string $element = null): string {
    return implode('', array_map(fn($p) => $element !== null && $p['slot'] ? $element : $p['text'], $parts));
}

function aslhub_competency_target_code(int $level, string $competency, string $element, string $mode): string {
    return 'T' . $level . substr(hash('sha256', "$competency/$element/$mode"), 0, 18);
}

/** Caller owns transaction. Reapplying revised prose updates content, never score identities/history. */
function aslhub_write_competencies(PDO $pdo, array $bundle): void {
    if (!$pdo->inTransaction()) throw new RuntimeException('Curriculum writes require a transaction.');
    $pdo->exec('UPDATE asl_learning_targets SET active=0');
    $pdo->exec('UPDATE asl_standards SET active=0');
    $pdo->exec('UPDATE asl_skill_buckets SET active=0');
    $bucket = $pdo->prepare('INSERT INTO asl_skill_buckets (bucket_id,code,name,order_index,active) VALUES (?,?,?,?,1)
        ON DUPLICATE KEY UPDATE name=VALUES(name), active=1');
    $standard = $pdo->prepare('INSERT INTO asl_standards (standard_id,bucket_id,name,description,order_index,active) VALUES (?,?,?,?,?,1)
        ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),order_index=VALUES(order_index),active=1');
    $target = $pdo->prepare('INSERT INTO asl_learning_targets (standard_id,title,description,order_index,active,asl_level,target_code,sub_code) VALUES (?,?,?,?,1,?,?,?)
        ON DUPLICATE KEY UPDATE title=VALUES(title),description=VALUES(description),order_index=VALUES(order_index),active=1');
    $find = $pdo->prepare('SELECT id FROM asl_learning_targets WHERE target_code=?');
    $rubric = $pdo->prepare('INSERT INTO asl_rubric_levels (learning_target_id,score,descriptor) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE descriptor=VALUES(descriptor)');
    $seen=[];
    foreach ($bundle['courses'] as $course) {
        $level=(int)$course['level']; $bid='COMP'.$level;
        $bucket->execute([$bid,$bid,'Competencies',$level]);
        foreach ($course['competencies'] as $c) {
            $sid='C'.$level.'.'.$c['key'];
            $standard->execute([$sid,$bid,$c['title'],aslhub_competency_text($c['text']),$c['number']]);
            aslhub_set_setting($pdo,'competency_'.$sid,json_encode($c,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
            $elements=$c['elements'] ?: [['key'=>'whole','label'=>$c['title']]];
            foreach ($elements as $i=>$e) foreach ($c['modes'] as $mode) {
                $code=aslhub_competency_target_code($level,$c['key'],$e['key'],$mode);
                if (isset($seen[$code])) throw new RuntimeException('Duplicate semantic target identity.');
                $seen[$code]=true;
                $replacement=$c['elements'] ? ($e['replacement'] ?? $e['label']) : null;
                $target->execute([$sid,$e['label'],aslhub_competency_text($c['text'],$replacement),$i,$level,$code,strtoupper($mode[0])]);
                $find->execute([$code]); $id=(int)$find->fetchColumn();
                // Removing a descriptor makes that level ungradable without deleting its score history.
                $available=array_map('intval',array_keys($c['rubric']));
                $pdo->prepare('DELETE FROM asl_rubric_levels WHERE learning_target_id=? AND score NOT IN ('.implode(',',$available).')')->execute([$id]);
                foreach ($c['rubric'] as $score=>$parts) $rubric->execute([$id,(int)$score,aslhub_competency_text($parts,$replacement)]);
            }
        }
    }
}

/** Single-use, all-or-nothing setup. Backup callback must complete before any content write. */
function aslhub_import_competencies(PDO $pdo, callable $backup): void {
    $bundle=aslhub_competency_bundle();
    $calendar=aslhub_calendar_parse(json_encode($bundle['calendar'],JSON_THROW_ON_ERROR));
    if (!$calendar['success']) throw new RuntimeException($calendar['error']);
    // Serialize setup against another request; released even when backup/validation fails.
    if ((int)$pdo->query("SELECT GET_LOCK('aslhub_competencies_import', 0)")->fetchColumn() !== 1) throw new RuntimeException('Import already in progress.');
    try {
        if (aslhub_competencies_installed($pdo)) throw new RuntimeException('Competencies have already been imported.');
        $backup($pdo);
        $pdo->beginTransaction();
        try {
            aslhub_calendar_apply($pdo,$calendar);
            aslhub_write_competencies($pdo,$bundle);
            aslhub_set_setting($pdo,'competencies_installed',$bundle['version']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    } finally { $pdo->query("SELECT RELEASE_LOCK('aslhub_competencies_import')"); }
}
