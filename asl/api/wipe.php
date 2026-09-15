<?php
/**
 * Retired web reset. Account migration is private and requires a reviewed backup.
 */
require_once dirname(__DIR__) . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') aslhub_json_error('POST required.', 405);
$me = aslhub_require_teacher($pdo, true);
if (!aslhub_is_admin($me)) aslhub_json_error('Admin (Harms) access required.', 403);
aslhub_require_csrf();
aslhub_json_error('Account reset requires the private migration script.', 410);
