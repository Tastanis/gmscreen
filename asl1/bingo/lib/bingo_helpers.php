<?php
/**
 * ASL1 Bingo helper utilities.
 *
 * This module consolidates Bingo-specific persistence rules so the API layer can
 * stay relatively small:
 *  - Teacher endpoints (wordlists.php, start-game.php, draw-word.php,
 *    teacher-state.php, resolve-claim.php, restart-game.php)
 *  - Student endpoints (student-state.php, update-card.php, request-bingo.php,
 *    claim-status.php)
 *  - Shared file storage (asl1/data/bingo_wordlists.json) that captures
 *    teacher-authored lists outside of the SQL schema.
 *
 * The helper also documents expectations for the JSON file store:
 *  - The JSON file always contains an array of objects, each object matching the
 *    structure returned by asl1_bingo_add_custom_list().
 *  - The file is created on-demand and writes are serialized with LOCK_EX so a
 *    teacher cannot accidentally clobber a colleague's list.
 *  - Custom list identifiers follow the "custom-<hex>" convention so the front
 *    end can mix them with "scroller:<id>" references in a single payload.
 */

if (!function_exists('asl1_bingo_data_dir')) {
    function asl1_bingo_data_dir(): string
    {
        $dir = __DIR__ . '/../../data';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return realpath($dir) ?: $dir;
    }
}

if (!function_exists('asl1_bingo_wordlist_store')) {
    function asl1_bingo_wordlist_store(): string
    {
        $path = asl1_bingo_data_dir() . '/bingo_wordlists.json';
        if (!file_exists($path)) {
            file_put_contents($path, json_encode([], JSON_PRETTY_PRINT), LOCK_EX);
        }
        return $path;
    }
}

