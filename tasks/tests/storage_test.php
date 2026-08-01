<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__, 2);
$temporary = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'my-tasks-storage-' . bin2hex(random_bytes(5));
if (!mkdir($temporary, 0700, true) && !is_dir($temporary)) {
    throw new RuntimeException('Could not create temporary directory.');
}
$configFile = $temporary . DIRECTORY_SEPARATOR . 'config.php';
$dataFile = $temporary . DIRECTORY_SEPARATOR . 'tasks.json';
$configBody = "<?php\nreturn ['password_hash' => " . var_export(password_hash('TestOnlyPassword!', PASSWORD_DEFAULT), true) . ", 'data_file' => " . var_export($dataFile, true) . "];\n";
file_put_contents($configFile, $configBody);
putenv('TASKS_CONFIG_FILE=' . $configFile);
$_SERVER['DOCUMENT_ROOT'] = $root;

require_once dirname(__DIR__) . '/lib/storage.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException('FAILED: ' . $message);
    }
}

try {
    check(taskAppIsConfigured(), 'private configuration is recognized');
    $initial = taskAppReadDocument();
    check($initial['revision'] === 0, 'missing file starts at revision zero');
    $first = taskAppWriteDocument(0, $initial['data']);
    check(!$first['conflict'] && $first['document']['revision'] === 1, 'first save advances revision');

    $changed = $first['document']['data'];
    $changed['tasks'][] = [
        'id' => 'task-test', 'listId' => 'inbox', 'title' => 'Round trip', 'notes' => 'café',
        'completed' => false, 'createdAt' => gmdate('c'), 'updatedAt' => gmdate('c'), 'completedAt' => null,
    ];
    $second = taskAppWriteDocument(1, $changed);
    check(!$second['conflict'] && $second['document']['revision'] === 2, 'second save advances revision');
    check(taskAppReadDocument()['data']['tasks'][0]['notes'] === 'café', 'Unicode data round trips');

    $conflict = taskAppWriteDocument(0, $initial['data']);
    check($conflict['conflict'] && $conflict['document']['revision'] === 2, 'stale save returns current revision');

    $invalid = $changed;
    $invalid['tasks'][0]['notes'] = str_repeat('x', 2001);
    try {
        taskAppValidateData($invalid);
        check(false, 'oversized note should fail');
    } catch (InvalidArgumentException) {
        check(true, 'oversized note rejected');
    }
    check(is_file($dataFile . '.bak'), 'previous document backup exists');
    echo "TASK STORAGE TEST PASSED\n";
} finally {
    foreach (glob($temporary . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
        if (is_file($file)) { unlink($file); }
    }
    rmdir($temporary);
}
