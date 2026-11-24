<?php
// Keep bookmarked links to the retired dashboard working.
if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'HEAD') {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
header('Location: /dnd/table/');
exit;
