<?php
// TEMPORARY DEBUG SHIM — delete after diagnosing the VTT 500.
// Forces all PHP errors/warnings/notices to the browser so we can see what's
// actually fatal-ing inside the normal VTT bootstrap.

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

echo "<pre>STEP 1: about to require bootstrap.php\n";
require_once __DIR__ . '/bootstrap.php';
echo "STEP 2: bootstrap.php loaded OK\n";

$auth = getVttUserContext();
echo "STEP 3: auth context built: " . json_encode($auth) . "\n";

$sections = buildVttSections((bool) ($auth['isGM'] ?? false));
echo "STEP 4: sections built (" . count($sections) . " keys: " . implode(', ', array_keys($sections)) . ")\n";

$config = getVttBootstrapConfig($auth);
echo "STEP 5: config built (" . count($config) . " keys)\n";

echo "STEP 6: about to render layout — if you see this and then a 500, the fault is in layout.php / strix-nav.php\n";
echo "</pre>";

echo renderVttLayout($sections, $config);
