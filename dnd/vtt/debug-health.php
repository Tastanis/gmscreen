<?php
declare(strict_types=1);

$expectedKey = 'vtt-health-20260523';
if (($_GET['key'] ?? '') !== $expectedKey) {
    http_response_code(404);
    echo 'Not found';
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', '1');
ini_set('log_errors', '1');

$stage = 'starting';

register_shutdown_function(static function () use (&$stage): void {
    $error = error_get_last();
    if ($error === null) {
        return;
    }

    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array((int) ($error['type'] ?? 0), $fatalTypes, true)) {
        return;
    }

    echo "\nFATAL DURING: {$stage}\n";
    echo 'TYPE: ' . ($error['type'] ?? '') . "\n";
    echo 'MESSAGE: ' . ($error['message'] ?? '') . "\n";
    echo 'FILE: ' . ($error['file'] ?? '') . "\n";
    echo 'LINE: ' . ($error['line'] ?? '') . "\n";
});

function debugHealthLine(string $message): void
{
    echo $message . "\n";
    flush();
}

function debugHealthStep(string $label, callable $callback): void
{
    global $stage;
    $stage = $label;
    debugHealthLine("STEP: {$label}");
    $callback();
    debugHealthLine("OK: {$label}");
}

debugHealthLine('VTT health check');
debugHealthLine('PHP: ' . PHP_VERSION);
debugHealthLine('DIR: ' . __DIR__);

debugHealthStep('file checks', static function (): void {
    $files = [
        'bootstrap.php',
        'config/routes.php',
        'components/ChatPanel.php',
        'components/CharacterSummaryPanel.php',
        'components/SettingsPanel.php',
        'components/SceneBoard.php',
        'components/TokenLibrary.php',
        '../includes/strix-nav.php',
    ];

    foreach ($files as $file) {
        $path = __DIR__ . '/' . $file;
        debugHealthLine((is_file($path) ? 'exists ' : 'missing ') . $file);
    }
});

debugHealthStep('require bootstrap', static function (): void {
    require_once __DIR__ . '/bootstrap.php';
});

debugHealthStep('user context', static function (): void {
    $auth = getVttUserContext();
    debugHealthLine('logged_in=' . (!empty($auth['isLoggedIn']) ? 'yes' : 'no'));
    debugHealthLine('is_gm=' . (!empty($auth['isGM']) ? 'yes' : 'no'));
});

debugHealthStep('bootstrap config', static function (): void {
    $auth = getVttUserContext();
    $config = getVttBootstrapConfig($auth);
    debugHealthLine('config keys=' . count($config));
});

debugHealthStep('sections', static function (): void {
    $auth = getVttUserContext();
    $sections = buildVttSections((bool) ($auth['isGM'] ?? false));
    debugHealthLine('section keys=' . implode(',', array_keys($sections)));
});

debugHealthStep('render layout', static function (): void {
    $auth = getVttUserContext();
    $sections = buildVttSections((bool) ($auth['isGM'] ?? false));
    $config = getVttBootstrapConfig($auth);
    $html = renderVttLayout($sections, $config);
    debugHealthLine('html bytes=' . strlen($html));
});

$stage = 'complete';
debugHealthLine('DONE');
