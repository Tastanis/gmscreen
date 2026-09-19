<?php
/** SQLite adapter only for isolated tests; production PHP services execute unchanged. */
class CompetencyFixturePDO extends PDO {
    public function __construct(string $path) {
        parent::__construct('sqlite:'.$path,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
        $this->sqliteCreateFunction('NOW',fn()=>date('Y-m-d H:i:s'));
        $this->sqliteCreateFunction('GET_LOCK',fn($name,$timeout)=>1);
        $this->sqliteCreateFunction('RELEASE_LOCK',fn($name)=>1);
    }
    private function translate(string $sql): string {
        $sql=str_replace([' FOR UPDATE','INSERT IGNORE','ON DUPLICATE KEY UPDATE','DATE_ADD(m.meeting_date, INTERVAL 6 DAY)'],['','INSERT OR IGNORE','ON CONFLICT DO UPDATE SET',"date(m.meeting_date, '+6 days')"],$sql);
        return preg_replace('/VALUES\((\w+)\)/i','excluded.$1',$sql);
    }
    public function prepare(string $query,array $options=[]): PDOStatement|false { return parent::prepare($this->translate($query),$options); }
    public function query(string $query,?int $fetchMode=null,mixed ...$args): PDOStatement|false {
        if (preg_match('/^SHOW CREATE TABLE `([a-z_]+)`$/',$query,$m)) {
            $q=parent::prepare("SELECT name,sql AS 'Create Table' FROM sqlite_master WHERE type='table' AND name=?"); $q->execute([$m[1]]);
            if (!$q->fetch()) { $e=new PDOException('Missing fixture table'); $e->errorInfo=['42S02',1146]; throw $e; }
            $q->execute([$m[1]]); return $q;
        }
        return $fetchMode===null ? parent::query($this->translate($query)) : parent::query($this->translate($query),$fetchMode,...$args);
    }
    public function exec(string $statement): int|false {
        if ($statement==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') return 0;
        if ($statement==='START TRANSACTION WITH CONSISTENT SNAPSHOT') { $this->beginTransaction(); return 0; }
        return parent::exec($statement);
    }
}
function competency_fixture_schema(PDO $pdo): void {
    $definitions=[
        'asl_settings'=>'setting_key TEXT PRIMARY KEY, setting_value TEXT',
        'users'=>'id INTEGER PRIMARY KEY, first_name TEXT,last_name TEXT,email TEXT,password TEXT,is_teacher INTEGER,teacher TEXT,is_active INTEGER DEFAULT 1,is_unclaimed INTEGER DEFAULT 0,level INTEGER,class_period INTEGER',
        'asl_skill_buckets'=>'bucket_id TEXT PRIMARY KEY,code TEXT,name TEXT,order_index INTEGER,active INTEGER',
        'asl_standards'=>'standard_id TEXT PRIMARY KEY,bucket_id TEXT,name TEXT,description TEXT,order_index INTEGER,active INTEGER',
        'asl_learning_targets'=>'id INTEGER PRIMARY KEY AUTOINCREMENT,standard_id TEXT,title TEXT,description TEXT,order_index INTEGER,active INTEGER,asl_level INTEGER,target_code TEXT UNIQUE,sub_code TEXT',
        'asl_rubric_levels'=>'id INTEGER PRIMARY KEY AUTOINCREMENT,learning_target_id INTEGER,score INTEGER,descriptor TEXT,UNIQUE(learning_target_id,score)',
        'asl_learning_target_resources'=>'id INTEGER PRIMARY KEY,learning_target_id INTEGER,standard_id TEXT,asl_level INTEGER,order_index INTEGER',
        'user_learning_targets'=>'user_id INTEGER,learning_target_id INTEGER,score INTEGER,completed_at TEXT,UNIQUE(user_id,learning_target_id)',
        'asl_self_assessments'=>'user_id INTEGER,learning_target_id INTEGER,score INTEGER,UNIQUE(user_id,learning_target_id)',
        'user_learning_target_score_history'=>'id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,learning_target_id INTEGER,score INTEGER,scored_at TEXT,scored_by INTEGER',
        'asl_calendar_days'=>'school_date TEXT PRIMARY KEY,is_instructional INTEGER,label TEXT,calendar_revision INTEGER',
        'asl_reporting_blocks'=>'id INTEGER PRIMARY KEY AUTOINCREMENT,block_index INTEGER UNIQUE,label TEXT,start_date TEXT,end_date TEXT,instructional_days INTEGER,participation_max INTEGER,active INTEGER,finalized_at TEXT,calendar_revision INTEGER',
        'asl_student_meetings'=>'id INTEGER PRIMARY KEY,user_id INTEGER,meeting_date TEXT,absences INTEGER,participation_pct INTEGER,participation_points INTEGER,notes TEXT',
        'asl_student_block_metrics'=>'user_id INTEGER,block_id INTEGER,absences INTEGER,participation_points INTEGER,participation_max INTEGER,version INTEGER,UNIQUE(user_id,block_id)'
    ];
    foreach ($definitions as $table=>$columns) $pdo->exec("CREATE TABLE $table ($columns)");
    $pdo->exec("INSERT INTO users (id,first_name,last_name,email,password,is_teacher,teacher,level,class_period) VALUES
        (1,'Demo','Teacher','teacher@example.invalid','fixture',1,'harms',1,1),
        (2,'Demo','Student','student@example.invalid','fixture',0,'harms',1,1),
        (3,'ASL3','Student','three@example.invalid','fixture',0,'harms',3,1),
        (4,'Other','Teacher','other@example.invalid','fixture',1,'parks',1,1)");
}
