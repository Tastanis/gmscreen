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

    $sceneSummary = summarizeSceneTokensForChangeLog([$token]);
    if (count($sceneSummary) !== 1) {
        fwrite(STDERR, "Scene token change summary should contain one entry.\n");
        $allPassed = false;
    } else {
        $summaryToken = $sceneSummary[0];
        if (isset($summaryToken['imageData'])) {
            fwrite(STDERR, "Scene token change summary must not include raw image data.\n");
            $allPassed = false;
        }
        if (empty($summaryToken['hasImage'])) {
            fwrite(STDERR, "Scene token change summary lost the hasImage flag.\n");
            $allPassed = false;
        }
        if (!isset($summaryToken['imageHash']) || !is_string($summaryToken['imageHash']) || strlen($summaryToken['imageHash']) < 8) {
            fwrite(STDERR, "Scene token change summary is missing the image hash identifier.\n");
            $allPassed = false;
        }
        if (json_encode($sceneSummary) === false) {
            fwrite(STDERR, "json_encode failed for the scene token summary.\n");
            $allPassed = false;
        }
    }
}

$libraryEntries = [
    [
        'id' => 'library-token-1',
        'name' => 'Professor Onyx',
        'folderId' => 'pcs',
        'schoolId' => 'witherbloom',
        'stamina' => 12,
        'size' => ['width' => 2, 'height' => 2],
        'imageData' => 'data:image/png;base64,' . str_repeat('A', 32),
        'createdAt' => 123,
        'updatedAt' => 456,
    ],
];

$librarySummary = summarizeTokenLibraryForChangeLog($libraryEntries);
if (count($librarySummary) !== 1) {
    fwrite(STDERR, "Token library change summary should contain one entry.\n");
    $allPassed = false;
} else {
    $summaryToken = $librarySummary[0];
    if (isset($summaryToken['imageData'])) {
        fwrite(STDERR, "Token library change summary must not include raw image data.\n");
        $allPassed = false;
    }
    if (empty($summaryToken['hasImage'])) {
        fwrite(STDERR, "Token library change summary lost the hasImage flag.\n");
        $allPassed = false;
    }
    if (!isset($summaryToken['imageHash']) || !is_string($summaryToken['imageHash']) || strlen($summaryToken['imageHash']) < 8) {
        fwrite(STDERR, "Token library change summary is missing the image hash identifier.\n");
        $allPassed = false;
    }
    if (json_encode($librarySummary) === false) {
        fwrite(STDERR, "json_encode failed for the token library summary.\n");
        $allPassed = false;
    }
}

if (!$allPassed) {
    exit(1);
}

echo "All token repository checks passed.\n";
