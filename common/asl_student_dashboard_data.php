<?php

if (!function_exists('aslhubStudentDashboardSeedBuckets')) {
    function aslhubStudentDashboardSeedBuckets(): array
    {
        return [
            [
                'id' => 'REC',
                'code' => 'REC',
                'name' => 'Receptive Comprehension',
                'blurb' => 'Students understand signed language from teachers, peers, and accessible Deaf signers.',
                'standards' => [
                    ['id' => 'REC.1', 'name' => 'Classroom Language and Directions', 'description' => 'Students understand signed classroom language, directions, routines, and teacher feedback.'],
                    ['id' => 'REC.2', 'name' => 'Signs, Fingerspelling, Numbers, Parameters, and NMMs', 'description' => 'Students comprehend meaning through signs, fingerspelling, numbers, parameters, and non-manual markers.'],
                    ['id' => 'REC.3', 'name' => 'Connected Signed Communication', 'description' => 'Students understand connected signed communication on familiar topics.'],
                    ['id' => 'REC.4', 'name' => 'Receptive ASL Structure', 'description' => 'Students identify how ASL structure creates meaning in signed input.'],
                ],
            ],
            [
                'id' => 'EXP',
                'code' => 'EXP',
                'name' => 'Expressive Production & Sign Form',
                'blurb' => 'Students produce clear, accurate, understandable ASL.',
                'standards' => [
                    ['id' => 'EXP.1', 'name' => 'Sign Parameters and Form Accuracy', 'description' => 'Students produce signs with accurate handshape, location, movement, palm orientation, and non-manual markers.'],
                    ['id' => 'EXP.2', 'name' => 'Vocabulary and ASL Structures', 'description' => 'Students produce signed messages using appropriate vocabulary and ASL structures.'],
                    ['id' => 'EXP.3', 'name' => 'Clarity, Pacing, and Fluency', 'description' => 'Students sign with visual clarity, appropriate pacing, and increasing fluency.'],
                    ['id' => 'EXP.4', 'name' => 'ASL Grammar Over English Word Order', 'description' => 'Students use ASL grammar rather than relying only on English word order or word-for-word translation.'],
                ],
            ],
            [
                'id' => 'INT',
                'code' => 'INT',
                'name' => 'Interactive Communication',
                'blurb' => 'Students participate in back-and-forth signed communication.',
                'standards' => [
                    ['id' => 'INT.1', 'name' => 'Initiating and Maintaining Interaction', 'description' => 'Students initiate, maintain, and close signed interactions.'],
                    ['id' => 'INT.2', 'name' => 'Clarification and Repair', 'description' => 'Students use clarification, repair, and negotiation strategies.'],
                    ['id' => 'INT.3', 'name' => 'Visual Interaction Norms', 'description' => 'Students follow visual interaction norms.'],
                    ['id' => 'INT.4', 'name' => 'Staying in ASL', 'description' => 'Students communicate in ASL without defaulting immediately to spoken English.'],
                ],
            ],
            [
                'id' => 'NMM',
                'code' => 'NMM',
                'name' => 'Non-Manual Markers & Visual Grammar',
                'blurb' => 'Students use and understand the face, head, body, eyes, and mouth as part of ASL grammar and meaning.',
                'standards' => [
                    ['id' => 'NMM.1', 'name' => 'Grammatical Non-Manual Markers', 'description' => 'Students use grammatical non-manual markers for sentence types and structures.'],
                    ['id' => 'NMM.2', 'name' => 'Face, Head, Body, and Eye Gaze', 'description' => 'Students interpret and produce facial expression, head movement, body posture, eye gaze, and other non-manual signals to mark meaning.'],
                    ['id' => 'NMM.3', 'name' => 'Mouth Morphemes and Mouth Gestures', 'description' => 'Students use and interpret mouth morphemes and mouth gestures appropriately.'],
                ],
            ],
            [
                'id' => 'SPC',
                'code' => 'SPC',
                'name' => 'Spatial Grammar & Referent Tracking',
                'blurb' => 'Students use signing space to organize people, places, objects, ideas, movement, and relationships.',
                'standards' => [
                    ['id' => 'SPC.1', 'name' => 'Establishing and Maintaining Referents', 'description' => 'Students establish and maintain referents in signing space.'],
                    ['id' => 'SPC.2', 'name' => 'Location, Movement, and Relationships', 'description' => 'Students use signing space to show location, movement, and relationships.'],
                    ['id' => 'SPC.3', 'name' => 'Pronouns, Indexing, Agreement, and Directionality', 'description' => 'Students use pronouns, indexing, agreement, and directionality.'],
                    ['id' => 'SPC.4', 'name' => 'Spatial Organization for Comparison and Sequencing', 'description' => 'Students use spatial organization to compare, contrast, and sequence information.'],
                ],
            ],
            [
                'id' => 'DEP',
                'code' => 'DEP',
                'name' => 'Depicting Signs, Classifiers & Constructed Action',
                'blurb' => 'Students visually represent people, objects, movement, actions, size, shape, handling, and perspective.',
                'standards' => [
                    ['id' => 'DEP.1', 'name' => 'Classifier and Depicting Sign Selection', 'description' => 'Students use depicting signs/classifiers to represent people, objects, and categories of things.'],
                    ['id' => 'DEP.2', 'name' => 'Size, Shape, Movement, Handling, and Visual-Spatial Relationships', 'description' => 'Students depict size, shape, movement, handling, and visual-spatial relationships.'],
                    ['id' => 'DEP.3', 'name' => 'Constructed Action and Role Shift', 'description' => 'Students use constructed action and role shift to show perspective.'],
                    ['id' => 'DEP.4', 'name' => 'Blending Lexical Signs and Visual ASL', 'description' => 'Students blend lexical signs, depicting signs, space, constructed action, and NMMs to create visually clear ASL.'],
                ],
            ],
            [
                'id' => 'DSC',
                'code' => 'DSC',
                'name' => 'Discourse, Narrative & Presentation',
                'blurb' => 'Students organize signed language into clear stories, explanations, summaries, descriptions, and presentations.',
                'standards' => [
                    ['id' => 'DSC.1', 'name' => 'Organization of Signed Communication', 'description' => 'Students organize signed communication with clear beginning, middle, and end.'],
                    ['id' => 'DSC.2', 'name' => 'Storytelling and Recounting Events', 'description' => 'Students tell stories and recount events using ASL discourse features.'],
                    ['id' => 'DSC.3', 'name' => 'Explanation, Description, Summary, and Information Giving', 'description' => 'Students explain, describe, summarize, and give information in ASL.'],
                ],
            ],
            [
                'id' => 'CUL',
                'code' => 'CUL',
                'name' => 'Deaf Culture, Community & ASL Texts',
                'blurb' => 'Students understand Deaf culture, community, history, ASL texts, and connections between language and culture.',
                'standards' => [
                    ['id' => 'CUL.1', 'name' => 'Deaf Cultural Norms', 'description' => 'Students understand and use Deaf cultural norms for visual communication.'],
                    ['id' => 'CUL.2', 'name' => 'Deaf History, People, Events, and Community Issues', 'description' => 'Students understand major people, events, and issues in Deaf history and community life.'],
                    ['id' => 'CUL.3', 'name' => 'ASL Texts, Deaf Media, and Deaf-Created Communication', 'description' => 'Students engage with ASL texts, Deaf media, and Deaf-created communication.'],
                    ['id' => 'CUL.4', 'name' => 'Language and Culture Comparisons', 'description' => 'Students compare ASL, Deaf culture, English, hearing culture, and other language/cultural systems.'],
                ],
            ],
        ];
    }
}

