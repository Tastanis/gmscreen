<?php
declare(strict_types=1);
// Only for the page-start check (dnd/vtt/assets/js/ui/__tests__/pages-start.test.mjs).
//
// That check starts PHP's own command-line server on this machine with PAGE_START_CHECK=1 and this file as its
// router, and opens each page in a headless browser to see that it starts. A page needs somebody signed in; a
// request that names one (?__start_as=GM) is signed in as them here, and everything else is served as it is.
//
// Under a real web server this file answers nothing: it is not the command-line server, and the flag is not set.
if (PHP_SAPI !== 'cli-server' || getenv('PAGE_START_CHECK') !== '1') {
    http_response_code(404);
    exit;
}
ini_set('display_errors', '0');
$as = $_GET['__start_as'] ?? null;
if (is_string($as) && preg_match('/^[A-Za-z]{1,20}$/', $as) === 1) {
    session_start();
    $_SESSION['user'] = $as;
    $_SESSION['logged_in'] = true;
    session_write_close();
}
return false;
