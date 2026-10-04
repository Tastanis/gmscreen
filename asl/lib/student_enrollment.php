<?php
/** Insert-only enrollment. Does not bootstrap the app, migrate, seed, or reset accounts. */
require_once __DIR__ . '/account_auth.php';

function aslhub_enrollment_student(array $input): array {
    $student = [];
    $fields = ['first_name', 'last_name', 'email', 'class_period', 'level'];
    if (array_diff(array_keys($input), $fields)) throw new RuntimeException('Unknown student fields.');
    foreach (['first_name'=>100, 'last_name'=>100, 'email'=>255] as $field=>$limit) {
        $optional = in_array($field, ['email'], true);
        if ($optional && (!isset($input[$field]) || (is_string($input[$field]) && trim($input[$field]) === ''))) {
            $student[$field] = null;
            continue;
        }
        if (!isset($input[$field]) || !is_string($input[$field])) throw new RuntimeException("$field must be a string.");
        $value = trim($input[$field]);
        if ($value === '' || !mb_check_encoding($value, 'UTF-8') || mb_strlen($value, 'UTF-8') > $limit || preg_match('/[\x00-\x1f\x7f]/', $value)) throw new RuntimeException("Invalid $field.");
        $student[$field] = $value;
    }
    if ($student['email'] !== null) {
        $student['email'] = mb_strtolower($student['email'], 'UTF-8');
        if (!filter_var($student['email'], FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Invalid email.');
    }
    foreach (['class_period'=>6, 'level'=>3] as $field=>$max) {
        if (!isset($input[$field]) || !is_int($input[$field]) || $input[$field] < 1 || $input[$field] > $max) throw new RuntimeException("Invalid $field.");
        $student[$field] = $input[$field];
    }
    return $student;
}

function aslhub_enrollment_plan(PDO $pdo, array $input, array $destination): array {
    $student = aslhub_enrollment_student($input);
    // Use database collation, just like login, and include inactive accounts.
    // SQL equality with NULL never matches; optional missing identities do not collide.
    $teachers = $pdo->query("SELECT id,first_name,last_name,teacher FROM users WHERE is_teacher=1 AND is_active=1 AND is_unclaimed=0 AND teacher='harms' AND first_name='Brandon' AND last_name='Harms'")->fetchAll(PDO::FETCH_ASSOC);
    if (count($teachers) !== 1) throw new RuntimeException('Cannot uniquely verify active Brandon Harms teacher.');
    $duplicate = $pdo->prepare('SELECT id FROM users WHERE LOWER(TRIM(email))=LOWER(?) OR (LOWER(TRIM(first_name))=LOWER(?) AND LOWER(TRIM(last_name))=LOWER(?)) LIMIT 1');
    $duplicate->execute([$student['email'], $student['first_name'], $student['last_name']]);
    if ($duplicate->fetchColumn() !== false) throw new RuntimeException('Existing name or email; no account added or changed. Review the existing account separately.');
    $plan = ['operation'=>'add_one_student', 'destination'=>$destination, 'teacher'=>$teachers[0], 'student'=>$student,
        'creates'=>1, 'updates'=>0, 'deletes'=>0, 'is_active'=>1, 'is_unclaimed'=>1];
    $plan['review_sha256'] = hash('sha256', json_encode($plan, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    return $plan;
}

function aslhub_enroll_student(PDO $pdo, array $input, array $destination, string $reviewHash): int {
    if ($pdo->inTransaction()) throw new RuntimeException('Enrollment requires its own transaction.');
    aslhub_claim_password(); // Fail closed before creating an unusable unclaimed account.
    $password = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'mysql') {
        $engine = $pdo->query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'")->fetchColumn();
        if (strcasecmp((string)$engine, 'InnoDB') !== 0) throw new RuntimeException('Transactional InnoDB users table required.');
        // Range locks also prevent concurrent inserts when legacy identity indexes are absent.
        $pdo->exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    } elseif ($driver !== 'sqlite') {
        throw new RuntimeException('Unsupported database.');
    }
    $pdo->beginTransaction();
    try {
        if ($driver === 'mysql') $pdo->query('SELECT id FROM users ORDER BY id FOR UPDATE')->fetchAll();
        $plan = aslhub_enrollment_plan($pdo, $input, $destination);
        if (!hash_equals($plan['review_sha256'], $reviewHash)) throw new RuntimeException('Student, teacher, or destination changed; preview again.');
        $s = $plan['student'];
        $insert = $pdo->prepare('INSERT INTO users (first_name,last_name,email,class_period,level,teacher,password,is_teacher,is_active,is_unclaimed,must_change_password) VALUES (?,?,?,?,?,?,?,0,1,1,0)');
        $insert->execute([$s['first_name'],$s['last_name'],$s['email'],$s['class_period'],$s['level'],$plan['teacher']['teacher'],$password]);
        $id = (int)$pdo->lastInsertId();
        if ($insert->rowCount() !== 1 || $id < 1) throw new RuntimeException('Enrollment did not create exactly one account.');
        $pdo->commit();
        return $id;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
