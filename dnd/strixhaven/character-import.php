<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || $_SESSION['user'] !== 'GM') {
    header('Location: ../index.php');
    exit;
}

// Define character list (same as main dashboard)
$characters = array('frunk', 'sharon', 'indigo', 'zepha');

// Load current character data to show existing names
function loadCharacterData() {
    $dataFile = '../data/characters.json';
    if (file_exists($dataFile)) {
        $content = file_get_contents($dataFile);
        $data = json_decode($content, true);
        if ($data) {
            return $data;
        }
    }
    return array();
}

$characterData = loadCharacterData();
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Character JSON Import - Strixhaven GM</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #1a1a1a;
            color: #e0e0e0;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: #2a2a2a;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        h1 {
            color: #4a9eff;
            text-align: center;
            margin-bottom: 30px;
        }
        .back-link {
            display: inline-block;
            color: #4a9eff;
            text-decoration: none;
            margin-bottom: 20px;
        }
        .back-link:hover {
            text-decoration: underline;
        }
        .import-section {
            background-color: #333;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #4a9eff;
        }
        select, textarea, input[type="text"] {
            width: 100%;
            padding: 10px;
            background-color: #1a1a1a;
            border: 1px solid #555;
            border-radius: 4px;
            color: #e0e0e0;
            font-family: monospace;
        }
        textarea {
            height: 300px;
            resize: vertical;
        }
        .character-selector {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 20px;
        }
        .character-option {
            background-color: #444;
            border: 2px solid #666;
            border-radius: 6px;
            padding: 15px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .character-option:hover {
            background-color: #555;
            border-color: #4a9eff;
        }
        .character-option.selected {
            background-color: #4a9eff;
            border-color: #4a9eff;
            color: #1a1a1a;
        }
        .character-name {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .character-slot {
            font-size: 0.9em;
            opacity: 0.8;
        }
        .buttons {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
        }
        button {
            padding: 12px 25px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.3s ease;
        }
        .btn-primary {
            background-color: #4a9eff;
            color: white;
        }
        .btn-primary:hover {
            background-color: #3a8eef;
        }
        .btn-secondary {
            background-color: #666;
            color: white;
        }
        .btn-secondary:hover {
            background-color: #777;
        }
        .btn-danger {
            background-color: #ff4444;
            color: white;
        }
        .btn-danger:hover {
            background-color: #ee3333;
        }
        .preview-section {
            background-color: #333;
            padding: 20px;
            border-radius: 6px;
            margin-top: 20px;
            display: none;
        }
        .preview-section h3 {
            color: #4a9eff;
            margin-top: 0;
        }
        .preview-data {
            background-color: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #4a9eff;
            white-space: pre-line;
            font-family: monospace;
        }
        .error-message, .success-message {
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
            display: none;
        }
        .error-message {
            background-color: #ff4444;
            color: white;
        }
        .success-message {
            background-color: #44ff44;
            color: #1a1a1a;
        }
        .json-example {
            background-color: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #4a9eff;
            margin-top: 10px;
            font-family: monospace;
            font-size: 0.9em;
            white-space: pre-line;
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="../dashboard.php" class="back-link">← Back to Dashboard</a>
        
        <h1>Character JSON Import</h1>
        
        <div class="import-section">
            <h3>Select Character Slot</h3>
            <div class="character-selector">
                <?php foreach ($characters as $charSlot): ?>
                    <div class="character-option" data-character="<?php echo $charSlot; ?>">
                        <div class="character-name">
                            <?php 
                            echo isset($characterData[$charSlot]['character']['character_name']) && 
                                 !empty($characterData[$charSlot]['character']['character_name']) 
                                 ? htmlspecialchars($characterData[$charSlot]['character']['character_name'])
                                 : 'Empty Slot';
                            ?>
                        </div>
                        <div class="character-slot"><?php echo ucfirst($charSlot); ?></div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="import-section">
            <h3>JSON Data</h3>
            <div class="form-group">
                <label for="json-input">Paste your character JSON data below:</label>
                <textarea id="json-input" placeholder="Paste JSON character data here..."></textarea>
            </div>
            
            <div class="form-group">
                <label>Example JSON Format:</label>
                <div class="json-example">{
  "name": "Aria Spellweaver",
  "race": "Human",
  "age": "19",
  "job": "Library Assistant",
  "year": "2nd",
  "college": "Quandrix",
  "clubs": ["Debate Society", "Spell Theory Club"],
  "edge": "Quick learner",
  "bane": "Overconfident",
  "character_information": {
    "origin": "Small town scholar",
    "desire": "Master all forms of magic",
    "fear": "Being forgotten",
    "connection": "Childhood friend at rival college",
    "impact": "Wants to revolutionize magical education",
    "change": "Learning to work with others"
  },
  "skills": ["Arcana", "Investigation", "Persuasion"],
  "other_notes": "Has a pet familiar owl named Wisdom"
}</div>
            </div>
        </div>

        <div class="buttons">
            <button type="button" class="btn-secondary" id="preview-btn">Preview Import</button>
            <button type="button" class="btn-primary" id="import-btn" disabled>Import Character</button>
            <button type="button" class="btn-danger" id="clear-btn">Clear Form</button>
        </div>

        <div class="error-message" id="error-message"></div>
        <div class="success-message" id="success-message"></div>

        <div class="preview-section" id="preview-section">
            <h3>Import Preview</h3>
            <div class="preview-data" id="preview-data"></div>
        </div>
    </div>

    <script src="js/character-import.js"></script>
</body>
</html>