if (!function_exists('asl1_bingo_load_custom_lists')) {
    function asl1_bingo_load_custom_lists(): array
    {
        $raw = @file_get_contents(asl1_bingo_wordlist_store());
        $decoded = json_decode($raw ?: '[]', true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('asl1_bingo_save_custom_lists')) {
    function asl1_bingo_save_custom_lists(array $lists): void
    {
        file_put_contents(
            asl1_bingo_wordlist_store(),
            json_encode(array_values($lists), JSON_PRETTY_PRINT),
            LOCK_EX
        );
    }
}

if (!function_exists('asl1_bingo_filter_words')) {
    function asl1_bingo_filter_words($words): array
    {
        if (is_string($words)) {
            $words = preg_split('/[\r\n,]+/', $words);
        }
        if (!is_array($words)) {
            return [];
        }

        $seen = [];
        $clean = [];
        foreach ($words as $word) {
            if (!is_string($word)) {
                continue;
            }
            $trimmed = trim($word);
            if ($trimmed === '') {
                continue;
            }
            $key = mb_strtolower($trimmed);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $clean[] = $trimmed;
        }

        return array_values($clean);
    }
}

if (!function_exists('asl1_bingo_add_custom_list')) {
    function asl1_bingo_add_custom_list(int $teacherId, string $name, $words): array
    {
        $lists = asl1_bingo_load_custom_lists();
        $filtered = asl1_bingo_filter_words($words);
        $entry = [
            'id' => 'custom-' . bin2hex(random_bytes(4)),
            'teacher_id' => $teacherId,
            'name' => $name,
            'words' => $filtered,
            'created_at' => date('c'),
        ];
        $lists[] = $entry;
        asl1_bingo_save_custom_lists($lists);
        return $entry;
    }
}

if (!function_exists('asl1_bingo_find_custom_list')) {
    function asl1_bingo_find_custom_list(string $id, int $teacherId): ?array
    {
        foreach (asl1_bingo_load_custom_lists() as $entry) {
            if (($entry['id'] ?? '') === $id && (int) ($entry['teacher_id'] ?? 0) === $teacherId) {
                return $entry;
            }
        }
        return null;
    }
}

if (!function_exists('asl1_bingo_fetch_wordlists')) {
    function asl1_bingo_fetch_wordlists(PDO $pdo, int $teacherId): array
    {
        $scrollerLists = [];
        $stmt = $pdo->prepare('SELECT id, name, words, asl_level, created_at FROM scroller_wordlists WHERE teacher_id = ? ORDER BY created_at DESC');
        $stmt->execute([$teacherId]);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $wordCandidates = json_decode($row['words'], true);
            if (!is_array($wordCandidates)) {
                $wordCandidates = preg_split('/[,\r\n]+/', (string) $row['words']);
            }
            $words = asl1_bingo_filter_words($wordCandidates);
            $scrollerLists[] = [
                'id' => 'scroller:' . $row['id'],
                'sourceId' => (int) $row['id'],
                'name' => $row['name'],
                'words' => $words,
                'aslLevel' => (int) ($row['asl_level'] ?? 1),
                'created_at' => $row['created_at'] ?? null,
            ];
        }

        $customLists = [];
        foreach (asl1_bingo_load_custom_lists() as $entry) {
            if ((int) ($entry['teacher_id'] ?? 0) !== $teacherId) {
                continue;
            }
            $customLists[] = [
                'id' => $entry['id'],
                'name' => $entry['name'] ?? 'Custom List',
                'words' => asl1_bingo_filter_words($entry['words'] ?? []),
                'created_at' => $entry['created_at'] ?? null,
            ];
        }

        return ['scroller' => $scrollerLists, 'custom' => $customLists];
    }
}

if (!function_exists('asl1_bingo_merge_word_sources')) {
    function asl1_bingo_merge_word_sources(PDO $pdo, int $teacherId, array $listRefs): array
    {
        $scrollerIds = [];
        $customIds = [];
        foreach ($listRefs as $ref) {
            if (!is_string($ref)) {
                continue;
            }
            if (strpos($ref, 'scroller:') === 0) {
                $scrollerIds[] = (int) substr($ref, 9);
            } elseif (strpos($ref, 'custom-') === 0) {
                $customIds[] = $ref;
            }
        }

        $wordPool = [];
        $activeLists = [];

        if ($scrollerIds) {
            $placeholders = implode(',', array_fill(0, count($scrollerIds), '?'));
            $sql = "SELECT id, name, words FROM scroller_wordlists WHERE teacher_id = ? AND id IN ($placeholders)";
            $params = array_merge([$teacherId], $scrollerIds);
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $words = json_decode($row['words'], true);
                if (!is_array($words)) {
                    $words = preg_split('/[,\r\n]+/', (string) $row['words']);
                }
                $filtered = asl1_bingo_filter_words($words);
                $wordPool = array_merge($wordPool, $filtered);
                $activeLists[] = [
                    'id' => 'scroller:' . $row['id'],
                    'name' => $row['name'],
                    'count' => count($filtered),
                ];
            }
        }

        if ($customIds) {
            foreach ($customIds as $customId) {
                $entry = asl1_bingo_find_custom_list($customId, $teacherId);
                if (!$entry) {
                    continue;
                }
                $filtered = asl1_bingo_filter_words($entry['words'] ?? []);
                $wordPool = array_merge($wordPool, $filtered);
                $activeLists[] = [
                    'id' => $entry['id'],
                    'name' => $entry['name'] ?? 'Custom List',
                    'count' => count($filtered),
                ];
            }
        }

        $uniquePool = [];
        $seen = [];
        foreach ($wordPool as $word) {
            $key = mb_strtolower($word);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $uniquePool[] = $word;
        }

        return [$uniquePool, $activeLists];
    }
}

if (!function_exists('asl1_bingo_close_active_sessions')) {
    function asl1_bingo_close_active_sessions(PDO $pdo, int $teacherId, int $aslLevel): void
    {
        $stmt = $pdo->prepare("UPDATE bingo_sessions SET status = 'closed', ended_at = NOW() WHERE teacher_id = ? AND asl_level = ? AND status IN ('ready','active','won')");
        $stmt->execute([$teacherId, $aslLevel]);
    }
}

if (!function_exists('asl1_bingo_create_session')) {
    function asl1_bingo_create_session(PDO $pdo, int $teacherId, int $aslLevel, array $activeLists, array $wordPool): array
    {
        asl1_bingo_close_active_sessions($pdo, $teacherId, $aslLevel);

        $shuffled = $wordPool;
        shuffle($shuffled);

        $stmt = $pdo->prepare('INSERT INTO bingo_sessions (teacher_id, asl_level, selected_word_source, word_pool, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'ready\', NOW(), NOW())');
        $stmt->execute([
            $teacherId,
            $aslLevel,
            json_encode($activeLists),
            json_encode(array_values($shuffled)),
        ]);

        $sessionId = (int) $pdo->lastInsertId();
        return asl1_bingo_get_teacher_session($pdo, $teacherId, $aslLevel, true, $sessionId);
    }
}

