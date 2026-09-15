<?php
/** CLI-only integration tests. SQLite is disposable; no production configuration is loaded. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/account_auth.php';
require_once dirname(__DIR__) . '/lib/roster.php';
require_once dirname(__DIR__) . '/lib/account_reset.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';
require_once dirname(__DIR__) . '/lib/helpers.php';
function check(bool $ok, string $label): void { if (!$ok) throw new RuntimeException($label); echo "PASS $label\n"; }
function refused(callable $call, string $label): void { try { $call(); } catch (RuntimeException $e) { check(true,$label); return; } throw new RuntimeException($label); }
function fixture(PDO $pdo): void {
    $pdo->exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT COLLATE NOCASE, last_name TEXT COLLATE NOCASE, email TEXT, password TEXT, is_teacher INTEGER DEFAULT 0, teacher TEXT, is_active INTEGER DEFAULT 1, is_unclaimed INTEGER DEFAULT 0, must_change_password INTEGER DEFAULT 0, level INTEGER, class_period INTEGER, skyward_student_id TEXT)');
    $stmt=$pdo->prepare('INSERT INTO users (first_name,last_name,password,is_teacher,teacher,is_unclaimed) VALUES (?,?,?,?,?,?)');
    foreach ([['Brandon','Harms',1,'harms',0],['Other','Teacher',1,'parks',0],['test','test',0,'harms',0],['Old','Student',0,'harms',0]] as [$f,$l,$t,$owner,$u]) $stmt->execute([$f,$l,password_hash('original',PASSWORD_DEFAULT),$t,$owner,$u]);
    foreach (ASLHUB_ACCOUNT_DEPENDENCIES as $table) {
        $pdo->exec("CREATE TABLE `$table` (id INTEGER PRIMARY KEY, user_id INTEGER, value TEXT)");
        $pdo->exec("INSERT INTO `$table` VALUES (1,1,'keep teacher'),(2,3,'keep test'),(3,4,'remove fake')");
    }
}
$pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]); fixture($pdo);
check(aslhub_roster_name('ALPHA BETA C. DEL RIO') === ['ALPHA BETA','DEL RIO'],'compound first and last names');
check(aslhub_roster_name('ALPHA DEL RIO') === ['ALPHA','DEL RIO'],'surname without middle initial');
$roster=['groups'=>[], 'students'=>[
    ['first_name'=>'ALPHA BETA','last_name'=>'DEL RIO','email'=>'one@example.invalid','skyward_student_id'=>'001','class_period'=>5,'level'=>3],
    ['first_name'=>'GAMMA','last_name'=>'DEL RIO','email'=>'two@example.invalid','skyward_student_id'=>'002','class_period'=>5,'level'=>1],
    ['first_name'=>'DELTA','last_name'=>'OTHER','email'=>'three@example.invalid','skyward_student_id'=>'003','class_period'=>3,'level'=>3]]];
$users=$pdo->query('SELECT * FROM users ORDER BY id')->fetchAll();
$plan=aslhub_account_reset_plan($users,$roster);
check($plan['delete_ids']===[2,4] && $plan['retain_test_id']===3,'exact teacher and test retention');
refused(fn()=>aslhub_account_reset_plan(array_slice($users,1),$roster),'missing Brandon fails closed');
refused(fn()=>aslhub_account_reset_plan([...$users,$users[0]],$roster),'ambiguous Brandon fails closed');
$backup=tempnam(sys_get_temp_dir(),'asl-test-backup-');
// A SQLite SQL dump for the disposable database, restored below to verify recovery.
$sql=''; foreach (['users',...ASLHUB_ACCOUNT_DEPENDENCIES] as $table) {
    $q=$pdo->prepare("SELECT sql FROM sqlite_master WHERE name=?"); $q->execute([$table]); $sql.=$q->fetchColumn().";\n";
    foreach ($pdo->query("SELECT * FROM `$table`") as $row) $sql.="INSERT INTO `$table` VALUES (".implode(',',array_map(fn($v)=>$v===null?'NULL':$pdo->quote((string)$v),array_values($row))).");\n";
} file_put_contents($backup,$sql); $hash=hash_file('sha256',$backup);
$pdo->beginTransaction();
refused(fn()=>aslhub_apply_account_reset($pdo,$roster,'stale',$backup,$hash),'stale account review refused');
refused(fn()=>aslhub_apply_account_reset($pdo,$roster,$plan['review_sha256'],$backup,'bad'),'corrupt backup refused');
aslhub_apply_account_reset($pdo,$roster,$plan['review_sha256'],$backup,$hash);
check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn()===5,'roster accounts plus teacher and test');
foreach (ASLHUB_ACCOUNT_DEPENDENCIES as $t) check((int)$pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn()===2,"retained data in $t");
check($pdo->query('SELECT password FROM users WHERE id=1')->fetchColumn()===$users[0]['password'],'teacher password preserved');
check(aslhub_authenticate($pdo,'test','test','test')!==null,'test account login');
$teacher=['is_teacher'=>1,'teacher'=>'harms'];
check(count(aslhub_scoped_students($pdo,$teacher,['level'=>3]))===2,'level filtering');
check(count(aslhub_scoped_students($pdo,$teacher,['period'=>5]))===2,'period filtering');
check(count(aslhub_scoped_students($pdo,$teacher,['period'=>5,'level'=>3]))===1,'combined filtering');
$claim=aslhub_authenticate($pdo,'ALPHA BETA','DEL RIO',aslhub_claim_password());
check($claim!==null && $claim['is_unclaimed']==1,'unclaimed login');
check(aslhub_authenticate($pdo,'ALPHA BETA','DEL RIO',strtolower(aslhub_claim_password()))===null,'claim password case sensitive');
check(aslhub_authenticate($pdo,'Brandon','Harms',aslhub_claim_password())===null,'claim password cannot authenticate teacher');
check(aslhub_personal_password_error('different','mismatch')!==null,'mismatch rejected');
check(aslhub_personal_password_error(aslhub_claim_password(),aslhub_claim_password())!==null,'default rejected as personal password');
check(aslhub_save_claim_password($pdo,$claim['id'],'personal-value'),'save personal password');
check(!aslhub_save_claim_password($pdo,$claim['id'],'second-value'),'second claim cannot overwrite password');
check(aslhub_authenticate($pdo,'ALPHA BETA','DEL RIO',aslhub_claim_password())===null,'default disabled after claim');
check(aslhub_authenticate($pdo,'ALPHA BETA','DEL RIO','personal-value')!==null,'personal password login');
$pdo->rollBack(); check($pdo->query('SELECT * FROM users ORDER BY id')->fetchAll()===$users,'rollback restores original accounts');
$restored=new PDO('sqlite::memory:'); $restored->exec(file_get_contents($backup));
check($restored->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC)===$users,'backup restores exact accounts'); unlink($backup);
if (isset($argv[1])) {
    $r=aslhub_read_rosters($argv[1]); check(count($r['students'])===143,'private roster has 143 unique accounts');
    $privatePlan=aslhub_account_reset_plan($users,$r);
    $privateBackup=tempnam(sys_get_temp_dir(),'asl-private-test-'); file_put_contents($privateBackup,$sql);
    $pdo->beginTransaction();
    aslhub_apply_account_reset($pdo,$r,$privatePlan['review_sha256'],$privateBackup,hash_file('sha256',$privateBackup));
    check(count(aslhub_scoped_students($pdo,$teacher,['level'=>3]))===8,'private roster all ASL3 = 8');
    check(count(aslhub_scoped_students($pdo,$teacher,['period'=>5]))===30,'private roster period5 = 30');
    check(count(aslhub_scoped_students($pdo,$teacher,['period'=>5,'level'=>3]))===1,'private roster period5 ASL3 = 1');
    $actual=$pdo->query('SELECT first_name,last_name,email,skyward_student_id,class_period,level FROM users WHERE is_unclaimed=1 ORDER BY skyward_student_id')->fetchAll();
    $expected=$r['students']; usort($expected,fn($a,$b)=>strcmp($a['skyward_student_id'],$b['skyward_student_id']));
    check($actual==$expected,'all 143 stored names emails course and period match source');
    $pdo->rollBack(); unlink($privateBackup);
}
