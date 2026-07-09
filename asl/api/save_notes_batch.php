<?php
/** Teacher-only, all-or-nothing batch save for dated student notes. */
require_once dirname(__DIR__) . '/config.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();
$date = trim((string)($_POST['date'] ?? ''));
$changes = json_decode((string)($_POST['changes'] ?? ''), true);
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)) aslhub_json_error('Invalid note date.');
if (!is_array($changes) || !$changes || count($changes)>200) aslhub_json_error('Choose between 1 and 200 notes.');
$confirmBlank = !empty($_POST['confirm_blank']);

try {
    $pdo->beginTransaction();
    $find=$pdo->prepare('SELECT * FROM asl_student_meetings WHERE user_id=? AND meeting_date=? FOR UPDATE');
    $saved=[];
    foreach($changes as $change){
        $studentId=(int)($change['student_id']??0);
        $note=trim((string)($change['notes']??''));
        aslhub_require_student_scope($pdo,$teacher,$studentId);
        $find->execute([$studentId,$date]); $old=$find->fetch();
        if($old && trim((string)$old['notes'])!=='' && $note==='' && !$confirmBlank){
            throw new DomainException('BLANK_CONFIRM');
        }
        if($old){
            $pdo->prepare('UPDATE asl_student_meetings SET notes=? WHERE id=?')->execute([$note?:null,$old['id']]);
        }else{
            $pdo->prepare('INSERT INTO asl_student_meetings (user_id,meeting_date,absences,notes) VALUES (?,?,0,?)')
                ->execute([$studentId,$date,$note?:null]);
        }
        $saved[]=$studentId;
    }
    $pdo->commit();
    aslhub_json(['success'=>true,'saved'=>$saved]);
}catch(DomainException $e){
    if($pdo->inTransaction())$pdo->rollBack();
    aslhub_json(['success'=>false,'needs_confirm'=>true,'error'=>'One or more existing notes would be cleared.'],409);
}catch(Throwable $e){
    if($pdo->inTransaction())$pdo->rollBack();
    error_log('save_notes_batch: '.$e->getMessage());
    aslhub_json_error('Notes were not saved; nothing was changed.',500);
}