if (!function_exists('asl1_bingo_decode_json')) {
    function asl1_bingo_decode_json($value, $default = [])
    {
        if ($value === null || $value === '') {
            return $default;
        }
        $decoded = json_decode($value, true);
        return (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) ? $decoded : $default;
    }
}

if (!function_exists('asl1_bingo_get_teacher_session')) {
    function asl1_bingo_get_teacher_session(PDO $pdo, int $teacherId, int $aslLevel, bool $allowClosed = false, ?int $specificId = null): ?array
    {
        $clauses = ['teacher_id = ?', 'asl_level = ?'];
        $params = [$teacherId, $aslLevel];
        if (!$allowClosed) {
            $clauses[] = "status IN ('ready','active','won')";
        }
        if ($specificId !== null) {
            $clauses[] = 'id = ?';
            $params[] = $specificId;
        }
        $sql = 'SELECT * FROM bingo_sessions WHERE ' . implode(' AND ', $clauses) . ' ORDER BY id DESC LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $session = $stmt->fetch(PDO::FETCH_ASSOC);
        return $session ?: null;
    }
}

if (!function_exists('asl1_bingo_get_active_session_by_level')) {
    function asl1_bingo_get_active_session_by_level(PDO $pdo, int $aslLevel): ?array
    {
        $stmt = $pdo->prepare("SELECT * FROM bingo_sessions WHERE asl_level = ? AND status IN ('ready','active','won') ORDER BY id DESC LIMIT 1");
        $stmt->execute([$aslLevel]);
        $session = $stmt->fetch(PDO::FETCH_ASSOC);
        return $session ?: null;
    }
}

if (!function_exists('asl1_bingo_fetch_called_words')) {
    function asl1_bingo_fetch_called_words(PDO $pdo, int $sessionId): array
    {
        $stmt = $pdo->prepare('SELECT word FROM bingo_draws WHERE session_id = ? ORDER BY draw_order ASC');
        $stmt->execute([$sessionId]);
        return $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }
}
if (!function_exists('asl1_bingo_deterministic_card')) {
    function asl1_bingo_deterministic_card(array $wordPool, int $sessionId, int $userId): array
    {
        $seed = hash('sha256', $sessionId . ':' . $userId);
        $scored = [];
        foreach ($wordPool as $index => $word) {
            $score = hash('sha256', $seed . '|' . $index . '|' . mb_strtolower($word));
            $scored[] = ['word' => $word, 'score' => $score];
        }
        usort($scored, static function ($a, $b) {
            return strcmp($a['score'], $b['score']);
        });
        $sorted = array_column($scored, 'word');
        $card = array_slice($sorted, 0, 25);
        while (count($card) < 25) {
            $card[] = 'Word ' . (count($card) + 1);
        }
        return $card;
    }
}

