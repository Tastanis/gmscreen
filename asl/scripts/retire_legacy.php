<?php
/** Deployment-only retirement. Archives outside web root; never edits database or DND. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = realpath($argv[1] ?? '');
if (!$root || basename($root) !== 'public_html' || !is_file($root.'/asl/goals/index.php') || !is_file($root.'/asl/scroller/index.php')) {
    fwrite(STDERR, "Refusing retirement: expected deployed ASL application in public_html.\n"); exit(1);
}
$rules = file_get_contents($root.'/.htaccess');
if (strpos($rules, 'asl/index.php [END]') === false) { fwrite(STDERR,"Root routing must be installed first.\n"); exit(1); }
$archive = dirname($root).'/asl-retired-'.date('Ymd-His').'-'.bin2hex(random_bytes(3));
foreach (['asl1','asl2','index.html'] as $name) {
    $source = $root.'/'.$name;
    if (!file_exists($source)) continue;
    if (is_link($source) || dirname(realpath($source)) !== $root) { fwrite(STDERR,"Unexpected legacy path.\n"); exit(1); }
    if (!is_dir($archive) && !mkdir($archive,0700)) throw new RuntimeException('Cannot create archive.');
    if (!rename($source,$archive.'/'.$name)) throw new RuntimeException('Cannot archive '.$name);
    echo 'Archived '.$name." outside the web root.\n";
}
