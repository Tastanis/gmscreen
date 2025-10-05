<?php
require_once __DIR__ . '/../vtt/token_repository.php';

$entries = [
    [
        'id' => 'token-1',
        'imageData' => 'data:image/png;base64,AAA',
        'libraryId' => 'lib-1',
        'name' => 'Example Token',
        'position' => [
            'x' => NAN,
            'y' => INF,
        ],
        'size' => [
            'width' => NAN,
            'height' => INF,
        ],
        'stamina' => 5,
    ],
];

$result = normalizeSceneTokenEntries($entries);

$allPassed = true;

if (count($result) !== 1) {
    fwrite(STDERR, "Expected one normalized token.\n");
    $allPassed = false;
} else {
    $token = $result[0];

    if ($token['position']['x'] !== 0.0) {
        fwrite(STDERR, sprintf("Expected finite X position, got %s.\n", var_export($token['position']['x'], true)));
        $allPassed = false;
    }

    if ($token['position']['y'] !== 0.0) {
        fwrite(STDERR, sprintf("Expected finite Y position, got %s.\n", var_export($token['position']['y'], true)));
        $allPassed = false;
    }

    if (!is_int($token['size']['width']) || $token['size']['width'] < 1) {
        fwrite(STDERR, sprintf("Width was not normalized to a positive integer: %s.\n", var_export($token['size']['width'], true)));
        $allPassed = false;
    }

    if (!is_int($token['size']['height']) || $token['size']['height'] < 1) {
        fwrite(STDERR, sprintf("Height was not normalized to a positive integer: %s.\n", var_export($token['size']['height'], true)));
        $allPassed = false;
    }

    if (json_encode($token) === false) {
        fwrite(STDERR, "json_encode failed for the normalized token.\n");
        $allPassed = false;
    }
}

if (!$allPassed) {
    exit(1);
}

echo "All token repository checks passed.\n";
