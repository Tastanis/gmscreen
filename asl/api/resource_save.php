<?php
/** Teacher-only: add/update/delete a resource on a standard (optionally level-scoped). */
require_once dirname(__DIR__) . '/config.php';

$teacher = aslhub_require_teacher($pdo, true);
aslhub_require_csrf();

$action = $_POST['action'] ?? 'save';

try {
    if ($action === 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        $pdo->prepare("DELETE FROM asl_learning_target_resources WHERE id = ?")->execute([$id]);
        aslhub_json(['success' => true]);
    }

    $id = (int)($_POST['id'] ?? 0);
    $standardId = trim($_POST['standard_id'] ?? '');
    $level = ($_POST['asl_level'] ?? '') === '' ? null : (int)$_POST['asl_level'];
    $label = trim($_POST['resource_label'] ?? '');
    $url = trim($_POST['resource_url'] ?? '');
    $desc = trim($_POST['resource_description'] ?? '');
    $type = trim($_POST['resource_type'] ?? 'link');

    if ($label === '') aslhub_json_error('Resource needs a name.');
    $stmt = $pdo->prepare("SELECT standard_id FROM asl_standards WHERE standard_id = ? AND active = 1");
    $stmt->execute([$standardId]);
    if (!$stmt->fetch()) aslhub_json_error('Unknown standard.');
    if ($url !== '' && !preg_match('#^https?://#i', $url)) aslhub_json_error('Links must start with http:// or https://');

    if ($id) {
        $pdo->prepare("UPDATE asl_learning_target_resources
            SET standard_id = ?, asl_level = ?, resource_label = ?, resource_url = ?, resource_description = ?, resource_type = ?
            WHERE id = ?")
            ->execute([$standardId, $level, $label, $url ?: null, $desc ?: null, $type, $id]);
    } else {
        $stmt = $pdo->prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS o FROM asl_learning_target_resources WHERE standard_id = ?");
        $stmt->execute([$standardId]);
        $order = (int)$stmt->fetch()['o'];
        $pdo->prepare("INSERT INTO asl_learning_target_resources
            (learning_target_id, standard_id, asl_level, resource_type, resource_label, resource_url, resource_description, order_index)
            VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([$standardId, $level, $type, $label, $url ?: null, $desc ?: null, $order]);
        $id = (int)$pdo->lastInsertId();
    }
    aslhub_json(['success' => true, 'id' => $id]);
} catch (PDOException $e) {
    error_log('resource_save: ' . $e->getMessage());
    aslhub_json_error('Save failed.', 500);
}
