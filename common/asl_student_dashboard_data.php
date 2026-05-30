<?php

if (!function_exists('aslhubStudentDashboardSeedBuckets')) {
    function aslhubStudentDashboardSeedBuckets(): array
    {
        return [
            [
                'id' => '21C',
                'code' => '21C',
                'name' => '21st Century Skills',
                'blurb' => 'Students build collaboration, learning, and work habits that support success in and beyond the ASL classroom.',
                'standards' => [
                    ['id' => '21C.1', 'name' => 'Collaboration', 'description' => 'Students work effectively with peers and contribute to shared goals.'],
                    ['id' => '21C.2', 'name' => 'Learning Skills and Teachability', 'description' => 'Students apply feedback, reflect, and take ownership of their learning.'],
                    ['id' => '21C.3', 'name' => 'Work Ethic', 'description' => 'Students show effort, responsibility, and consistency in their work.'],
                ],
            ],
            [
                'id' => 'CLF',
                'code' => 'CLF',
                'name' => 'Classifiers',
                'blurb' => 'Students identify, select, and combine classifiers to represent people, objects, and perspective.',
                'standards' => [
                    ['id' => 'CLF.1', 'name' => 'Appropriate Use of Classifiers', 'description' => 'Students choose and use classifiers appropriately for the context.'],
                    ['id' => 'CLF.2', 'name' => 'Classifier Identification', 'description' => 'Students recognize and identify classifiers in signed input.'],
                    ['id' => 'CLF.3', 'name' => 'Pairing/Blending Signs & Classifiers', 'description' => 'Students combine lexical signs and classifiers to convey meaning.'],
                    ['id' => 'CLF.4', 'name' => 'Showing Perspective', 'description' => 'Students use classifiers to show point of view and spatial perspective.'],
                ],
            ],
            [
                'id' => 'CUL',
                'code' => 'CUL',
                'name' => 'Culture & History',
                'blurb' => 'Students explore Deaf culture, history, media, and connections between languages and cultures.',
                'standards' => [
                    ['id' => 'CUL.1', 'name' => 'Cultural Norms', 'description' => 'Students understand and follow Deaf cultural norms.'],
                    ['id' => 'CUL.2', 'name' => 'Deaf Media', 'description' => 'Students engage with Deaf media and Deaf-created content.'],
                    ['id' => 'CUL.3', 'name' => 'History', 'description' => 'Students understand key people, events, and issues in Deaf history.'],
                    ['id' => 'CUL.4', 'name' => 'Language & Cultural Comparisons', 'description' => 'Students compare ASL and Deaf culture with other languages and cultures.'],
                ],
            ],
            [
                'id' => 'EXP',
                'code' => 'EXP',
                'name' => 'Expression',
                'blurb' => 'Students produce clear, accurate ASL using correct parameters, grammar, vocabulary, and fluency.',
                'standards' => [
                    ['id' => 'EXP.1', 'name' => '5 Parameters', 'description' => 'Students produce signs with accurate handshape, location, movement, palm orientation, and non-manual markers.'],
                    ['id' => 'EXP.2', 'name' => 'ASL Grammar', 'description' => 'Students use ASL grammar rather than English word order.'],
                    ['id' => 'EXP.3', 'name' => 'Clarity/Pacing/Fluency', 'description' => 'Students sign with visual clarity, appropriate pacing, and increasing fluency.'],
                    ['id' => 'EXP.4', 'name' => 'Vocabulary', 'description' => 'Students use appropriate vocabulary to express ideas.'],
                ],
            ],
            [
                'id' => 'INT',
                'code' => 'INT',
                'name' => 'Interactive Communication',
                'blurb' => 'Students participate in back-and-forth signed communication and stay in the target language.',
                'standards' => [
                    ['id' => 'INT.1', 'name' => 'Clarification and Repair', 'description' => 'Students use clarification, repair, and negotiation strategies.'],
                    ['id' => 'INT.2', 'name' => 'Communication Norms', 'description' => 'Students follow visual communication norms during interaction.'],
                    ['id' => 'INT.3', 'name' => 'Initiating and Maintaining Interaction', 'description' => 'Students initiate, maintain, and close signed interactions.'],
                    ['id' => 'INT.4', 'name' => 'Staying in Target Language', 'description' => 'Students communicate in ASL without defaulting to spoken English.'],
                ],
            ],
            [
                'id' => 'NMM',
                'code' => 'NMM',
                'name' => 'NonManual Markers',
                'blurb' => 'Students use the face, head, body, eyes, and mouth as part of ASL grammar and meaning.',
                'standards' => [
                    ['id' => 'NMM.1', 'name' => 'Grammatical NMM', 'description' => 'Students use grammatical non-manual markers for sentence types and structures.'],
                    ['id' => 'NMM.2', 'name' => 'Head/Face/Body/Eye Gaze', 'description' => 'Students use facial expression, head movement, body posture, and eye gaze to mark meaning.'],
                    ['id' => 'NMM.3', 'name' => 'Mouth Morphemes', 'description' => 'Students use and interpret mouth morphemes and mouth gestures.'],
                ],
            ],
            [
                'id' => 'REC',
                'code' => 'REC',
                'name' => 'Reception',
                'blurb' => 'Students understand signed language, including directions, grammar, vocabulary, and context.',
                'standards' => [
                    ['id' => 'REC.1', 'name' => 'Classroom Directions', 'description' => 'Students understand signed classroom language, directions, and routines.'],
                    ['id' => 'REC.2', 'name' => 'Contextual Understanding', 'description' => 'Students understand meaning from context in signed communication.'],
                    ['id' => 'REC.3', 'name' => 'Grammar', 'description' => 'Students recognize how ASL grammar creates meaning in signed input.'],
                    ['id' => 'REC.4', 'name' => 'Vocabulary & Fingerspelling & NMM', 'description' => 'Students comprehend vocabulary, fingerspelling, and non-manual markers.'],
                ],
            ],
            [
                'id' => 'SPG',
                'code' => 'SPG',
                'name' => 'Spacial Grammar',
                'blurb' => 'Students use signing space to organize referents, relationships, sequence, and movement.',
                'standards' => [
                    ['id' => 'SPG.1', 'name' => 'Agreement & Directionality', 'description' => 'Students use agreement and directional verbs accurately.'],
                    ['id' => 'SPG.2', 'name' => 'Comparing & Sequencing', 'description' => 'Students use space to compare, contrast, and sequence information.'],
                    ['id' => 'SPG.3', 'name' => 'Indexing', 'description' => 'Students use indexing to point to and reference established locations.'],
                    ['id' => 'SPG.4', 'name' => 'Location, Movement & Relationships', 'description' => 'Students use space to show location, movement, and relationships.'],
                    ['id' => 'SPG.5', 'name' => 'Referencing', 'description' => 'Students establish and maintain referents in signing space.'],
                    ['id' => 'SPG.6', 'name' => 'Spacial Organization', 'description' => 'Students organize information clearly within signing space.'],
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

            $pdo->exec("CREATE TABLE IF NOT EXISTS asl_student_meetings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                meeting_date DATE NOT NULL,
                absences INT NOT NULL DEFAULT 0,
                participation_pct DECIMAL(5,2) NULL,
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_asl_meetings_user_date (user_id, meeting_date),
                INDEX idx_asl_meetings_date (meeting_date)
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
            $validBucketIds = array_column(aslhubStudentDashboardSeedBuckets(), 'id');

            $existingBuckets = $pdo->query("SELECT bucket_id FROM asl_skill_buckets")->fetchAll(PDO::FETCH_COLUMN);
            $hasStaleTaxonomy = false;
            foreach ($existingBuckets as $existingBucketId) {
                if (!in_array($existingBucketId, $validBucketIds, true)) {
                    $hasStaleTaxonomy = true;
                    break;
                }
            }

            // A bucket left over from a previous taxonomy means the standards have been
            // reorganized. Clear the taxonomy and all attached learning-target data so the
            // new buckets/standards seed cleanly with no orphaned or mismatched records.
            if ($hasStaleTaxonomy) {
                $pdo->exec("DELETE FROM asl_learning_target_resources");
                $pdo->exec("DELETE FROM user_learning_target_score_history");
                $pdo->exec("DELETE FROM user_learning_targets");
                $pdo->exec("DELETE FROM asl_learning_targets");
                $pdo->exec("DELETE FROM asl_standards");
                $pdo->exec("DELETE FROM asl_skill_buckets");
            }
        } catch (PDOException $e) {
            error_log('ASL taxonomy reset check failed: ' . $e->getMessage());
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

if (!function_exists('aslhubStudentMeetingBucketLabel')) {
    function aslhubStudentMeetingBucketLabel(DateTimeImmutable $start, int $bucketIndex): array
    {
        $bucketStart = $start->modify('+' . ($bucketIndex * 14) . ' days');
        $bucketEnd = $bucketStart->modify('+13 days');
        return [
            'index' => $bucketIndex,
            'periodStart' => $bucketStart->format('Y-m-d'),
            'periodEnd' => $bucketEnd->format('Y-m-d'),
            'label' => $bucketStart->format('M j'),
        ];
    }
}

if (!function_exists('aslhubStudentDashboardMeetings')) {
    function aslhubStudentDashboardMeetings(PDO $pdo, int $userId): array
    {
        $start = aslhubStudentDashboardCourseStart();
        $now = new DateTimeImmutable('now');
        $daysSinceStart = max(0, (int) $start->diff($now)->format('%r%a'));
        $currentBucket = (int) floor($daysSinceStart / 14);

        $studentEntries = [];
        $classByBucket = [];
        $bucketsWithData = [];

        try {
            $stmt = $pdo->prepare("SELECT id, meeting_date, absences, participation_pct, notes
                FROM asl_student_meetings
                WHERE user_id = ?
                ORDER BY meeting_date DESC, id DESC");
            $stmt->execute([$userId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                try {
                    $mDate = new DateTimeImmutable($row['meeting_date']);
                } catch (Exception $e) {
                    continue;
                }
                $days = (int) $start->diff($mDate)->format('%r%a');
                $bucketIndex = $days >= 0 ? (int) floor($days / 14) : 0;
                $studentEntries[] = [
                    'id' => (int) $row['id'],
                    'date' => $row['meeting_date'],
                    'absences' => (int) $row['absences'],
                    'participation_pct' => $row['participation_pct'] !== null ? (float) $row['participation_pct'] : null,
                    'notes' => $row['notes'] ?? '',
                    'bucketIndex' => $bucketIndex,
                ];
                $bucketsWithData[$bucketIndex] = true;
            }

            $stmt = $pdo->query("SELECT m.meeting_date, m.absences, m.participation_pct
                FROM asl_student_meetings m
                INNER JOIN users u ON u.id = m.user_id
                WHERE u.is_teacher = FALSE");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                try {
                    $mDate = new DateTimeImmutable($row['meeting_date']);
                } catch (Exception $e) {
                    continue;
                }
                $days = (int) $start->diff($mDate)->format('%r%a');
                $bucketIndex = $days >= 0 ? (int) floor($days / 14) : 0;
                if (!isset($classByBucket[$bucketIndex])) {
                    $classByBucket[$bucketIndex] = ['abs_sum' => 0, 'abs_n' => 0, 'pct_sum' => 0.0, 'pct_n' => 0];
                }
                $classByBucket[$bucketIndex]['abs_sum'] += (int) $row['absences'];
                $classByBucket[$bucketIndex]['abs_n'] += 1;
                if ($row['participation_pct'] !== null) {
                    $classByBucket[$bucketIndex]['pct_sum'] += (float) $row['participation_pct'];
                    $classByBucket[$bucketIndex]['pct_n'] += 1;
                }
                $bucketsWithData[$bucketIndex] = true;
            }
        } catch (PDOException $e) {
            error_log('ASL meetings fetch failed: ' . $e->getMessage());
        }

        $maxBucket = max($currentBucket, $bucketsWithData ? max(array_keys($bucketsWithData)) : 0);
        $buckets = [];
        $studentByBucket = [];
        foreach ($studentEntries as $entry) {
            if (!isset($studentByBucket[$entry['bucketIndex']])) {
                $studentByBucket[$entry['bucketIndex']] = $entry;
            }
        }

        for ($i = 0; $i <= $maxBucket; $i++) {
            $info = aslhubStudentMeetingBucketLabel($start, $i);
            $studentEntry = $studentByBucket[$i] ?? null;
            $classBucket = $classByBucket[$i] ?? null;
            $buckets[] = [
                'index' => $i,
                'label' => $info['label'],
                'periodStart' => $info['periodStart'],
                'periodEnd' => $info['periodEnd'],
                'student' => $studentEntry ? [
                    'absences' => $studentEntry['absences'],
                    'participation_pct' => $studentEntry['participation_pct'],
                    'date' => $studentEntry['date'],
                ] : null,
                'class' => $classBucket && $classBucket['abs_n'] > 0 ? [
                    'avgAbsences' => round($classBucket['abs_sum'] / $classBucket['abs_n'], 2),
                    'avgParticipation' => $classBucket['pct_n'] > 0 ? round($classBucket['pct_sum'] / $classBucket['pct_n'], 2) : null,
                    'sampleSize' => $classBucket['abs_n'],
                ] : null,
            ];
        }

        $latestStudent = $studentEntries[0] ?? null;
        $latestClass = null;
        if ($latestStudent) {
            $bi = $latestStudent['bucketIndex'];
            if (isset($classByBucket[$bi]) && $classByBucket[$bi]['abs_n'] > 0) {
                $latestClass = [
                    'avgAbsences' => round($classByBucket[$bi]['abs_sum'] / $classByBucket[$bi]['abs_n'], 2),
                    'avgParticipation' => $classByBucket[$bi]['pct_n'] > 0 ? round($classByBucket[$bi]['pct_sum'] / $classByBucket[$bi]['pct_n'], 2) : null,
                ];
            }
        }

        return [
            'buckets' => $buckets,
            'currentBucketIndex' => $currentBucket,
            'studentEntries' => $studentEntries,
            'latest' => [
                'student' => $latestStudent ? [
                    'date' => $latestStudent['date'],
                    'absences' => $latestStudent['absences'],
                    'participation_pct' => $latestStudent['participation_pct'],
                ] : null,
                'class' => $latestClass,
            ],
        ];
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
            'meetings' => aslhubStudentDashboardMeetings($pdo, $userId),
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
