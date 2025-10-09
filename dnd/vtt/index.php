<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$auth = getVttUserContext();
if (!($auth['isLoggedIn'] ?? false)) {
    header('Location: ../index.php');
    exit;
}

$sections = buildVttSections((bool) ($auth['isGM'] ?? false));
$config = getVttBootstrapConfig($auth);

echo renderVttLayout($sections, $config);
