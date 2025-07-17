<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../index.php');
    exit;
}

// Determine if user is GM - case insensitive check
$current_user = $_SESSION['user'];
$is_gm = (strtolower($_SESSION['user']) === 'gm');

// Load combat data
$combat_file = '../data/combat.json';
$combat_data = array();

if (file_exists($combat_file)) {
    $json_content = file_get_contents($combat_file);
    $combat_data = json_decode($json_content, true);
    if ($combat_data === null) {
        $combat_data = array();
    }
}

// If no data exists, create default structure
if (empty($combat_data)) {
    $combat_data = array(
        'round_count' => 1,
        'player_turn_first' => null,
        'initiative_rolled' => false,
        'creatures' => array(),
        'pcs' => array()
    );
}

// Ensure all required keys exist
$combat_data['round_count'] = $combat_data['round_count'] ?? 1;
$combat_data['player_turn_first'] = $combat_data['player_turn_first'] ?? null;
$combat_data['initiative_rolled'] = $combat_data['initiative_rolled'] ?? false;
$combat_data['creatures'] = $combat_data['creatures'] ?? array();
$combat_data['pcs'] = $combat_data['pcs'] ?? array();

// Condition rules for tooltips
$condition_rules = array(
    "Bleeding" => "While bleeding, whenever you make a test using Might or Agility, make a strike, or use an action, maneuver, or a triggered action, you lose 1d6 Stamina after the test, action, maneuver, or triggered action is resolved. This Stamina loss can't be prevented in any way.",
    "Dazed" => "While you are dazed, you can do only one thing on your turn: use a maneuver, use an action, or take a move action. You also can't use triggered actions, free triggered actions, or free maneuvers.",
    "Frightened" => "If you are frightened, ability power rolls you make against the source of your fear take a bane. If that source is a creature, their ability power rolls against you gain an edge. You can't willingly move closer to the source of your fear if you know the location of that source.",
    "Grabbed" => "While you are grabbed, your speed is 0, you can't be force moved, you can't use the Knockback maneuver, and you take a bane on abilities that don't target the creature grabbing you. If the creature grabbing you moves, they bring you with them.",
    "Prone" => "While you are prone, you are flat on the ground, strikes you make take a bane, and melee abilities made against you gain an edge. You must crawl to move along the ground, which costs you 1 additional square of movement for every square you crawl.",
    "Restrained" => "While you are restrained, your speed is 0, you can't use the Stand Up maneuver, and you can't be force moved. Your ability power rolls take a bane, abilities against you gain an edge, and you have a bane on Might and Agility tests.",
    "Slowed" => "While you are slowed, your speed is 2 unless it is already lower, and you can't shift.",
    "Taunted" => "If you are taunted, you have a double bane on ability power rolls that don't target the creature who taunted you while you have line of effect to that creature.",
    "Weakened" => "While you are weakened, all your power rolls take a bane."
);
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Combat Tracker - <?php echo $is_gm ? 'GM Mode' : 'Player Mode'; ?></title>
    <link rel="stylesheet" href="css/combat.css">
</head>
<body>
    <!-- Header Controls -->
    <div class="header">
        <div class="header-left">
            <h1>Combat Tracker</h1>
            <div class="controls">
                <?php if ($is_gm): ?>
                    <button id="add-enemy" class="btn btn-enemy">Add Enemy</button>
                    <button id="add-hero" class="btn btn-hero">Add Hero</button>
                    <button id="add-pcs" class="btn btn-pc">Add PCs</button>
                    <button id="roll-initiative" class="btn btn-initiative">Roll Initiative (D10)</button>
                    <button id="end-combat" class="btn btn-danger">End Combat</button>
                <?php else: ?>
                    <p class="readonly-notice">👁️ <strong>Read-Only Mode:</strong> You can see all combat information but cannot make changes.</p>
                <?php endif; ?>
            </div>
        </div>
        
        <div class="header-right">
            <div class="combat-info">
                <div id="initiative-display" class="info-display">
                    Initiative: <?php 
                        if ($combat_data['initiative_rolled']) {
                            $winner = $combat_data['player_turn_first'] ? 'Players' : 'Monsters';
                            echo "$winner win!";
                        } else {
                            echo "Not Rolled";
                        }
                    ?>
                </div>
                <div id="round-display" class="info-display">
                    Round: <?php echo $combat_data['round_count']; ?>
                </div>
            </div>
            
            <div class="user-info">
                Logged in as: <strong><?php echo htmlspecialchars($current_user); ?></strong>
                <?php if ($is_gm): ?>
                    <span class="gm-badge">GM</span>
                <?php else: ?>
                    <span class="player-badge">Player (Read-Only)</span>
                <?php endif; ?>
                <a href="../logout.php" class="logout-btn">Logout</a>
            </div>
        </div>
    </div>

    <!-- Main Combat Area -->
    <div class="combat-container">
        <div class="combat-area" id="combat-area">
            <div class="combat-area-inner">
                <!-- Column dividers -->
                <div class="column-dividers">
                    <div class="column-divider"></div>
                    <div class="column-divider"></div>
                    <div class="column-divider"></div>
                </div>
                
                <!-- Column headers for 4-column layout -->
                <div class="column-headers">
                    <div class="column-headers-inner">
                        <div class="column-header">
                            <h3>Heroes Waiting</h3>
                            <p>Column 1</p>
                        </div>
                        <div class="column-header">
                            <h3>Enemies Waiting</h3>
                            <p>Column 2</p>
                        </div>
                        <div class="column-header">
                            <h3>Heroes Complete</h3>
                            <p>Column 3</p>
                        </div>
                        <div class="column-header">
                            <h3>Enemies Complete</h3>
                            <p>Column 4</p>
                        </div>
                    </div>
                </div>
                
                <!-- Creatures will be dynamically added here -->
            </div>
        </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
        <div id="save-status">Ready</div>
        <div id="last-update">Last update: Never</div>
        <div id="creature-count">Creatures: <?php echo count($combat_data['creatures']); ?></div>
    </div>

    <!-- Hidden file input for image uploads -->
    <input type="file" id="image-upload" accept="image/*" style="display: none;">

    <!-- Condition Selection Modal (for GM) -->
    <?php if ($is_gm): ?>
    <div id="condition-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Select Condition</h3>
                <span class="close" id="close-condition-modal">&times;</span>
            </div>
            <div class="modal-body">
                <div class="condition-grid">
                    <?php foreach ($condition_rules as $condition => $rule): ?>
                    <div class="condition-option" data-condition="<?php echo htmlspecialchars($condition); ?>">
                        <div class="condition-name"><?php echo htmlspecialchars($condition); ?></div>
                        <div class="condition-preview"><?php echo htmlspecialchars(substr($rule, 0, 100)); ?>...</div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Condition Rules Tooltip -->
    <div id="condition-tooltip" class="tooltip" style="display: none;">
        <div class="tooltip-content">
            <div class="tooltip-title"></div>
            <div class="tooltip-text"></div>
        </div>
    </div>

    <script>
        // Pass PHP variables to JavaScript
        const isGM = <?php echo $is_gm ? 'true' : 'false'; ?>;
        const currentUser = '<?php echo $current_user; ?>';
        const combatData = <?php echo json_encode($combat_data); ?>;
        const conditionRules = <?php echo json_encode($condition_rules); ?>;
        const availableConditions = <?php echo json_encode(array_keys($condition_rules)); ?>;
    </script>
    <script src="js/combat.js"></script>
</body>
</html>