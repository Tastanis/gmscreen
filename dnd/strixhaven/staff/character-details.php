<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Include character integration
require_once '../gm/includes/character-integration.php';

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
            border: 4px solid #667eea;
            margin-bottom: 20px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }
        
        .character-details {
            flex: 1;
        }
        
        .detail-section {
            margin-bottom: 25px;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #667eea;
        }
        
        .detail-section h3 {
            font-size: 1.4em;
            margin-bottom: 15px;
            color: #667eea;
            border-bottom: 2px solid #eee;
            padding-bottom: 8px;
        }
        
        .detail-item {
            margin-bottom: 12px;
        }
        
        .detail-label {
            font-weight: bold;
            color: #555;
            margin-bottom: 5px;
        }
        
        .detail-value {
            background: white;
            padding: 10px;
            border-radius: 4px;
            border: 1px solid #ddd;
            line-height: 1.5;
        }
        
        .back-button {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(255, 255, 255, 0.9);
            color: #667eea;
            padding: 10px 20px;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
        }
        
        .back-button:hover {
            background: white;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }
        
        @media (max-width: 768px) {
            .character-content {
                grid-template-columns: 1fr;
                gap: 20px;
            }
            
            .character-portrait-section {
                order: -1;
            }
        }
    </style>
</head>
<body>
    <button class="back-button" onclick="window.close() || history.back()">← Back</button>
    
    <div class="character-container">
        <div class="character-header">
            <h1><?php echo htmlspecialchars($character['name']); ?></h1>
            <div class="character-type"><?php echo htmlspecialchars(ucfirst($type)); ?></div>
        </div>
        
        <div class="character-content">
            <div class="character-portrait-section">
                <?php 
                $imagePath = '';
                if (isset($character['image_path']) && $character['image_path']) {
                    if ($type === 'student') {
                        $imagePath = '../students/' . $character['image_path'];
                    } elseif ($type === 'staff') {
                        $imagePath = $character['image_path'];
                    } elseif ($type === 'location') {
                        $imagePath = '../locations/' . $character['image_path'];
                    }
                }
                
                if ($imagePath && file_exists($imagePath)): ?>
                    <img src="<?php echo htmlspecialchars($imagePath); ?>" alt="<?php echo htmlspecialchars($character['name']); ?>" class="character-portrait" draggable="true">
                <?php else: ?>
                    <div class="character-portrait" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 3em;">
                        <?php echo $type === 'location' ? '📍' : '👤'; ?>
                    </div>
                <?php endif; ?>
            </div>
            
            <div class="character-details">
                <?php if ($type === 'student'): ?>
                    <div class="detail-section">
                        <h3>Basic Information</h3>
                        
                        <?php if (isset($character['grade_level'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">Grade Level</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['grade_level']); ?></div>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (isset($character['college'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">College</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['college']); ?></div>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (isset($character['pronouns'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">Pronouns</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['pronouns']); ?></div>
                        </div>
                        <?php endif; ?>
                    </div>
                    
                    <?php if (isset($character['character_info'])): ?>
                    <div class="detail-section">
                        <h3>Character Information</h3>
                        
                        <?php foreach ($character['character_info'] as $key => $value): ?>
                        <?php if ($value): ?>
                        <div class="detail-item">
                            <div class="detail-label"><?php echo htmlspecialchars(ucwords(str_replace('_', ' ', $key))); ?></div>
                            <div class="detail-value"><?php echo nl2br(htmlspecialchars($value)); ?></div>
                        </div>
                        <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                    
                    <?php if (isset($character['details'])): ?>
                    <div class="detail-section">
                        <h3>Details</h3>
                        
                        <?php foreach ($character['details'] as $key => $value): ?>
                        <?php if ($value): ?>
                        <div class="detail-item">
                            <div class="detail-label"><?php echo htmlspecialchars(ucwords(str_replace('_', ' ', $key))); ?></div>
                            <div class="detail-value"><?php echo nl2br(htmlspecialchars($value)); ?></div>
                        </div>
                        <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                    
                <?php elseif ($type === 'staff'): ?>
                    <div class="detail-section">
                        <h3>Basic Information</h3>
                        
                        <?php if (isset($character['college'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">College</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['college']); ?></div>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (isset($character['position'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">Position</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['position']); ?></div>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (isset($character['pronouns'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">Pronouns</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['pronouns']); ?></div>
                        </div>
                        <?php endif; ?>
                    </div>
                    
                    <?php if (isset($character['details'])): ?>
                    <div class="detail-section">
                        <h3>Details</h3>
                        
                        <?php foreach ($character['details'] as $key => $value): ?>
                        <?php if ($value): ?>
                        <div class="detail-item">
                            <div class="detail-label"><?php echo htmlspecialchars(ucwords(str_replace('_', ' ', $key))); ?></div>
                            <div class="detail-value"><?php echo nl2br(htmlspecialchars($value)); ?></div>
                        </div>
                        <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                    
                <?php elseif ($type === 'location'): ?>
                    <div class="detail-section">
                        <h3>Basic Information</h3>
                        
                        <?php if (isset($character['college'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">College</div>
                            <div class="detail-value"><?php echo htmlspecialchars($character['college']); ?></div>
                        </div>
                        <?php endif; ?>
                        
                        <?php if (isset($character['hex_color'])): ?>
                        <div class="detail-item">
                            <div class="detail-label">Color</div>
                            <div class="detail-value">
                                <span style="display: inline-block; width: 20px; height: 20px; background-color: <?php echo htmlspecialchars($character['hex_color']); ?>; border-radius: 3px; margin-right: 10px; vertical-align: middle;"></span>
                                <?php echo htmlspecialchars($character['hex_color']); ?>
                            </div>
                        </div>
                        <?php endif; ?>
                    </div>
                    
                    <?php if (isset($character['details'])): ?>
                    <div class="detail-section">
                        <h3>Details</h3>
                        
                        <?php foreach ($character['details'] as $key => $value): ?>
                        <?php if ($value): ?>
                        <div class="detail-item">
                            <div class="detail-label"><?php echo htmlspecialchars(ucwords(str_replace('_', ' ', $key))); ?></div>
                            <div class="detail-value"><?php echo nl2br(htmlspecialchars($value)); ?></div>
                        </div>
                        <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                    <?php endif; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>
<?php if ($imagePath && file_exists($imagePath)): ?>
<script>
    (function() {
        const portrait = document.querySelector('.character-portrait');
        if (!portrait) {
            return;
        }

        portrait.setAttribute('draggable', 'true');
        const src = portrait.getAttribute('src');
        let absoluteUrl = src;
        try {
            absoluteUrl = new URL(src, window.location.href).href;
        } catch (error) {
            absoluteUrl = src;
        }

        portrait.addEventListener('dragstart', function(event) {
            if (!event.dataTransfer) {
                return;
            }
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('text/uri-list', absoluteUrl);
            event.dataTransfer.setData('text/plain', absoluteUrl);
        });
    })();
</script>
<?php endif; ?>
</body>
</html>