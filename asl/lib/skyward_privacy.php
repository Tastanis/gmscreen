<?php
/** Remove only legacy Skyward numbers. Internal users.id relationships are untouched. */
function aslhub_skyward_purge_plan(PDO $pdo, array $destination): array {
    $rows = $pdo->query('SELECT id,skyward_student_id FROM users WHERE skyward_student_id IS NOT NULL ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    // The public plan contains only aggregate counts and an opaque review digest, never numbers.
    return ['operation'=>'remove_skyward_numbers', 'destination'=>$destination, 'affected_accounts'=>count($rows),
        'column'=>'users.skyward_student_id', 'replacement'=>null,
        'review_sha256'=>hash('sha256', json_encode([$destination,$rows], JSON_THROW_ON_ERROR))];
}

function aslhub_purge_skyward_ids(PDO $pdo, array $destination, string $reviewHash): int {
    if ($pdo->inTransaction()) throw new RuntimeException('Purge requires its own transaction.');
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'mysql') {
        $engine = $pdo->query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'")->fetchColumn();
        if (strcasecmp((string)$engine, 'InnoDB') !== 0) throw new RuntimeException('Transactional users storage required.');
        if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='users'")->fetchColumn()) throw new RuntimeException('Review users triggers before purging.');
        if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND LOWER(EXTRA) LIKE '%on update%'")->fetchColumn()) throw new RuntimeException('Review automatically changing user columns before purging.');
        $pdo->exec('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    } elseif ($driver !== 'sqlite') throw new RuntimeException('Unsupported database.');
    $pdo->beginTransaction();
    try {
        if ($driver === 'mysql') $pdo->query('SELECT id FROM users ORDER BY id FOR UPDATE')->fetchAll();
        $plan = aslhub_skyward_purge_plan($pdo,$destination);
        if (!hash_equals($plan['review_sha256'],$reviewHash)) throw new RuntimeException('Destination or affected values changed; preview again.');
        $fingerprint = function () use ($pdo): string {
            $hash = hash_init('sha256');
            foreach ($pdo->query('SELECT * FROM users ORDER BY id') as $row) {
                unset($row['skyward_student_id']);
                hash_update($hash,json_encode($row,JSON_THROW_ON_ERROR));
            }
            return hash_final($hash);
        };
        $preserved = $fingerprint();
        $count = $pdo->exec('UPDATE users SET skyward_student_id=NULL WHERE skyward_student_id IS NOT NULL');
        if ($count !== $plan['affected_accounts'] || (int)$pdo->query('SELECT COUNT(*) FROM users WHERE skyward_student_id IS NOT NULL')->fetchColumn() !== 0) throw new RuntimeException('Purge verification failed.');
        if (!hash_equals($preserved,$fingerprint())) throw new RuntimeException('Non-Skyward account fields changed; rolling back.');
        $pdo->commit();
        return $count;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
