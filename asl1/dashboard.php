<?php
session_start();
require_once 'config.php';

// Check if user is logged in
if (!isset($_SESSION['user_id'])) {
    header('Location: index.php');
    exit;
}

// Redirect teachers to teacher dashboard
if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    header('Location: teacher_dashboard.php');
    exit;
}

$user_level = intval($_SESSION['user_level'] ?? 1);

// Get user's current class period
try {
    $stmt = $pdo->prepare("SELECT class_period FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $user_data = $stmt->fetch();
    $current_class_period = $user_data['class_period'] ?? null;
} catch(PDOException $e) {
    $current_class_period = null;
}

// Get user's progress
try {
    // Get total skills count
    $stmt = $pdo->prepare("SELECT COUNT(*) as total_skills FROM skills WHERE asl_level = ?");
    $stmt->execute([$user_level]);
    $total_skills = $stmt->fetchColumn();

    // Get user's skill progress
    $stmt = $pdo->prepare("
        SELECT
            SUM(CASE
                WHEN s.asl_level = ? AND us.status = 'not_started' THEN s.points_not_started
                WHEN s.asl_level = ? AND us.status = 'progressing' THEN s.points_progressing
                WHEN s.asl_level = ? AND us.status = 'proficient' THEN s.points_proficient
                ELSE 0
            END) as earned_points,
            SUM(CASE WHEN s.asl_level = ? THEN s.points_proficient ELSE 0 END) as total_possible_points
        FROM skills s
        LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = ?
        WHERE s.asl_level = ?
    ");
    $stmt->execute([$user_level, $user_level, $user_level, $user_level, $_SESSION['user_id'], $user_level]);
    $progress = $stmt->fetch();
    
    $earned_points = $progress['earned_points'] ?? 0;
    $total_possible_points = $progress['total_possible_points'] ?? 1;
    $progress_percentage = $total_possible_points > 0 ? round(($earned_points / $total_possible_points) * 100) : 0;
    
} catch(PDOException $e) {
    $progress_percentage = 0;
    $earned_points = 0;
    $total_possible_points = 0;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL Hub - Student Dashboard</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>ASL Hub</h1>
            <div class="user-info">
                <span>Welcome back!</span>
                <a href="logout.php" class="logout-btn">Logout</a>
            </div>
        </header>
        
        <div class="dashboard-container">
            <div class="user-info-box">
                <div class="user-name">
                    <?php echo htmlspecialchars($_SESSION['user_first_name'] . ' ' . $_SESSION['user_last_name']); ?>
                </div>
                <div class="class-period-section">
                    <label for="class-period-select">Class Period:</label>
                    <select id="class-period-select" onchange="updateClassPeriod(this.value)">
                        <option value="">Select Period</option>
                        <?php for ($i = 1; $i <= 6; $i++): ?>
                            <option value="<?php echo $i; ?>" <?php echo ($current_class_period == $i) ? 'selected' : ''; ?>>
                                Period <?php echo $i; ?>
                            </option>
                        <?php endfor; ?>
                    </select>
                </div>
            </div>
            
            <div class="progress-bar-container">
                <div class="progress-label">Skills Progress</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: <?php echo $progress_percentage; ?>%"></div>
                    <div class="progress-text"><?php echo $progress_percentage; ?>%</div>
                </div>
            </div>
            
            <div class="sidebar">
                <button class="sidebar-button" onclick="showContent('skills')">Skills</button>
                <button class="sidebar-button" onclick="window.open('scrollergame/index.html', '_blank')">Scroller Game</button>
                <button class="sidebar-button" onclick="showContent('coming-soon')">Coming Soon</button>
                <button class="sidebar-button" onclick="showContent('coming-soon')">Coming Soon</button>
                <button class="sidebar-button" onclick="showContent('coming-soon')">Coming Soon</button>
                <button class="sidebar-button" onclick="showContent('coming-soon')">Coming Soon</button>
            </div>
            
            <div class="main-content">
                <div id="welcome-content">
                    <h2>Welcome to Your ASL Learning Hub!</h2>
                    <p>Use the buttons on the right to navigate through different sections of your ASL learning experience.</p>
                    <ul>
                        <li><strong>Skills:</strong> Track your progress through various ASL skills and access learning resources</li>
                        <li><strong>Scroller Game:</strong> Practice ASL vocabulary with an interactive word scrolling game</li>
                        <li><strong>Coming Soon:</strong> More exciting features are being developed!</li>
                    </ul>
                    <p>Your current progress: <strong><?php echo $progress_percentage; ?>%</strong> complete</p>
                </div>
                
                <div id="skills-content" style="display: none;">
                    <h2>Loading Skills...</h2>
                    <p>Please wait while we load your skills page.</p>
                </div>
                
                <div id="coming-soon-content" style="display: none;">
                    <h2>Coming Soon</h2>
                    <p>We're working on exciting new features for your ASL learning experience!</p>
                    <p>Stay tuned for updates and new learning tools.</p>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Update progress bar with animation
        document.addEventListener('DOMContentLoaded', function() {
            const progressFill = document.querySelector('.progress-fill');
            const targetWidth = <?php echo $progress_percentage; ?>;
            
            // Apply appropriate color class based on percentage
            if (targetWidth <= 50) {
                progressFill.classList.add('progress-0-50');
            } else if (targetWidth <= 75) {
                progressFill.classList.add('progress-51-75');
            } else {
                progressFill.classList.add('progress-76-100');
            }
            
            setTimeout(() => {
                progressFill.style.width = targetWidth + '%';
            }, 500);
        });
        
        function showContent(contentType) {
            // Hide all content sections
            const allContent = document.querySelectorAll('[id$="-content"]');
            allContent.forEach(content => {
                content.style.display = 'none';
            });
            
            // Remove active class from all buttons
            const allButtons = document.querySelectorAll('.sidebar-button');
            allButtons.forEach(button => {
                button.classList.remove('active');
            });
            
            // Show selected content and activate button
            if (contentType === 'skills') {
                // Load skills page via AJAX or redirect
                window.location.href = 'skills.php';
            } else {
                const contentId = contentType + '-content';
                const targetContent = document.getElementById(contentId);
                if (targetContent) {
                    targetContent.style.display = 'block';
                }
                
                // Activate the clicked button
                event.target.classList.add('active');
            }
        }
        
        let originalClassPeriod = '<?php echo $current_class_period ?? ''; ?>';
        
        function updateClassPeriod(newPeriod) {
            if (newPeriod === originalClassPeriod) {
                return; // No change
            }
            
            if (originalClassPeriod && originalClassPeriod !== '') {
                // Show confirmation dialog if changing existing period
                if (!confirm(`Are you sure you wish to change your class period to ${newPeriod || 'unselected'}?`)) {
                    // Reset to original value
                    document.getElementById('class-period-select').value = originalClassPeriod;
                    return;
                }
            }
            
            // Send AJAX request to update class period
            fetch('update_class_period.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'class_period=' + encodeURIComponent(newPeriod)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    originalClassPeriod = newPeriod;
                    showMessage('Class period updated successfully!', 'success');
                } else {
                    // Reset to original value on error
                    document.getElementById('class-period-select').value = originalClassPeriod;
                    showMessage(data.message || 'Error updating class period', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                document.getElementById('class-period-select').value = originalClassPeriod;
                showMessage('Error updating class period. Please try again.', 'error');
            });
        }
        
        function showMessage(message, type) {
            // Create and show a temporary message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            messageDiv.textContent = message;
            messageDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                padding: 10px 15px;
                border-radius: 5px;
                font-weight: 500;
                background: ${type === 'success' ? '#48bb78' : '#f56565'};
                color: white;
            `;
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.remove();
            }, 3000);
        }
    </script>
</body>
</html>