<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$sections = buildVttSections();
$config = getVttBootstrapConfig();

echo renderVttLayout($sections, $config);