if (!function_exists('asl1_bingo_get_or_create_card')) {
    function asl1_bingo_get_or_create_card(PDO $pdo, array $session, int $userId): array
    {
        $sessionId = (int) $session['id'];
        $wordPool = asl1_bingo_decode_json($session['word_pool'], []);

        $stmt = $pdo->prepare('SELECT * FROM bingo_cards WHERE session_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$sessionId, $userId]);
        $card = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($card) {
            $cardWords = asl1_bingo_decode_json($card['card_words'], []);
            if (count($cardWords) !== 25) {
                $cardWords = asl1_bingo_deterministic_card($wordPool, $sessionId, $userId);
            }
            $marks = asl1_bingo_decode_json($card['marks'], []);
            return [
                'id' => (int) $card['id'],
                'card_words' => $cardWords,
                'marks' => array_values($marks),
            ];
        }

        $cardWords = asl1_bingo_deterministic_card($wordPool, $sessionId, $userId);
        $stmt = $pdo->prepare('INSERT INTO bingo_cards (session_id, user_id, card_words, marks, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())');
        $stmt->execute([$sessionId, $userId, json_encode($cardWords), json_encode([])]);
        $cardId = (int) $pdo->lastInsertId();

        return ['id' => $cardId, 'card_words' => $cardWords, 'marks' => []];
    }
}

if (!function_exists('asl1_bingo_save_card_marks')) {
    function asl1_bingo_save_card_marks(PDO $pdo, int $cardId, array $marks): void
    {
        $stmt = $pdo->prepare('UPDATE bingo_cards SET marks = ?, updated_at = NOW() WHERE id = ?');
        $stmt->execute([json_encode(array_values($marks)), $cardId]);
    }
}

if (!function_exists('asl1_bingo_sanitize_marks')) {
    function asl1_bingo_sanitize_marks($marks): array
    {
        if (!is_array($marks)) {
            return [];
        }
        $clean = [];
        foreach ($marks as $mark) {
            if (is_numeric($mark)) {
                $index = (int) $mark;
                if ($index >= 0 && $index < 25) {
                    $clean[$index] = true;
                }
            }
        }
        return array_keys($clean);
    }
}

if (!function_exists('asl1_bingo_has_pattern')) {
    function asl1_bingo_has_pattern(array $marks): bool
    {
        if (count($marks) < 5) {
            return false;
        }
        $set = array_fill(0, 25, false);
        foreach ($marks as $mark) {
            $set[$mark] = true;
        }
        for ($row = 0; $row < 5; $row++) {
            $complete = true;
            for ($col = 0; $col < 5; $col++) {
                if (!$set[$row * 5 + $col]) {
                    $complete = false;
                    break;
                }
            }
            if ($complete) {
                return true;
            }
        }
        for ($col = 0; $col < 5; $col++) {
            $complete = true;
            for ($row = 0; $row < 5; $row++) {
                if (!$set[$row * 5 + $col]) {
                    $complete = false;
                    break;
                }
            }
            if ($complete) {
                return true;
            }
        }
        $diag1 = true;
        $diag2 = true;
        for ($i = 0; $i < 5; $i++) {
            if (!$set[$i * 6]) {
                $diag1 = false;
            }
            if (!$set[4 + $i * 4]) {
                $diag2 = false;
            }
        }
        return $diag1 || $diag2;
    }
}

if (!function_exists('asl1_bingo_evaluate_claim')) {
    function asl1_bingo_evaluate_claim(array $cardWords, array $marks, array $calledWords): array
    {
        $calledSet = [];
        foreach ($calledWords as $word) {
            $calledSet[mb_strtolower($word)] = true;
        }
        $matched = [];
        $unmatched = [];
        foreach ($marks as $mark) {
            $word = $cardWords[$mark] ?? null;
            if (!$word) {
                continue;
            }
            $key = mb_strtolower($word);
            if (isset($calledSet[$key])) {
                $matched[] = $word;
            } else {
                $unmatched[] = $word;
            }
        }
        return [
            'matchedWords' => $matched,
            'unmatchedWords' => $unmatched,
        ];
    }
}

if (!function_exists('asl1_bingo_record_claim')) {
    function asl1_bingo_record_claim(PDO $pdo, array $session, int $userId, array $card, array $marks, array $calledWords, string $studentName): array
    {
        $sessionId = (int) $session['id'];
        $evaluation = asl1_bingo_evaluate_claim($card, $marks, $calledWords);
        $stmt = $pdo->prepare('INSERT INTO bingo_claims (session_id, user_id, student_name, card_snapshot, marks_snapshot, evaluation_payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, \'pending\', NOW(), NOW())');
        $stmt->execute([
            $sessionId,
            $userId,
            $studentName,
            json_encode($card),
            json_encode($marks),
            json_encode($evaluation),
        ]);
        $claimId = (int) $pdo->lastInsertId();
        return ['id' => $claimId, 'evaluation' => $evaluation];
    }
}

if (!function_exists('asl1_bingo_format_session_payload')) {
    function asl1_bingo_format_session_payload(array $session, array $calledWords, array $claims = []): array
    {
        $wordPool = asl1_bingo_decode_json($session['word_pool'], []);
        $remaining = max(0, count($wordPool) - count($calledWords));
        return [
            'status' => $session['status'],
            'sessionId' => (string) $session['id'],
            'activeLists' => asl1_bingo_decode_json($session['selected_word_source'], []),
            'calledWords' => $calledWords,
            'lastDrawnWord' => $session['last_drawn_word'] ?? null,
            'remainingCount' => $remaining,
            'totalWords' => count($wordPool),
            'claims' => $claims,
            'startedAt' => $session['created_at'] ? strtotime($session['created_at']) : null,
            'wordPool' => $wordPool,
        ];
    }
}
