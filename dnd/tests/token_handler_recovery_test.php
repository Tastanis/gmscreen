<?php
require_once __DIR__ . '/../vtt/token_repository.php';

$sceneId = 'scene-test';
$tokens = [
    [
        'id' => 'token-1',
        'libraryId' => 'lib-1',
        'name' => "Test \u{2603}",
        'imageData' => 'data:image/png;base64,AAA',
        'size' => ['width' => 1, 'height' => 1],
        'position' => ['x' => 0, 'y' => 0],
        'stamina' => 3,
    ],
];

$saveAttempts = 0;
$sanitizeInvoked = false;
$resetInvoked = false;
$logInvoked = false;

$saveCallback = function (string $incomingSceneId, array $incomingTokens) use (&$saveAttempts) {
    $saveAttempts++;
    return false; // force failure to trigger recovery logic
};

$sanitizeCallback = function (array $incomingTokens) use (&$sanitizeInvoked) {
    $sanitizeInvoked = true;
    return array_slice($incomingTokens, 0, 1);
};

$resetCallback = function (string $incomingSceneId) use (&$resetInvoked) {
    if ($incomingSceneId !== 'scene-test') {
        fwrite(STDERR, "Reset invoked with unexpected scene identifier.\n");
        return false;
    }
    $resetInvoked = true;
    return true;
};

$logger = function (string $message, array $context = []) use (&$logInvoked) {
    $logInvoked = true;
    if (strpos($message, 'Failed to persist scene tokens for scene') === false) {
        fwrite(STDERR, "Unexpected log message: {$message}\n");
    }
    if (!isset($context['original_count'], $context['sanitized_count'])) {
        fwrite(STDERR, "Logger context missing expected keys.\n");
    }
};

$result = persistSceneTokensWithRecovery(
    $sceneId,
    $tokens,
    $saveCallback,
    $sanitizeCallback,
    $resetCallback,
    $logger
);

$allPassed = true;

if (!$sanitizeInvoked) {
    fwrite(STDERR, "Sanitizer callback was not invoked.\n");
    $allPassed = false;
}

if ($saveAttempts !== 2) {
    fwrite(STDERR, sprintf("Expected two save attempts, observed %d.\n", $saveAttempts));
    $allPassed = false;
}

if (!$resetInvoked) {
    fwrite(STDERR, "Reset callback was not triggered after save failures.\n");
    $allPassed = false;
}

if (!$logInvoked) {
    fwrite(STDERR, "Logger callback was not invoked for fallback path.\n");
    $allPassed = false;
}

if (!$result['success']) {
    fwrite(STDERR, "Recovery result did not report success.\n");
    $allPassed = false;
}

if (empty($result['removed_corrupt_tokens'])) {
    fwrite(STDERR, "Recovery result did not flag removed corrupt tokens.\n");
    $allPassed = false;
}

if ($result['tokens'] !== []) {
    fwrite(STDERR, "Recovery result should reset tokens to an empty array.\n");
    $allPassed = false;
}

if (!$allPassed) {
    exit(1);
}

echo "All token handler recovery checks passed.\n";
