<?php
// Student self-registration is closed.
http_response_code(403);
header('Content-Type: text/plain; charset=utf-8');
echo 'Student registration is closed.';
