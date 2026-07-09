<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/scroller.php';

$me = aslhub_require_login($pdo, true);
try {
    aslhub_scroller_ensure_schema($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $manage = ($_GET['manage'] ?? '') === '1';
        if ($manage && empty($me['is_teacher'])) aslhub_json_error('Teacher access required.', 403);
        $requestedLevel = isset($_GET['level']) ? (int)$_GET['level'] : 0;
        if (!empty($me['is_teacher'])) {
            $level = in_array($requestedLevel, [1, 2, 3], true) ? $requestedLevel : 0;
        } else {
            $level = (int)($me['level'] ?? 0);
            if (!in_array($level, [1, 2, 3], true)) aslhub_json_error('Your ASL level is not set.', 400);
        }

        $params = [];
        $where = ['w.active = ' . ($manage ? 'w.active' : '1')];
        if (!$manage) $where[] = 'w.enabled = 1';
        if (!empty($me['is_teacher'])) {
            if (!aslhub_is_admin($me)) { $where[] = 'w.teacher_id = ?'; $params[] = (int)$me['id']; }
        } else {
            $where[] = 'owner.teacher = ?'; $params[] = (string)($me['teacher'] ?? '');
        }
        if ($level) { $where[] = 'EXISTS (SELECT 1 FROM asl_scroller_wordlist_levels fl WHERE fl.wordlist_id = w.id AND fl.asl_level = ?)'; $params[] = $level; }

        $sql = "SELECT w.*, owner.first_name AS owner_first_name, owner.last_name AS owner_last_name
            FROM asl_scroller_wordlists w JOIN users owner ON owner.id = w.teacher_id
            WHERE " . implode(' AND ', $where) . " ORDER BY w.active DESC, w.name, w.id";
        $stmt = $pdo->prepare($sql); $stmt->execute($params); $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['id'] = (int)$row['id'];
            $decoded = json_decode((string)$row['words'], true);
            $row['words'] = is_array($decoded) ? array_values($decoded) : [];
            $row['speed'] = (float)$row['speed_setting'];
            $row['word_count'] = (int)$row['word_count'];
            $row['enabled'] = (bool)$row['enabled'];
            $row['active'] = (bool)$row['active'];
            $row['levels'] = aslhub_scroller_levels($pdo, (int)$row['id']);
            unset($row['speed_setting']);
        }
        aslhub_json(['success' => true, 'wordlists' => $rows]);
    }

    $teacher = aslhub_require_teacher($pdo, true);
    aslhub_require_csrf();
    $action = (string)($_POST['action'] ?? 'save');
    $id = (int)($_POST['id'] ?? 0);

    if (in_array($action, ['archive', 'restore'], true)) {
        if ($id < 1) aslhub_json_error('Unknown word bank.');
        $sql = 'UPDATE asl_scroller_wordlists SET active = ? WHERE id = ?';
        $params = [$action === 'restore' ? 1 : 0, $id];
        if (!aslhub_is_admin($teacher)) { $sql .= ' AND teacher_id = ?'; $params[] = (int)$teacher['id']; }
        $stmt = $pdo->prepare($sql); $stmt->execute($params);
        if (!$stmt->rowCount()) aslhub_json_error('Word bank not found or not editable.', 404);
        aslhub_json(['success' => true]);
    }
    if ($action !== 'save') aslhub_json_error('Unknown action.');

    $name = trim((string)($_POST['name'] ?? ''));
    $words = aslhub_scroller_parse_words((string)($_POST['words'] ?? ''));
    $speed = filter_var($_POST['speed'] ?? null, FILTER_VALIDATE_FLOAT);
    $count = filter_var($_POST['word_count'] ?? null, FILTER_VALIDATE_INT);
    $levels = array_values(array_unique(array_map('intval', $_POST['levels'] ?? [])));
    $levels = array_values(array_intersect($levels, [1, 2, 3]));
    $enabled = !empty($_POST['enabled']) ? 1 : 0;
    if ($name === '' || aslhub_scroller_strlen($name) > 120) aslhub_json_error('Name must be between 1 and 120 characters.');
    if (count($words) < 1 || count($words) > 1000) aslhub_json_error('Enter between 1 and 1,000 unique words.');
    if ($speed === false || $speed < .5 || $speed > 2.0) aslhub_json_error('Speed must be between 0.5 and 2.0.');
    if ($count === false || $count < 5 || $count > 50) aslhub_json_error('Word count must be between 5 and 50.');
    if (!$levels) aslhub_json_error('Choose at least one ASL level.');

    $pdo->beginTransaction();
    if ($id) {
        $checkSql = 'SELECT id FROM asl_scroller_wordlists WHERE id=? AND active=1';
        $checkParams = [$id];
        if (!aslhub_is_admin($teacher)) { $checkSql .= ' AND teacher_id=?'; $checkParams[] = (int)$teacher['id']; }
        $check = $pdo->prepare($checkSql); $check->execute($checkParams);
        if (!$check->fetch()) { $pdo->rollBack(); aslhub_json_error('Word bank not found or not editable.', 404); }
        $sql = 'UPDATE asl_scroller_wordlists SET name=?, words=?, speed_setting=?, word_count=?, enabled=? WHERE id=? AND active=1';
        $params = [$name, json_encode($words, JSON_UNESCAPED_UNICODE), $speed, $count, $enabled, $id];
        if (!aslhub_is_admin($teacher)) { $sql .= ' AND teacher_id=?'; $params[] = (int)$teacher['id']; }
        $stmt = $pdo->prepare($sql); $stmt->execute($params);
    } else {
        $stmt = $pdo->prepare('INSERT INTO asl_scroller_wordlists (teacher_id,name,words,speed_setting,word_count,enabled) VALUES (?,?,?,?,?,?)');
        $stmt->execute([(int)$teacher['id'], $name, json_encode($words, JSON_UNESCAPED_UNICODE), $speed, $count, $enabled]);
        $id = (int)$pdo->lastInsertId();
    }
    $pdo->prepare('DELETE FROM asl_scroller_wordlist_levels WHERE wordlist_id=?')->execute([$id]);
    $add = $pdo->prepare('INSERT INTO asl_scroller_wordlist_levels (wordlist_id,asl_level) VALUES (?,?)');
    foreach ($levels as $level) $add->execute([$id, $level]);
    $pdo->commit();
    aslhub_json(['success' => true, 'id' => $id, 'word_count' => count($words)]);
} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('ASL scroller API: ' . $e->getMessage());
    aslhub_json_error('The word bank could not be loaded or saved.', 500);
}
