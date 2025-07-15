<?php
session_start();

// Check if user is logged in as GM
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

if (!$is_gm) {
    echo "You must be logged in as GM to view this debug page.";
    exit;
}

echo "<h2>GM Interface HTML Verification</h2>";
echo "<p><strong>Current User:</strong> $user (GM: " . ($is_gm ? 'YES' : 'NO') . ")</p>";

// Show exactly what should be in the HTML for GM
echo "<h3>1. Check Your Current index.php Content</h3>";
echo "<p>Your index.php should contain this HTML structure for GM:</p>";

echo "<div style='background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 10px 0;'>";
echo "<h4>CORRECT GM HTML (what should be there):</h4>";
echo "<pre style='color: green;'>";
echo htmlspecialchars('<?php if ($is_gm): ?>
    <!-- GM VIEW: All characters stacked -->
    <div class="gm-view">
        <div class="view-info">
            <span class="view-label">🎭 Game Master View - All Characters</span>
            <span class="save-status" id="saveStatus">Ready</span>
        </div>
        
        <?php foreach ([\'frunk\', \'sharon\', \'indigo\', \'zepha\'] as $character): ?>
            <div class="character-section">
                <h2 class="character-name"><?php echo $character_names[$character]; ?></h2>
                <div class="table-wrapper">
                    <table class="schedule-table gm-table">
                    <!-- ... table headers ... -->
                    <tbody>
                        <?php foreach ($time_blocks as $block_key => $block_label): ?>
                            <tr>
                                <td class="time-label"><?php echo $block_label; ?></td>
                                <?php foreach ($days as $day): ?>
                                    <td class="schedule-cell">
                                        <textarea 
                                               class="schedule-input gm-input" 
                                               data-character="<?php echo $character; ?>" 
                                               data-day="<?php echo $day; ?>" 
                                               data-block="<?php echo $block_key; ?>"
                                               placeholder="Enter activity..."
                                               maxlength="500"
                                               rows="4"></textarea>
                                    </td>
                                <?php endforeach; ?>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                </div>
            </div>
        <?php endforeach; ?>
    </div>');
echo "</pre>";
echo "</div>";

echo "<div style='background: #ffe6e6; padding: 15px; border-radius: 8px; margin: 10px 0;'>";
echo "<h4>WRONG HTML (old readonly version):</h4>";
echo "<pre style='color: red;'>";
echo htmlspecialchars('<td class="schedule-cell">
    <div class="readonly-cell" 
         data-character="..." 
         data-day="..." 
         data-block="...">
        <!-- Content loaded via JavaScript -->
    </div>
</td>');
echo "</pre>";
echo "</div>";

echo "<h3>2. Browser Inspection Steps</h3>";
echo "<ol>";
echo "<li><strong>Right-click</strong> on any schedule cell in your GM interface</li>";
echo "<li><strong>Click 'Inspect Element'</strong></li>";
echo "<li><strong>Look for one of these:</strong></li>";
echo "<ul>";
echo "<li>✅ <code>&lt;textarea class=\"schedule-input gm-input\"&gt;</code> = CORRECT (editable)</li>";
echo "<li>❌ <code>&lt;div class=\"readonly-cell\"&gt;</code> = WRONG (old version)</li>";
echo "</ul>";
echo "</ol>";

echo "<h3>3. Quick Fix Steps</h3>";
echo "<p style='background: #e6f3ff; padding: 15px; border-radius: 8px;'>";
echo "<strong>If you see readonly-cell divs instead of textarea elements:</strong><br>";
echo "1. Your index.php file wasn't actually updated<br>";
echo "2. Download the corrected index.php again<br>";
echo "3. Completely replace your current index.php<br>";
echo "4. Hard refresh your browser (Ctrl+F5)";
echo "</p>";

echo "<h3>4. Test the Interface Right Now</h3>";
echo "<p>Here's a working textarea that should look like your GM interface:</p>";

echo '<div style="max-width: 300px; margin: 20px 0;">';
echo '<label><strong>Test GM Input (this should be what you see):</strong></label><br>';
echo '<textarea class="schedule-input gm-input" placeholder="Click here and type - this is how GM inputs should work" rows="4" style="
    width: 100%;
    min-height: 60px;
    padding: 12px;
    border: 2px solid #d69e2e;
    border-radius: 8px;
    font-size: 0.9rem;
    background: #fffbf0;
    color: #2d3748;
    resize: none;
    font-family: inherit;
    box-sizing: border-box;
">Type here to test...</textarea>';
echo '</div>';

echo "<h3>5. File Content Check</h3>";
echo "<p>Let's check if your index.php actually contains the correct code:</p>";

// Check the actual content of index.php
if (file_exists('index.php')) {
    $index_content = file_get_contents('index.php');
    
    // Check for key indicators
    $has_textarea = strpos($index_content, 'class="schedule-input gm-input"') !== false;
    $has_readonly = strpos($index_content, 'class="readonly-cell"') !== false;
    $has_save_status = strpos($index_content, 'id="saveStatus"') !== false;
    $has_refresh_status = strpos($index_content, 'id="refreshStatus"') !== false;
    
    echo "<div style='background: #f9f9f9; padding: 15px; border-radius: 8px;'>";
    echo "<h4>Content Analysis:</h4>";
    echo "<p>✅ Contains GM textareas: " . ($has_textarea ? '<span style="color: green;">YES</span>' : '<span style="color: red;">NO</span>') . "</p>";
    echo "<p>❌ Contains old readonly cells: " . ($has_readonly ? '<span style="color: red;">YES (BAD)</span>' : '<span style="color: green;">NO (GOOD)</span>') . "</p>";
    echo "<p>✅ Has saveStatus (new): " . ($has_save_status ? '<span style="color: green;">YES</span>' : '<span style="color: red;">NO</span>') . "</p>";
    echo "<p>❌ Has refreshStatus (old): " . ($has_refresh_status ? '<span style="color: red;">YES (BAD)</span>' : '<span style="color: green;">NO (GOOD)</span>') . "</p>";
    echo "</div>";
    
    if (!$has_textarea || $has_readonly) {
        echo "<div style='background: #ffebee; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #f44336;'>";
        echo "<h4>🚨 PROBLEM FOUND!</h4>";
        echo "<p><strong>Your index.php file was NOT updated correctly.</strong></p>";
        echo "<p><strong>Solution:</strong></p>";
        echo "<ol>";
        echo "<li>Download the updated index.php file again</li>";
        echo "<li>Make sure to completely replace your current index.php</li>";
        echo "<li>Verify the file uploaded correctly</li>";
        echo "<li>Clear browser cache and try again</li>";
        echo "</ol>";
        echo "</div>";
    } else {
        echo "<div style='background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4caf50;'>";
        echo "<h4>✅ FILE LOOKS CORRECT!</h4>";
        echo "<p>Your index.php contains the right code. The issue might be:</p>";
        echo "<ol>";
        echo "<li>Browser cache - try Ctrl+F5</li>";
        echo "<li>JavaScript error - check console (F12)</li>";
        echo "<li>CSS issue - check if styles are loading</li>";
        echo "</ol>";
        echo "</div>";
    }
} else {
    echo "<p style='color: red;'>❌ Could not read index.php file</p>";
}

echo "<p style='margin-top: 30px;'><a href='index.php' style='background: #3182ce; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;'>→ Back to Schedule Interface</a></p>";
?>

<style>
.schedule-input {
    width: 100%;
    min-height: 60px;
    height: auto;
    padding: 12px;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.9rem;
    line-height: 1.5;
    background: white;
    color: #2d3748;
    transition: all 0.3s ease;
    resize: none;
    font-family: inherit;
    overflow: hidden;
    word-wrap: break-word;
    box-sizing: border-box;
}

.gm-input {
    border-color: #d69e2e;
    background: #fffbf0;
}

.gm-input:focus {
    border-color: #d69e2e;
    box-shadow: 0 0 0 3px rgba(214, 158, 46, 0.1);
    background: #fffff0;
}
</style>