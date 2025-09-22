<?php
require_once __DIR__ . '/../chat_handler.php';

$cases = [
    'chat_uploads/example.png' => 'chat_uploads/example.png',
    'https://example.com/image.png' => 'https://example.com/image.png',
    'javascript:alert(1)' => ''
];

$allPassed = true;
foreach ($cases as $input => $expected) {
    $result = sanitizeImageUrl($input);
    if ($result !== $expected) {
        fwrite(STDERR, sprintf("sanitizeImageUrl failed for input '%s'. Expected '%s', got '%s'\n", $input, $expected, $result));
        $allPassed = false;
    }
}

if (!$allPassed) {
    exit(1);
}

echo "All sanitizeImageUrl checks passed.\n";
