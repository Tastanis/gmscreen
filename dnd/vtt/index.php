<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../index.php');
    exit;
}

$user = $_SESSION['user'] ?? 'Adventurer';
$isGm = strtolower($user) === 'gm';

$chatParticipantsMap = require __DIR__ . '/../includes/chat_participants.php';
$chatParticipantList = [];
foreach ($chatParticipantsMap as $participantId => $participantLabel) {
    $chatParticipantList[] = [
        'id' => $participantId,
        'label' => $participantLabel,
    ];
}

require_once __DIR__ . '/scenes_repository.php';

$sceneData = require __DIR__ . '/scenes.php';
if (!is_array($sceneData)) {
    $sceneData = [
        'folders' => [],
        'rootScenes' => [],
    ];
}

$scenes = flattenScenes($sceneData);

$sceneLookup = [];
foreach ($scenes as $scene) {
    if (!is_array($scene) || !isset($scene['id'])) {
        continue;
    }
    $sceneLookup[$scene['id']] = $scene;
}

$defaultSceneId = null;
if (!empty($scenes)) {
    $firstScene = reset($scenes);
    if (is_array($firstScene) && isset($firstScene['id'])) {
        $defaultSceneId = $firstScene['id'];
    }
}

$sceneStateFile = __DIR__ . '/../data/vtt_active_scene.json';
$sceneStateDir = dirname($sceneStateFile);
if (!is_dir($sceneStateDir)) {
    mkdir($sceneStateDir, 0755, true);
}