if (!function_exists('aslhubStudentDashboardResourcePlaceholders')) {
    function aslhubStudentDashboardResourcePlaceholders(): array
    {
        return [
            ['type' => 'video', 'label' => 'Video link placeholder'],
            ['type' => 'pretest', 'label' => 'Pre-test placeholder'],
            ['type' => 'summative', 'label' => 'Summative assessment example placeholder'],
            ['type' => 'rubric', 'label' => 'Rubric placeholder'],
            ['type' => 'extension', 'label' => 'Extension activity placeholder'],
            ['type' => 'scaffold', 'label' => 'Scaffolding placeholder'],
        ];
    }
}

if (!function_exists('aslhubLearningTargetScale')) {
    function aslhubLearningTargetScale(): array
    {
        return [
            0 => 'Not attempted',
            1 => 'Beginning',
            2 => 'Developing',
            3 => 'Proficient',
            4 => 'Extending',
        ];
    }
}

if (!function_exists('aslhubEnsureStudentDashboardSchema')) {
    function aslhubEnsureStudentDashboardSchema(PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;

        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS asl_skill_buckets (
                bucket_id VARCHAR(12) NOT NULL PRIMARY KEY,
                code VARCHAR(12) NOT NULL,
                name VARCHAR(255) NOT NULL,
                blurb TEXT NULL,
                order_index INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS asl_standards (
                standard_id VARCHAR(20) NOT NULL PRIMARY KEY,
                bucket_id VARCHAR(12) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT NULL,
                order_index INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_asl_standards_bucket (bucket_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS asl_learning_targets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                standard_id VARCHAR(20) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NULL,
                order_index INT NOT NULL DEFAULT 0,
                active TINYINT(1) NOT NULL DEFAULT 1,
                asl_level TINYINT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_asl_lts_standard (standard_id),
                INDEX idx_asl_lts_level (asl_level)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            try {
                $columnCheck = $pdo->query("SHOW COLUMNS FROM asl_learning_targets LIKE 'asl_level'");
                if ($columnCheck && $columnCheck->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE asl_learning_targets ADD COLUMN asl_level TINYINT NULL AFTER active");
                    $pdo->exec("ALTER TABLE asl_learning_targets ADD INDEX idx_asl_lts_level (asl_level)");
                }
            } catch (PDOException $e) {
                error_log('ASL learning_targets level migration failed: ' . $e->getMessage());
            }

            $pdo->exec("CREATE TABLE IF NOT EXISTS asl_learning_target_resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                learning_target_id INT NOT NULL,
                resource_type VARCHAR(40) NOT NULL,
                resource_label VARCHAR(255) NOT NULL,
                resource_url VARCHAR(500) NULL,
                resource_description TEXT NULL,
                order_index INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_asl_lt_resources_target (learning_target_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS user_learning_targets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                learning_target_id INT NOT NULL,
                score TINYINT NULL,
                completed_at DATETIME NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_learning_target (user_id, learning_target_id),
                INDEX idx_user_lt_user (user_id),
                INDEX idx_user_lt_target (learning_target_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS user_learning_target_score_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                learning_target_id INT NOT NULL,
                score TINYINT NOT NULL DEFAULT 0,
                scored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_lt_history_user_time (user_id, scored_at),
                INDEX idx_user_lt_history_target (learning_target_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $pdo->exec("CREATE TABLE IF NOT EXISTS asl_student_snapshot_metrics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                metric_key VARCHAR(50) NOT NULL,
                metric_value DECIMAL(10,2) NOT NULL,
                unit VARCHAR(80) NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_student_metric (user_id, metric_key),
                INDEX idx_asl_metrics_key (metric_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (PDOException $e) {
            error_log('ASL student dashboard schema check failed: ' . $e->getMessage());
            return;
        }

        try {
            $bucketStmt = $pdo->prepare("INSERT INTO asl_skill_buckets (bucket_id, code, name, blurb, order_index)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE code = VALUES(code), name = VALUES(name), blurb = VALUES(blurb), order_index = VALUES(order_index)");
            $standardStmt = $pdo->prepare("INSERT INTO asl_standards (standard_id, bucket_id, name, description, order_index)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE bucket_id = VALUES(bucket_id), name = VALUES(name), description = VALUES(description), order_index = VALUES(order_index)");

            foreach (aslhubStudentDashboardSeedBuckets() as $bucketIndex => $bucket) {
                $bucketStmt->execute([$bucket['id'], $bucket['code'], $bucket['name'], $bucket['blurb'], $bucketIndex + 1]);
                foreach ($bucket['standards'] as $standardIndex => $standard) {
                    $standardStmt->execute([$standard['id'], $bucket['id'], $standard['name'], $standard['description'], $standardIndex + 1]);
                }
            }
        } catch (PDOException $e) {
            error_log('ASL student dashboard seed failed: ' . $e->getMessage());
        }
    }
}

if (!function_exists('aslhubEmptyBucketProgress')) {
    function aslhubEmptyBucketProgress(array $bucket): array
    {
        return [
            'id' => $bucket['id'],
            'code' => $bucket['code'],
            'name' => $bucket['name'],
            'blurb' => $bucket['blurb'],
                'totalTargets' => 0,
                'completedTargets' => 0,
                'attemptedTargets' => 0,
                'earnedPoints' => 0,
                'totalPoints' => 0,
                'percent' => 0,
                'standards' => [],
        ];
    }
}

if (!function_exists('aslhubStudentDashboardPercent')) {
    function aslhubStudentDashboardPercent(float $earned, float $possible): int
    {
        return $possible > 0 ? (int) round(($earned / $possible) * 100) : 0;
    }
}

if (!function_exists('aslhubStudentDashboardCourseStart')) {
    function aslhubStudentDashboardCourseStart(): DateTimeImmutable
    {
        $now = new DateTimeImmutable('now');
        $year = ((int) $now->format('n') >= 8) ? (int) $now->format('Y') : (int) $now->format('Y') - 1;
        return new DateTimeImmutable($year . '-09-01 00:00:00');
    }
}

if (!function_exists('aslhubStudentDashboardBuildGraph')) {
    function aslhubStudentDashboardBuildGraph(PDO $pdo, int $userId): array
    {
        $months = [
            ['label' => 'Sep', 'weeks' => 4],
            ['label' => 'Oct', 'weeks' => 4],
            ['label' => 'Nov', 'weeks' => 4],
            ['label' => 'Dec', 'weeks' => 4],
            ['label' => 'Jan', 'weeks' => 4],
            ['label' => 'Feb', 'weeks' => 4],
            ['label' => 'Mar', 'weeks' => 4],
            ['label' => 'Apr', 'weeks' => 4],
            ['label' => 'May', 'weeks' => 4],
        ];
        $weeks = 36;
        $overall = array_fill(0, $weeks, 0);
        $byBucket = [];
        foreach (aslhubStudentDashboardSeedBuckets() as $bucket) {
            $byBucket[$bucket['id']] = array_fill(0, $weeks, 0);
        }

        try {
            $stmt = $pdo->prepare("SELECT h.learning_target_id, h.score, h.scored_at, b.bucket_id
                FROM user_learning_target_score_history h
                INNER JOIN asl_learning_targets lt ON lt.id = h.learning_target_id
                INNER JOIN asl_standards st ON st.standard_id = lt.standard_id
                INNER JOIN asl_skill_buckets b ON b.bucket_id = st.bucket_id
                WHERE h.user_id = ? AND lt.active = 1
                ORDER BY h.scored_at, h.id");
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            $rows = [];
        }

        if (empty($rows)) {
            try {
                $stmt = $pdo->prepare("SELECT ult.learning_target_id, COALESCE(ult.score, 0) AS score, COALESCE(ult.completed_at, ult.updated_at) AS scored_at, b.bucket_id
                    FROM user_learning_targets ult
                    INNER JOIN asl_learning_targets lt ON lt.id = ult.learning_target_id
                    INNER JOIN asl_standards st ON st.standard_id = lt.standard_id
                    INNER JOIN asl_skill_buckets b ON b.bucket_id = st.bucket_id
                    WHERE ult.user_id = ? AND COALESCE(ult.score, 0) > 0 AND lt.active = 1
                    ORDER BY scored_at, ult.id");
                $stmt->execute([$userId]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (PDOException $e) {
                $rows = [];
            }
        }

        $start = aslhubStudentDashboardCourseStart();
        $previousScores = [];
        foreach ($rows as $row) {
            try {
                $scoredAt = new DateTimeImmutable($row['scored_at']);
            } catch (Exception $e) {
                continue;
            }

            $score = max(0, min(4, (int) $row['score']));
            $targetId = (int) $row['learning_target_id'];
            $previousScore = $previousScores[$targetId] ?? 0;
            $delta = $score - $previousScore;
            $previousScores[$targetId] = $score;

            if ($delta === 0) {
                continue;
            }

            $days = (int) $start->diff($scoredAt)->format('%r%a');
            if ($days < 0) {
                continue;
            }
            $weekIndex = min($weeks - 1, (int) floor($days / 7));
            $overall[$weekIndex] += $delta;
            if (isset($byBucket[$row['bucket_id']])) {
                $byBucket[$row['bucket_id']][$weekIndex] += $delta;
            }
        }

        $running = 0;
        foreach ($overall as $index => $value) {
            $running = max(0, $running + $value);
            $overall[$index] = $running;
        }

        foreach ($byBucket as $bucketId => $values) {
            $running = 0;
            foreach ($values as $index => $value) {
                $running = max(0, $running + $value);
                $byBucket[$bucketId][$index] = $running;
            }
        }

        return [
            'months' => $months,
            'weeks' => $weeks,
            'overall' => $overall,
            'byBucket' => $byBucket,
        ];
    }
}

if (!function_exists('aslhubStudentDashboardComparisons')) {
    function aslhubStudentDashboardComparisons(PDO $pdo, int $userId): array
    {
        $definitions = [
            'absences' => ['label' => 'Absences', 'better' => 'lower'],
            'on_task_pct' => ['label' => 'On task', 'better' => 'higher'],
        ];
        $studentMetrics = [];
        $classMetrics = [];

        try {
            $stmt = $pdo->prepare("SELECT metric_key, metric_value, unit FROM asl_student_snapshot_metrics WHERE user_id = ?");
            $stmt->execute([$userId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $studentMetrics[$row['metric_key']] = $row;
            }

            $stmt = $pdo->query("SELECT metric_key, AVG(metric_value) AS class_average, MAX(metric_value) AS class_max
                FROM asl_student_snapshot_metrics
                GROUP BY metric_key");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $classMetrics[$row['metric_key']] = $row;
            }
        } catch (PDOException $e) {
            return [];
        }

        $comparisons = [];
        foreach ($definitions as $key => $definition) {
            if (!isset($studentMetrics[$key]) || !isset($classMetrics[$key])) {
                $comparisons[] = [
                    'key' => $key,
                    'label' => $definition['label'],
                    'status' => 'empty',
                    'message' => 'No comparison data yet',
                ];
                continue;
            }

            $studentValue = (float) $studentMetrics[$key]['metric_value'];
            $classAverage = (float) $classMetrics[$key]['class_average'];
            $classMax = max((float) $classMetrics[$key]['class_max'], $studentValue, $classAverage, 1);

            $comparisons[] = [
                'key' => $key,
                'label' => $definition['label'],
                'status' => 'ready',
                'better' => $definition['better'],
                'studentValue' => $studentValue,
                'classAverage' => $classAverage,
                'classMax' => $classMax,
                'unit' => $studentMetrics[$key]['unit'] ?? '',
            ];
        }

        return $comparisons;
    }
}

if (!function_exists('aslhubFetchStudentDashboardData')) {
    function aslhubFetchStudentDashboardData(PDO $pdo, int $userId): array
    {
        aslhubEnsureStudentDashboardSchema($pdo);

        $seedBuckets = aslhubStudentDashboardSeedBuckets();
        $buckets = [];
        $standardsByBucket = [];
        $targetsByStandard = [];
        $resourcesByTarget = [];

        foreach ($seedBuckets as $bucket) {
            $buckets[$bucket['id']] = aslhubEmptyBucketProgress($bucket);
            foreach ($bucket['standards'] as $standard) {
                $standardData = [
                    'id' => $standard['id'],
                    'bucketId' => $bucket['id'],
                    'name' => $standard['name'],
                    'description' => $standard['description'],
                'totalTargets' => 0,
                'completedTargets' => 0,
                'attemptedTargets' => 0,
                'earnedPoints' => 0,
                'totalPoints' => 0,
                'percent' => 0,
            ];
                $standardsByBucket[$bucket['id']][] = $standardData;
                $targetsByStandard[$standard['id']] = [];
            }
        }

        try {
            $stmt = $pdo->query("SELECT bucket_id, code, name, blurb FROM asl_skill_buckets ORDER BY order_index, bucket_id");
            $dbBuckets = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if ($dbBuckets) {
                $buckets = [];
                $standardsByBucket = [];
                foreach ($dbBuckets as $bucket) {
                    $buckets[$bucket['bucket_id']] = [
                        'id' => $bucket['bucket_id'],
                        'code' => $bucket['code'],
                        'name' => $bucket['name'],
                        'blurb' => $bucket['blurb'],
                        'totalTargets' => 0,
                        'completedTargets' => 0,
                        'attemptedTargets' => 0,
                        'earnedPoints' => 0,
                        'totalPoints' => 0,
                        'percent' => 0,
                        'standards' => [],
                    ];
                    $standardsByBucket[$bucket['bucket_id']] = [];
                }
            }

            $stmt = $pdo->query("SELECT standard_id, bucket_id, name, description FROM asl_standards ORDER BY bucket_id, order_index, standard_id");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $standard) {
                if (!isset($standardsByBucket[$standard['bucket_id']])) {
                    continue;
                }
                $standardsByBucket[$standard['bucket_id']][] = [
                    'id' => $standard['standard_id'],
                    'bucketId' => $standard['bucket_id'],
                    'name' => $standard['name'],
                    'description' => $standard['description'],
                    'totalTargets' => 0,
                    'completedTargets' => 0,
                    'attemptedTargets' => 0,
                    'earnedPoints' => 0,
                    'totalPoints' => 0,
                    'percent' => 0,
                ];
                if (!isset($targetsByStandard[$standard['standard_id']])) {
                    $targetsByStandard[$standard['standard_id']] = [];
                }
            }
        } catch (PDOException $e) {
            error_log('ASL dashboard bucket fetch failed: ' . $e->getMessage());
        }

        try {
            $userLevel = null;
            try {
                $levelStmt = $pdo->prepare("SELECT level FROM users WHERE id = ?");
                $levelStmt->execute([$userId]);
                $levelRow = $levelStmt->fetch(PDO::FETCH_ASSOC);
                if ($levelRow && in_array((int) $levelRow['level'], [1, 2], true)) {
                    $userLevel = (int) $levelRow['level'];
                }
            } catch (PDOException $e) {
                $userLevel = null;
            }

            $stmt = $pdo->prepare("SELECT lt.id, lt.standard_id, lt.title, lt.description, COALESCE(ult.score, 0) AS score, ult.completed_at
                FROM asl_learning_targets lt
                LEFT JOIN user_learning_targets ult ON ult.learning_target_id = lt.id AND ult.user_id = ?
                WHERE lt.active = 1 AND (lt.asl_level IS NULL OR lt.asl_level = ?)
                ORDER BY lt.standard_id, lt.order_index, lt.id");
            $stmt->execute([$userId, $userLevel]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $target) {
                $standardId = $target['standard_id'];
                if (!isset($targetsByStandard[$standardId])) {
                    $targetsByStandard[$standardId] = [];
                }
                $score = (int) $target['score'];
                $targetsByStandard[$standardId][] = [
                    'id' => (int) $target['id'],
                    'standardId' => $standardId,
                    'title' => $target['title'],
                    'description' => $target['description'],
                    'score' => $score,
                    'scoreLabel' => aslhubLearningTargetScale()[$score] ?? 'Not attempted',
                    'completed' => $score >= 3,
                    'attempted' => $score > 0,
                    'completedAt' => $target['completed_at'],
                    'placeholder' => false,
                ];
            }

            $stmt = $pdo->query("SELECT learning_target_id, resource_type, resource_label, resource_url, resource_description
                FROM asl_learning_target_resources
                ORDER BY learning_target_id, order_index, id");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $resource) {
                $targetId = (int) $resource['learning_target_id'];
                if (!isset($resourcesByTarget[$targetId])) {
                    $resourcesByTarget[$targetId] = [];
                }
                $resourcesByTarget[$targetId][] = [
                    'type' => $resource['resource_type'],
                    'label' => $resource['resource_label'],
                    'url' => $resource['resource_url'],
                    'description' => $resource['resource_description'],
                ];
            }
        } catch (PDOException $e) {
            error_log('ASL dashboard learning target fetch failed: ' . $e->getMessage());
        }

        $overallTotal = 0;
        $overallCompleted = 0;
        $overallAttempted = 0;
        $overallEarnedPoints = 0;
        foreach ($standardsByBucket as $bucketId => $standards) {
            foreach ($standards as $standardIndex => $standard) {
                $targets = $targetsByStandard[$standard['id']] ?? [];
                $total = count($targets);
                $completed = 0;
                $attempted = 0;
                $earnedPoints = 0;
                foreach ($targets as $target) {
                    $score = max(0, min(4, (int) ($target['score'] ?? 0)));
                    $earnedPoints += $score;
                    if ($score > 0) {
                        $attempted++;
                    }
                    if (!empty($target['completed'])) {
                        $completed++;
                    }
                }
                $totalPoints = $total * 4;

                $standardsByBucket[$bucketId][$standardIndex]['totalTargets'] = $total;
                $standardsByBucket[$bucketId][$standardIndex]['completedTargets'] = $completed;
                $standardsByBucket[$bucketId][$standardIndex]['attemptedTargets'] = $attempted;
                $standardsByBucket[$bucketId][$standardIndex]['earnedPoints'] = $earnedPoints;
                $standardsByBucket[$bucketId][$standardIndex]['totalPoints'] = $totalPoints;
                $standardsByBucket[$bucketId][$standardIndex]['percent'] = aslhubStudentDashboardPercent($earnedPoints, $totalPoints);

                if (isset($buckets[$bucketId])) {
                    $buckets[$bucketId]['totalTargets'] += $total;
                    $buckets[$bucketId]['completedTargets'] += $completed;
                    $buckets[$bucketId]['attemptedTargets'] += $attempted;
                    $buckets[$bucketId]['earnedPoints'] += $earnedPoints;
                    $buckets[$bucketId]['totalPoints'] += $totalPoints;
                }
                $overallTotal += $total;
                $overallCompleted += $completed;
                $overallAttempted += $attempted;
                $overallEarnedPoints += $earnedPoints;
            }
        }

        foreach ($buckets as $bucketId => $bucket) {
            $buckets[$bucketId]['percent'] = aslhubStudentDashboardPercent($bucket['earnedPoints'], $bucket['totalPoints']);
            $buckets[$bucketId]['standards'] = $standardsByBucket[$bucketId] ?? [];
        }

        try {
            $stmt = $pdo->prepare("SELECT first_name, last_name FROM users WHERE id = ?");
            $stmt->execute([$userId]);
            $studentRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $studentName = trim(($studentRow['first_name'] ?? '') . ' ' . ($studentRow['last_name'] ?? ''));
        } catch (PDOException $e) {
            $studentName = trim(($_SESSION['user_first_name'] ?? '') . ' ' . ($_SESSION['user_last_name'] ?? ''));
        }

        return [
            'student' => [
                'name' => $studentName,
            ],
            'overall' => [
                'totalTargets' => $overallTotal,
                'completedTargets' => $overallCompleted,
                'attemptedTargets' => $overallAttempted,
                'earnedPoints' => $overallEarnedPoints,
                'totalPoints' => $overallTotal * 4,
                'percent' => aslhubStudentDashboardPercent($overallEarnedPoints, $overallTotal * 4),
            ],
            'buckets' => array_values($buckets),
            'targetsByStandard' => $targetsByStandard,
            'resourcesByTarget' => $resourcesByTarget,
            'resourcePlaceholders' => aslhubStudentDashboardResourcePlaceholders(),
            'scale' => aslhubLearningTargetScale(),
            'graph' => aslhubStudentDashboardBuildGraph($pdo, $userId),
            'comparisons' => aslhubStudentDashboardComparisons($pdo, $userId),
        ];
    }
}

if (!function_exists('aslhubFetchTeacherStandardsData')) {
    function aslhubFetchTeacherStandardsData(PDO $pdo, int $aslLevel): array
    {
        aslhubEnsureStudentDashboardSchema($pdo);

        $buckets = [];
        $standardsByBucket = [];
        $targetsByStandard = [];

        try {
            $stmt = $pdo->query("SELECT bucket_id, code, name, blurb FROM asl_skill_buckets ORDER BY order_index, bucket_id");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $bucket) {
                $buckets[$bucket['bucket_id']] = [
                    'id' => $bucket['bucket_id'],
                    'code' => $bucket['code'],
                    'name' => $bucket['name'],
                    'blurb' => $bucket['blurb'],
                    'standards' => [],
                ];
                $standardsByBucket[$bucket['bucket_id']] = [];
            }

            $stmt = $pdo->query("SELECT standard_id, bucket_id, name, description FROM asl_standards ORDER BY bucket_id, order_index, standard_id");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $standard) {
                if (!isset($standardsByBucket[$standard['bucket_id']])) {
                    continue;
                }
                $standardsByBucket[$standard['bucket_id']][] = [
                    'id' => $standard['standard_id'],
                    'bucketId' => $standard['bucket_id'],
                    'name' => $standard['name'],
                    'description' => $standard['description'],
                ];
                $targetsByStandard[$standard['standard_id']] = [];
            }

            $stmt = $pdo->prepare("SELECT id, standard_id, title, description, asl_level
                FROM asl_learning_targets
                WHERE active = 1 AND (asl_level IS NULL OR asl_level = ?)
                ORDER BY standard_id, order_index, id");
            $stmt->execute([$aslLevel]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $target) {
                $sid = $target['standard_id'];
                if (!isset($targetsByStandard[$sid])) {
                    $targetsByStandard[$sid] = [];
                }
                $targetsByStandard[$sid][] = [
                    'id' => (int) $target['id'],
                    'standardId' => $sid,
                    'title' => $target['title'],
                    'description' => $target['description'],
                    'aslLevel' => $target['asl_level'] !== null ? (int) $target['asl_level'] : null,
                ];
            }
        } catch (PDOException $e) {
            error_log('ASL teacher standards fetch failed: ' . $e->getMessage());
        }

        foreach ($buckets as $bid => $bucket) {
            $buckets[$bid]['standards'] = $standardsByBucket[$bid] ?? [];
        }

        return [
            'aslLevel' => $aslLevel,
            'buckets' => array_values($buckets),
            'targetsByStandard' => $targetsByStandard,
        ];
    }
}

?>
