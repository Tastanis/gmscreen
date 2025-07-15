<?php
session_start();

// Check if user is logged in and is GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

if (!$is_gm) {
    header('Location: ../../dashboard.php');
    exit;
}

// Include character integration
require_once 'includes/character-integration.php';

// Get character details from URL parameters
$characterId = isset($_GET['id']) ? $_GET['id'] : '';
$characterType = isset($_GET['type']) ? $_GET['type'] : '';

if (!$characterId || !$characterType) {
    die('Invalid character parameters');
}

// Get character details
$result = getCharacterDetails($characterId, $characterType);

if (!$result['success']) {
    die('Character not found: ' . $result['error']);
}

$character = $result['character'];
$type = $result['type'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($character['name']); ?> - Character Details</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .character-container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }
        
        .character-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .character-header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .character-type {
            font-size: 1.2em;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        
        .character-content {
            display: grid;
            grid-template-columns: 250px 1fr;
            gap: 30px;
            padding: 30px;
        }
        
        .character-portrait-section {
            text-align: center;
        }
        
        .character-portrait {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            object-fit: cover;
            border: 5px solid #e1e8ed;
            margin-bottom: 20px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .character-portrait-placeholder {
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: #e1e8ed;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #777;
            font-size: 18px;
            border: 5px solid #e1e8ed;
            margin-bottom: 20px;
        }
        
        .character-info-section {
            display: flex;
            flex-direction: column;
            gap: 25px;
        }
        
        .info-block {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }

        .gm-info-block {
            background: #fff3cd;
            border-left-color: #f39c12;
        }

        .gm-info-block h3 {
            color: #856404;
            border-bottom-color: #f39c12;
        }
        
        .info-block h3 {
            color: #2c3e50;
            font-size: 1.3em;
            margin-bottom: 15px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 8px;
        }
        
        .info-block p {
            margin: 8px 0;
            color: #555;
        }
        
        .info-block strong {
            color: #2c3e50;
        }
        
        .skills-list, .clubs-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }
        
        .skill-tag {
            background: #27ae60;
            color: white;
            padding: 6px 12px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .club-tag {
            background: #667eea;
            color: white;
            padding: 6px 12px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .back-button {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }
        
        .back-button:hover {
            background: rgba(0, 0, 0, 0.8);
            transform: translateY(-2px);
        }
        
        @media (max-width: 768px) {
            .character-content {
                grid-template-columns: 1fr;
                text-align: center;
                padding: 20px;
            }
            
            .character-header {
                padding: 20px;
            }
            
            .character-header h1 {
                font-size: 2em;
            }
            
            .character-portrait,
            .character-portrait-placeholder {
                width: 150px;
                height: 150px;
            }
        }
    </style>
</head>
<body>
    <button class="back-button" onclick="window.close()">← Close Tab</button>
    
    <div class="character-container">
        <div class="character-header">
            <h1><?php echo htmlspecialchars($character['name']); ?></h1>
            <div class="character-type">
                <?php echo $type === 'student' ? 'Student' : 'Staff Member'; ?>
            </div>
        </div>
        
        <div class="character-content">
            <div class="character-portrait-section">
                <?php
                $imagePath = '';
                if (!empty($character['image_path'])) {
                    $imagePath = $type === 'student' ? 
                        '../students/' . $character['image_path'] : 
                        '../staff/' . $character['image_path'];
                }
                
                if ($imagePath && file_exists($imagePath)):
                ?>
                    <img src="<?php echo htmlspecialchars($imagePath); ?>" 
                         alt="<?php echo htmlspecialchars($character['name']); ?>" 
                         class="character-portrait">
                <?php else: ?>
                    <div class="character-portrait-placeholder">No Photo</div>
                <?php endif; ?>
            </div>
            
            <div class="character-info-section">
                <!-- Basic Information -->
                <div class="info-block">
                    <h3>Basic Information</h3>
                    <p><strong>Name:</strong> <?php echo htmlspecialchars($character['name']); ?></p>
                    
                    <?php if ($type === 'student'): ?>
                        <p><strong>Grade:</strong> <?php echo htmlspecialchars($character['grade_level'] ?? 'Unknown'); ?></p>
                        <p><strong>College:</strong> <?php echo htmlspecialchars($character['college'] ?? 'No College'); ?></p>
                        <p><strong>Race:</strong> <?php echo htmlspecialchars($character['race'] ?? 'Unknown'); ?></p>
                    <?php else: ?>
                        <p><strong>College:</strong> <?php echo htmlspecialchars($character['college'] ?? 'No College'); ?></p>
                    <?php endif; ?>
                </div>
                
                <?php if ($type === 'student'): ?>
                    <!-- Student-specific content -->
                    
                    <?php if (!empty($character['skills']) && is_array($character['skills'])): ?>
                    <div class="info-block">
                        <h3>Skills</h3>
                        <div class="skills-list">
                            <?php foreach ($character['skills'] as $skill): ?>
                                <span class="skill-tag"><?php echo htmlspecialchars($skill); ?></span>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endif; ?>
                    
                    <?php if (!empty($character['clubs']) && is_array($character['clubs'])): ?>
                    <div class="info-block">
                        <h3>Clubs</h3>
                        <div class="clubs-list">
                            <?php foreach ($character['clubs'] as $club): ?>
                                <span class="club-tag"><?php echo htmlspecialchars($club); ?></span>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <?php endif; ?>
                    
                    <?php if (!empty($character['details']['backstory'])): ?>
                    <div class="info-block">
                        <h3>Backstory</h3>
                        <p><?php echo nl2br(htmlspecialchars($character['details']['backstory'])); ?></p>
                    </div>
                    <?php endif; ?>
                    
                    <?php if (!empty($character['relationships']) && is_array($character['relationships'])): ?>
                    <div class="info-block">
                        <h3>PC Relationships</h3>
                        <?php foreach ($character['relationships'] as $pc => $points): ?>
                            <p><strong><?php echo htmlspecialchars($pc); ?>:</strong> <?php echo htmlspecialchars($points); ?></p>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                    
                <?php else: ?>
                    <!-- Staff-specific content -->
                    
                    <?php if (!empty($character['character_description'])): ?>
                    <div class="info-block">
                        <h3>Description</h3>
                        <p><?php echo nl2br(htmlspecialchars($character['character_description'])); ?></p>
                    </div>
                    <?php endif; ?>
                    
                    <?php if (!empty($character['general_info'])): ?>
                    <div class="info-block">
                        <h3>General Information</h3>
                        <p><?php echo nl2br(htmlspecialchars($character['general_info'])); ?></p>
                    </div>
                    <?php endif; ?>

                    <?php if (!empty($character['gm_only']['personality']) || !empty($character['gm_only']['other'])): ?>
                    <div class="info-block gm-info-block">
                        <h3>GM Notes</h3>
                        <?php if (!empty($character['gm_only']['personality'])): ?>
                            <p><strong>Personality:</strong> <?php echo nl2br(htmlspecialchars($character['gm_only']['personality'])); ?></p>
                        <?php endif; ?>
                        <?php if (!empty($character['gm_only']['other'])): ?>
                            <p><strong>Other:</strong> <?php echo nl2br(htmlspecialchars($character['gm_only']['other'])); ?></p>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>

                <?php endif; ?>
            </div>
        </div>
    </div>
</body>
</html>