$activeSceneId = $defaultSceneId;
if (file_exists($sceneStateFile)) {
    $rawSceneState = file_get_contents($sceneStateFile);
    $decodedSceneState = json_decode($rawSceneState, true);
    if (is_array($decodedSceneState) && isset($decodedSceneState['active_scene_id'])) {
        $storedSceneId = $decodedSceneState['active_scene_id'];
        if (isset($sceneLookup[$storedSceneId])) {
            $activeSceneId = $storedSceneId;
        }
    }
} elseif ($defaultSceneId !== null) {
    file_put_contents(
        $sceneStateFile,
        json_encode(['active_scene_id' => $defaultSceneId], JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

if ($activeSceneId === null && !empty($sceneLookup)) {
    $activeSceneId = array_key_first($sceneLookup);
}

$activeScene = $activeSceneId !== null && isset($sceneLookup[$activeSceneId])
    ? $sceneLookup[$activeSceneId]
    : null;
$activeSceneAccent = is_array($activeScene) && isset($activeScene['accent'])
    ? (string) $activeScene['accent']
    : '';
$activeSceneMap = [
    'image' => '',
    'gridScale' => 50,
];
if (is_array($activeScene) && isset($activeScene['map']) && is_array($activeScene['map'])) {
    $activeSceneMap['image'] = isset($activeScene['map']['image']) ? (string) $activeScene['map']['image'] : '';
    $gridScale = isset($activeScene['map']['gridScale']) ? (int) $activeScene['map']['gridScale'] : 50;
    if ($gridScale < 10) {
        $gridScale = 10;
    }
    if ($gridScale > 300) {
        $gridScale = 300;
    }
    $activeSceneMap['gridScale'] = $gridScale;
}

$vttConfig = [
    'isGM' => $isGm,
    'currentUser' => $user,
    'scenes' => array_values($scenes),
    'sceneData' => $sceneData,
    'activeSceneId' => $activeSceneId,
    'activeScene' => $activeScene,
    'sceneEndpoint' => 'scenes_handler.php',
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Virtual Tabletop</title>
    <link rel="stylesheet" href="../css/style.css">
    <link rel="stylesheet" href="../css/vtt.css">
</head>
<body class="vtt-body">
    <div class="vtt-container">
        <main class="vtt-main" role="main">
            <div
                id="scene-display"
                class="scene-display"
                data-scene-id="<?php echo htmlspecialchars($activeSceneId ?? '', ENT_QUOTES); ?>"
                data-scene-accent="<?php echo htmlspecialchars($activeSceneAccent, ENT_QUOTES); ?>"
            >
                <div class="scene-display__meta">
                    <span class="scene-display__label">Active Scene</span>
                    <?php if ($isGm): ?>
                        <span class="scene-display__badge">GM View</span>
                    <?php else: ?>
                        <span class="scene-display__badge">Player View</span>
                    <?php endif; ?>
                </div>
                <h1 id="scene-display-name" class="scene-display__name">
                    <?php echo htmlspecialchars($activeScene['name'] ?? 'Waiting for the GM to pick a scene', ENT_QUOTES); ?>
                </h1>
                <p id="scene-display-description" class="scene-display__description">
                    <?php
                    if ($activeScene && isset($activeScene['description'])) {
                        echo htmlspecialchars($activeScene['description'], ENT_QUOTES);
                    } else {
                        echo 'When the GM activates a scene it will appear here for everyone at the table.';
                    }
                    ?>
                </p>
                <div
                    id="scene-map"
                    class="scene-display__map<?php echo $activeSceneMap['image'] === '' ? ' scene-display__map--empty' : ''; ?>"
                    data-grid-scale="<?php echo (int) $activeSceneMap['gridScale']; ?>"
                >
                    <div id="scene-map-inner" class="scene-display__map-inner">
                        <img
                            id="scene-map-image"
                            class="scene-display__map-image<?php echo $activeSceneMap['image'] === '' ? ' scene-display__map-image--hidden' : ''; ?>"
                            src="<?php echo htmlspecialchars($activeSceneMap['image'], ENT_QUOTES); ?>"
                            alt="Scene map"
                        >
                        <div id="scene-map-grid" class="scene-display__map-grid"></div>
                    </div>
                    <p
                        id="scene-map-empty"
                        class="scene-display__map-empty"
                        <?php echo $activeSceneMap['image'] !== '' ? 'hidden' : ''; ?>
                    >
                        <?php if ($isGm): ?>
                            Upload a map image to begin building this scene.
                        <?php else: ?>
                            The GM has not shared a map for this scene yet.
                        <?php endif; ?>
                    </p>
                </div>
            </div>
        </main>
    </div>

    <div id="settings-panel" class="settings-panel settings-panel--closed" aria-hidden="true">
        <div class="settings-panel__header">
            <h2 class="settings-panel__title">Tabletop Settings</h2>
            <button type="button" id="settings-panel-close" class="settings-panel__close" aria-label="Close settings">&times;</button>
        </div>
        <div class="settings-panel__content">
            <?php if ($isGm): ?>
                <div class="settings-panel__group settings-panel__group--scenes">
                    <button
                        type="button"
                        id="settings-scenes-toggle"
                        class="settings-panel__primary-action"
                        aria-expanded="true"
                        aria-controls="settings-scenes-list"
                    >
                        Scenes
                    </button>
                    <div id="settings-scenes-list" class="settings-panel__scenes">
                        <div id="scene-management" class="scene-management">
                            <div class="scene-management__folders" id="scene-folder-bar" role="tablist" aria-label="Scene folders"></div>
                            <button type="button" id="scene-add-folder" class="scene-management__add-folder">+ Folder</button>
                            <div id="scene-list" class="scene-management__scene-list" role="list"></div>
                            <button type="button" id="scene-add" class="scene-management__add-scene">+ Scene</button>
                        </div>
                    </div>
                    <p id="settings-scenes-status" class="settings-panel__status" role="status" aria-live="polite"></p>
                </div>
            <?php else: ?>
                <div class="settings-panel__group settings-panel__group--scenes-info">
                    <h3 class="settings-panel__group-title">Scenes</h3>
                    <p class="settings-panel__text">The GM controls which scene is active. Updates will appear automatically when the GM makes a change.</p>
                </div>
            <?php endif; ?>
            <div class="settings-panel__group">
                <h3 class="settings-panel__group-title">More Settings Coming Soon</h3>
                <p class="settings-panel__text">We&rsquo;re just getting started. Future updates will unlock map uploads, tokens, and other table tools.</p>
            </div>
        </div>
    </div>
    <button
        id="settings-panel-toggle"
        class="settings-panel-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="settings-panel"
    >
        Settings
    </button>

    <div id="chat-panel" class="chat-panel chat-panel--closed" aria-hidden="true">
        <div class="chat-panel__header">
            <h3 class="chat-panel__title">Table Chat</h3>
            <div class="chat-panel__actions">
                <?php if ($isGm): ?>
                    <button type="button" id="chat-clear-btn" class="chat-panel__clear">Clear Chat</button>
                <?php endif; ?>
                <button type="button" id="chat-panel-close" class="chat-panel__close" aria-label="Close chat">&times;</button>
            </div>
        </div>
        <div id="chat-message-list" class="chat-panel__history" role="log" aria-live="polite"></div>
        <div id="chat-whisper-targets" class="chat-panel__whispers" role="group" aria-label="Whisper targets"></div>
        <form id="chat-input-form" class="chat-panel__input" autocomplete="off">
            <textarea id="chat-input" class="chat-panel__textarea" rows="2" placeholder="Type a message..."></textarea>
            <button type="submit" id="chat-send-btn" class="chat-panel__send">Send</button>
        </form>
    </div>
    <button id="chat-panel-toggle" class="chat-panel-toggle" type="button" aria-expanded="false" aria-controls="chat-panel">
        Open Chat
    </button>
    <div id="chat-drop-target" class="chat-drop-target" hidden aria-hidden="true">Drop images or image links to share</div>
    <div id="chat-whisper-popouts" class="chat-whisper-popouts" aria-live="polite" aria-atomic="false"></div>
    <div id="chat-whisper-alerts" class="chat-whisper-alerts" aria-live="assertive" aria-atomic="true"></div>

    <script>
        window.chatParticipants = <?php echo json_encode($chatParticipantList, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
        window.chatHandlerUrl = '../chat_handler.php';
        window.vttConfig = <?php echo json_encode($vttConfig, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
    </script>
    <script src="../js/chat-panel.js"></script>
    <script src="../js/vtt.js"></script>
</body>
</html>
