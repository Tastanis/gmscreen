<?php
/**
 * ASL Hub content seeder — reads data/rubric_seed.json (generated from the
 * seven proficiency rubric documents) and upserts the taxonomy + rubric text.
 *
 * STRICTLY NON-DESTRUCTIVE:
 *  - Inserts missing rows, updates text/order in place.
 *  - Anything no longer in the seed (e.g. the old 21C bucket, legacy CLF/SPG
 *    codes) is set active = 0 — never deleted — so any attached student
 *    scores survive.
 * Re-runnable at any time.
 */

function aslhub_seed_content(PDO $pdo): array {
    $file = dirname(__DIR__) . '/data/rubric_seed.json';
    if (!file_exists($file)) {
        return ['success' => false, 'error' => 'data/rubric_seed.json not found'];
    }
    $seed = json_decode(file_get_contents($file), true);
    if (!$seed || empty($seed['buckets'])) {
        return ['success' => false, 'error' => 'rubric_seed.json is empty or invalid'];
    }

    $stats = ['buckets' => 0, 'standards' => 0, 'targets' => 0, 'rubric_rows' => 0, 'deactivated' => []];
    $seedBucketIds = [];
    $seedStandardIds = [];
    $seedTargetCodes = [];

    $pdo->beginTransaction();
    try {
        foreach ($seed['buckets'] as $b) {
            $bucketId = $b['code'];
            $seedBucketIds[] = $bucketId;
            $pdo->prepare("INSERT INTO asl_skill_buckets (bucket_id, code, name, blurb, order_index, active)
                VALUES (?, ?, ?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name),
                    order_index = VALUES(order_index), active = 1")
                ->execute([$bucketId, $b['code'], $b['name'], $b['blurb'] ?? null, $b['order']]);
            $stats['buckets']++;

            $sOrder = 0;
            foreach ($b['standards'] as $s) {
                $sOrder++;
                $seedStandardIds[] = $s['id'];
                $pdo->prepare("INSERT INTO asl_standards (standard_id, bucket_id, name, description, order_index, active)
                    VALUES (?, ?, ?, ?, ?, 1)
                    ON DUPLICATE KEY UPDATE bucket_id = VALUES(bucket_id), name = VALUES(name),
                        description = VALUES(description), order_index = VALUES(order_index), active = 1")
                    ->execute([$s['id'], $bucketId, $s['name'], $s['description'] ?? null, $sOrder]);
                $stats['standards']++;

                $tOrder = 0;
                foreach ($s['targets'] as $t) {
                    $tOrder++;
                    foreach ($t['levels'] as $level => $ld) {
                        $code = $ld['code'];
                        $seedTargetCodes[] = $code;
                        $stmt = $pdo->prepare("SELECT id FROM asl_learning_targets WHERE target_code = ?");
                        $stmt->execute([$code]);
                        $row = $stmt->fetch();
                        if ($row) {
                            $targetId = (int)$row['id'];
                            $pdo->prepare("UPDATE asl_learning_targets
                                SET standard_id = ?, title = ?, description = ?, order_index = ?,
                                    active = 1, asl_level = ?, sub_code = ?
                                WHERE id = ?")
                                ->execute([$s['id'], $t['statement'], $t['note'] ?? null, $tOrder, (int)$level, $t['sub'], $targetId]);
                        } else {
                            $pdo->prepare("INSERT INTO asl_learning_targets
                                (standard_id, title, description, order_index, active, asl_level, target_code, sub_code)
                                VALUES (?, ?, ?, ?, 1, ?, ?, ?)")
                                ->execute([$s['id'], $t['statement'], $t['note'] ?? null, $tOrder, (int)$level, $code, $t['sub']]);
                            $targetId = (int)$pdo->lastInsertId();
                        }
                        $stats['targets']++;

                        foreach ($ld['rubric'] as $score => $descriptor) {
                            $pdo->prepare("INSERT INTO asl_rubric_levels (learning_target_id, score, descriptor)
                                VALUES (?, ?, ?)
                                ON DUPLICATE KEY UPDATE descriptor = VALUES(descriptor)")
                                ->execute([$targetId, (int)$score, $descriptor]);
                            $stats['rubric_rows']++;
                        }
                    }
                }
            }
        }

        // Deactivate (NEVER delete) anything not in the seed: 21C, legacy CLF/SPG codes, etc.
        $in = implode(',', array_fill(0, count($seedBucketIds), '?'));
        $stmt = $pdo->prepare("SELECT bucket_id FROM asl_skill_buckets WHERE bucket_id NOT IN ($in) AND active = 1");
        $stmt->execute($seedBucketIds);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $oldId) {
            $stats['deactivated'][] = 'bucket ' . $oldId;
        }
        $pdo->prepare("UPDATE asl_skill_buckets SET active = 0 WHERE bucket_id NOT IN ($in)")->execute($seedBucketIds);

        $in = implode(',', array_fill(0, count($seedStandardIds), '?'));
        $pdo->prepare("UPDATE asl_standards SET active = 0 WHERE standard_id NOT IN ($in)")->execute($seedStandardIds);

        $in = implode(',', array_fill(0, count($seedTargetCodes), '?'));
        $pdo->prepare("UPDATE asl_learning_targets SET active = 0
            WHERE target_code IS NULL OR target_code NOT IN ($in)")->execute($seedTargetCodes);

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        return ['success' => false, 'error' => $e->getMessage()];
    }

    return ['success' => true, 'stats' => $stats];
}

/**
 * Seed/repair teacher accounts. Existing accounts keep their passwords.
 * New accounts get a default password and must change it in Settings.
 */
function aslhub_seed_teachers(PDO $pdo): array {
    $out = [];

    // Tag Harms' existing teacher account (upgrades from the old asl1/asl2 system)
    $pdo->prepare("UPDATE users SET teacher = 'harms' WHERE is_teacher = TRUE AND teacher IS NULL AND first_name = 'Brandon'")->execute();

    // Fresh installs: make sure a Harms admin account exists at all
    $stmt = $pdo->prepare("SELECT id FROM users WHERE is_teacher = TRUE AND teacher = 'harms'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $default = 'HarmsASL2026';
        $pdo->prepare("INSERT INTO users (first_name, last_name, password, email, is_teacher, teacher, is_active, must_change_password)
            VALUES ('Brandon', 'Harms', ?, 'brandon.harms@mghs.edu', TRUE, 'harms', 1, 1)")
            ->execute([password_hash($default, PASSWORD_DEFAULT)]);
        $out[] = "Created Harms admin account (default password: $default — change it in Settings)";
    }

    $stmt = $pdo->prepare("SELECT id FROM users WHERE is_teacher = TRUE AND teacher = 'parks'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $default = 'ParksASL2026'; // temporary — change from the settings page
        $pdo->prepare("INSERT INTO users (first_name, last_name, password, email, is_teacher, teacher, is_active, must_change_password)
            VALUES ('Ms.', 'Parks', ?, NULL, TRUE, 'parks', 1, 1)")
            ->execute([password_hash($default, PASSWORD_DEFAULT)]);
        $out[] = "Created Parks teacher account (default password: $default — change it in Settings)";
    } else {
        $out[] = 'Parks teacher account already exists';
    }
    return $out;
}
