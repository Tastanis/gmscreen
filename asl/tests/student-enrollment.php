<?php
/** Synthetic file-backed SQLite only; never loads production configuration. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/student_enrollment.php';
define('ASLHUB_CLAIM_PASSWORD', 'Synthetic-Claim-Only');
function enrollment_check(bool $ok, string $label): void {
    if (!$ok) throw new RuntimeException($label);
    echo "PASS $label\n";
}
function enrollment_refused(callable $fn, string $label): void {
    try { $fn(); } catch (RuntimeException $e) { enrollment_check(true, $label); return; }
    throw new RuntimeException('Not refused: ' . $label);
}
$file = tempnam(sys_get_temp_dir(), 'asl-enrollment-');
$connect = fn()=>new PDO('sqlite:'.$file, null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
try {
    $db = $connect();
    $db->exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT COLLATE NOCASE,last_name TEXT COLLATE NOCASE,email TEXT,password TEXT,is_teacher INTEGER,teacher TEXT,is_active INTEGER,is_unclaimed INTEGER,must_change_password INTEGER,level INTEGER,class_period INTEGER,skyward_student_id TEXT)');
    $db->exec("INSERT INTO users VALUES (1,'Brandon','Harms','teacher@example.invalid','teacher-hash',1,'harms',1,0,0,NULL,NULL,NULL),(2,'Existing','Learner','existing@example.invalid','claimed-hash',0,'harms',1,0,0,2,3,'00002'),(3,'Inactive','Learner','inactive@example.invalid','inactive-hash',0,'harms',0,1,1,1,4,'00003')");
    $tables = ['user_learning_targets','user_learning_target_score_history','asl_self_assessments','asl_student_meetings','asl_student_block_metrics','asl_student_block_metric_audit','goals','asl_settings'];
    foreach ($tables as $table) {
        $db->exec("CREATE TABLE $table (id INTEGER PRIMARY KEY, value TEXT)");
        $db->exec("INSERT INTO $table VALUES (1,'existing grade, status, progress, note or goal'),(2,'inactive student history')");
    }
    $snapshot = function() use (&$db, $tables) {
        $result = [];
        foreach (['users',...$tables] as $table) $result[$table] = $db->query("SELECT * FROM $table ORDER BY id")->fetchAll();
        return $result;
    };
    $before = $snapshot();
    $student = ['first_name'=>'New Compound','last_name'=>'Del Rio','email'=>'NEW@example.invalid','class_period'=>5,'level'=>3];
    $destination = ['host'=>'synthetic','database'=>'disposable'];
    $plan = aslhub_enrollment_plan($db,$student,$destination);
    enrollment_check($snapshot() === $before, 'preview writes nothing');
    enrollment_refused(fn()=>aslhub_enroll_student($db,$student,$destination,'stale'), 'stale review refused');
    enrollment_refused(fn()=>aslhub_enroll_student($db,$student,['database'=>'other'],$plan['review_sha256']), 'changed destination refused');
    enrollment_refused(fn()=>aslhub_enroll_student($db,array_replace($student,['class_period'=>4]),$destination,$plan['review_sha256']), 'changed class refused');
    foreach ([['skyward_student_id'=>4],['level'=>0],['class_period'=>7],['email'=>'invalid'],['first_name'=>''],['is_active'=>0]] as $bad) enrollment_refused(fn()=>aslhub_enrollment_plan($db,array_replace($student,$bad),$destination),'invalid input '.key($bad));
    foreach ([['email'=>' EXISTING@example.invalid '],['first_name'=>'inactive','last_name'=>'learner'],['first_name'=>'Brandon','last_name'=>'Harms']] as $bad) enrollment_refused(fn()=>aslhub_enrollment_plan($db,array_replace($student,$bad),$destination),'existing identity '.key($bad));
    $db->exec("CREATE TRIGGER fail_add AFTER INSERT ON users BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
    enrollment_refused(fn()=>aslhub_enroll_student($db,$student,$destination,$plan['review_sha256']), 'insert failure rolls back');
    enrollment_check($snapshot() === $before && !$db->inTransaction(), 'failed operations preserve all rows');
    $db->exec('DROP TRIGGER fail_add');
    $id = aslhub_enroll_student($db,$student,$destination,$plan['review_sha256']);
    $db = null; $db = $connect();
    $after = $snapshot();
    enrollment_check(count($after['users']) === count($before['users'])+1, 'exactly one student persists after reconnect');
    $new = array_pop($after['users']);
    enrollment_check($after === $before, 'all existing accounts, passwords, status, grades, progress and related rows unchanged');
    enrollment_check($new['id']===$id && $new['skyward_student_id']===null && $new['level']===3 && $new['class_period']===5 && $new['email']==='new@example.invalid' && $new['teacher']==='harms' && $new['is_active']===1 && $new['is_unclaimed']===1 && $new['is_teacher']===0, 'correct identity and enrollment flags');
    enrollment_refused(fn()=>aslhub_enroll_student($db,$student,$destination,$plan['review_sha256']), 'retry cannot duplicate or reset the student');
    enrollment_check(aslhub_authenticate($db,'New Compound','Del Rio',ASLHUB_CLAIM_PASSWORD)['id']===$id, 'new student uses existing claiming flow');
    enrollment_check(aslhub_save_claim_password($db,$id,'personal-test-password'), 'new student can claim a personal password');
    enrollment_refused(fn()=>aslhub_enroll_student($db,$student,$destination,$plan['review_sha256']), 'claimed student cannot be reset by retry');
    enrollment_check(aslhub_authenticate($db,'New Compound','Del Rio','personal-test-password')['id']===$id && aslhub_authenticate($db,'New Compound','Del Rio',ASLHUB_CLAIM_PASSWORD)===null, 'claimed password preserved and initial credential disabled');
    foreach ([[], ['email'=>null], ['email'=>'  ']] as $index=>$optional) {
        $minimal = array_merge(['first_name'=>'Optional'. $index,'last_name'=>'Fixture','class_period'=>6,'level'=>1], $optional);
        $preserved = $snapshot();
        $preview = aslhub_enrollment_plan($db,$minimal,$destination);
        enrollment_check($snapshot()===$preserved && $preview['student']['email']===null && !array_key_exists('skyward_student_id',$preview['student']), 'missing/null/blank optional identifiers normalize to NULL without writes '.$index);
        $optionalId = aslhub_enroll_student($db,$minimal,$destination,$preview['review_sha256']);
        $db = null; $db = $connect();
        $current = $snapshot(); $inserted = array_pop($current['users']);
        enrollment_check($current===$preserved && $inserted['email']===null && $inserted['skyward_student_id']===null, 'optional identifiers persist as SQL NULL and every existing row remains unchanged '.$index);
        enrollment_check(aslhub_authenticate($db,$minimal['first_name'],$minimal['last_name'],ASLHUB_CLAIM_PASSWORD)['id']===$optionalId, 'claim login works without email or Skyward ID '.$index);
        enrollment_refused(fn()=>aslhub_enrollment_plan($db,$minimal,$destination), 'name duplicate still refused with NULL identifiers '.$index);
    }
    $minimal = ['first_name'=>'Unique','last_name'=>'Fixture','class_period'=>6,'level'=>1];
    enrollment_refused(fn()=>aslhub_enrollment_plan($db,$minimal+['email'=>'EXISTING@example.invalid'],$destination), 'provided duplicate email refused without student ID');
    foreach ([null, '', 'SYNTHETIC-DO-NOT-STORE'] as $forbidden) enrollment_refused(fn()=>aslhub_enrollment_plan($db,$minimal+['skyward_student_id'=>$forbidden],$destination), 'Skyward input is rejected, not stored');
    enrollment_refused(fn()=>aslhub_enrollment_plan($db,$minimal+['email'=>false],$destination), 'non-string email is not treated as unavailable');
    enrollment_refused(fn()=>aslhub_enrollment_plan($db,$minimal+['skyward_student_id'=>0],$destination), 'numeric student ID is not treated as unavailable');
    $db->exec('UPDATE users SET is_active=0 WHERE id=1');
    enrollment_refused(fn()=>aslhub_enrollment_plan($db,$student,$destination),'inactive teacher refused');
    $db->exec("UPDATE users SET is_active=1 WHERE id=1; INSERT INTO users (first_name,last_name,is_teacher,teacher,is_active,is_unclaimed) VALUES ('Brandon','Harms',1,'harms',1,0)");
    enrollment_refused(fn()=>aslhub_enrollment_plan($db,$student,$destination),'ambiguous teacher refused');
} finally {
    $db = null;
    unlink($file);
}
