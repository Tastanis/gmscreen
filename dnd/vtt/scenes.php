<?php

declare(strict_types=1);

$staticContent = require __DIR__ . '/static_content.php';

if (!is_array($staticContent) || !isset($staticContent['sceneData']) || !is_array($staticContent['sceneData'])) {
    return [
        'folders' => [],
        'rootScenes' => [],
    ];
}

$sceneData = $staticContent['sceneData'];

if (!isset($sceneData['folders']) || !is_array($sceneData['folders'])) {
    $sceneData['folders'] = [];
}
if (!isset($sceneData['rootScenes']) || !is_array($sceneData['rootScenes'])) {
    $sceneData['rootScenes'] = [];
}

return $sceneData;
