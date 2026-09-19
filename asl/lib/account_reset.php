<?php
/** A private, single-use migration with an exact account review and durable backup. */
const ASLHUB_ACCOUNT_DEPENDENCIES = ['user_goals', 'asl_student_block_metric_audit',
    'asl_student_block_metrics', 'user_learning_targets', 'user_learning_target_score_history', 'asl_student_meetings', 'asl_self_assessments'];

function aslhub_account_reset_plan(array $users, array $roster): array {
    $teachers = array_values(array_filter($users, fn($u) => !empty($u['is_teacher'])
        && strcasecmp($u['first_name'], 'Brandon') === 0 && strcasecmp($u['last_name'], 'Harms') === 0));
    if (count($teachers) !== 1) throw new RuntimeException('Expected exactly one Brandon Harms teacher. Inspect live identities before resetting.');
    $keep = $teachers[0];
    if (empty($keep['is_active']) || empty($keep['password'])) throw new RuntimeException('Retained teacher must be active and have a password.');
    $tests = array_values(array_filter($users, fn($u) => empty($u['is_teacher']) && $u['first_name'] === 'test' && $u['last_name'] === 'test'));
    if (count($tests) > 1) throw new RuntimeException('Multiple test accounts require review.');
    $testId = $tests ? (int)$tests[0]['id'] : null;
    $delete = array_values(array_filter(array_map(fn($u) => (int)$u['id'], $users), fn($id) => $id !== (int)$keep['id'] && $id !== $testId));
    return ['retain_teacher'=>['id'=>(int)$keep['id'], 'first_name'=>$keep['first_name'], 'last_name'=>$keep['last_name'], 'email'=>$keep['email'] ?? null],
        'retain_test_id'=>$testId, 'delete_ids'=>$delete,
        'delete_accounts'=>array_values(array_map(fn($u)=>['id'=>(int)$u['id'],'first_name'=>$u['first_name'],'last_name'=>$u['last_name'],'is_teacher'=>(bool)$u['is_teacher']], array_filter($users,fn($u)=>in_array((int)$u['id'],$delete,true)))),
        'import_count'=>count($roster['students']), 'groups'=>$roster['groups'],
        'review_sha256'=>hash('sha256', json_encode([$users, $roster], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))];
}

function aslhub_apply_account_reset(PDO $pdo, array $roster, string $reviewHash, string $backupPath, string $backupHash): array {
    if (!$pdo->inTransaction()) throw new RuntimeException('Reset requires a transaction.');
    if (!is_file($backupPath) || filesize($backupPath) < 100 || !hash_equals($backupHash, hash_file('sha256', $backupPath))) throw new RuntimeException('Verified backup required.');
    $users = $pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $plan = aslhub_account_reset_plan($users, $roster);
    if (!hash_equals($reviewHash, $plan['review_sha256'])) throw new RuntimeException('Accounts changed since review; reset refused.');
    if ($plan['delete_ids']) {
        $in = implode(',', array_map('intval', $plan['delete_ids']));
        // Only records belonging to reviewed, removed accounts. Retained account data stays intact.
        foreach (ASLHUB_ACCOUNT_DEPENDENCIES as $table) $pdo->exec("DELETE FROM `$table` WHERE user_id IN ($in)");
        $pdo->exec("DELETE FROM users WHERE id IN ($in)");
    }
    $pdo->prepare("UPDATE users SET teacher='harms', is_unclaimed=0 WHERE id=?")->execute([$plan['retain_teacher']['id']]);
    if ($plan['retain_test_id'] !== null) {
        $pdo->prepare("UPDATE users SET password=?, is_unclaimed=1, is_active=1, teacher='harms', skyward_student_id=NULL WHERE id=?")
            ->execute([password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT), $plan['retain_test_id']]);
    } else {
        $pdo->prepare("INSERT INTO users (first_name,last_name,password,is_teacher,teacher,is_active,is_unclaimed,level,class_period) VALUES ('test','test',?,0,'harms',1,1,1,1)")
            ->execute([password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT)]);
    }
    $insert = $pdo->prepare("INSERT INTO users (first_name,last_name,email,skyward_student_id,level,class_period,password,is_teacher,teacher,is_active,is_unclaimed) VALUES (?,?,?,?,?,?,?,0,'harms',1,1)");
    foreach ($roster['students'] as $s) $insert->execute([$s['first_name'],$s['last_name'],$s['email'],$s['skyward_student_id'],$s['level'],$s['class_period'],password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT)]);
    return $plan;
}
