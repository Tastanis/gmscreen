<?php
/** Build a disposable copy of the real auth pages with SQLite storage. CLI only. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$dir = sys_get_temp_dir() . '/asl-auth-' . bin2hex(random_bytes(6));
mkdir($dir); mkdir($dir.'/lib'); mkdir($dir.'/css'); mkdir($dir.'/teacher');
$source=dirname(__DIR__);
foreach (['index.php','login.php','create-password.php','lib/helpers.php','lib/account_auth.php','css/auth.css'] as $file) copy($source.'/'.$file,$dir.'/'.$file);
file_put_contents($dir.'/config.php', <<<'PHP'
<?php
session_start();
// Only translate MySQL date expressions for SQLite; authentication is the production code.
class FixturePDO extends PDO {
    public function prepare(string $query, array $options=[]): PDOStatement|false {
        $query=str_replace(['(NOW() - INTERVAL 15 MINUTE)','(NOW() - INTERVAL 60 SECOND)'],["datetime('now','-15 minutes')","datetime('now','-60 seconds')"],$query);
        return parent::prepare($query,$options);
    }
}
$pdo=new FixturePDO('sqlite:'.__DIR__.'/fixture.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
require_once __DIR__.'/lib/helpers.php';
PHP);
file_put_contents($dir.'/dashboard.php',"<?php require __DIR__.'/config.php'; aslhub_require_login(\$pdo); echo 'Authenticated fixture';");
file_put_contents($dir.'/teacher/grading.php',"<?php require dirname(__DIR__).'/config.php'; aslhub_require_teacher(\$pdo); echo 'Authenticated teacher fixture';");
$pdo=new PDO('sqlite:'.$dir.'/fixture.sqlite');
$pdo->exec('CREATE TABLE users (id INTEGER PRIMARY KEY,first_name TEXT COLLATE NOCASE,last_name TEXT COLLATE NOCASE,password TEXT,is_active INTEGER DEFAULT 1,is_teacher INTEGER DEFAULT 0,is_unclaimed INTEGER DEFAULT 0,must_change_password INTEGER DEFAULT 0)');
$pdo->exec("CREATE TABLE asl_login_attempts (attempt_key TEXT, attempted_at TEXT DEFAULT CURRENT_TIMESTAMP)");
$stmt=$pdo->prepare('INSERT INTO users (first_name,last_name,password,is_unclaimed,is_teacher) VALUES (?,?,?,?,?)');
$stmt->execute(['test','test',password_hash('unusable-random',PASSWORD_DEFAULT),1,0]);
$stmt->execute(['Brandon','Harms',password_hash('fixture-teacher',PASSWORD_DEFAULT),0,1]);
echo $dir;
