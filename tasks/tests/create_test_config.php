<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
if ($argc !== 3) {
    fwrite(STDERR, "Usage: php create_test_config.php CONFIG_PATH DATA_PATH\n");
    exit(2);
}
$body = "<?php\nreturn [\n"
    . "    'password_hash' => " . var_export(password_hash('TestOnlyPassword!', PASSWORD_DEFAULT), true) . ",\n"
    . "    'data_file' => " . var_export($argv[2], true) . ",\n"
    . "];\n";
if (file_put_contents($argv[1], $body) === false) {
    fwrite(STDERR, "Unable to create test configuration.\n");
    exit(1);
}
