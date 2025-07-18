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

// Get all skills with user's progress
try {
    $stmt = $pdo->prepare("
        SELECT 
            s.id,
            s.skill_name,
            s.skill_description,
            s.points_not_started,
            s.points_progressing,
            s.points_proficient,
            COALESCE(us.status, 'not_started') as user_status
        FROM skills s
        LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = ?
        ORDER BY s.order_index
    ");
    $stmt->execute([$_SESSION['user_id']]);
    $skills = $stmt->fetchAll();
    
    // Get resources for each skill
    $resources = [];
    foreach ($skills as $skill) {
        $stmt = $pdo->prepare("
            SELECT resource_name, resource_url, resource_description
            FROM resources 
            WHERE skill_id = ? 
            ORDER BY order_index
        ");
        $stmt->execute([$skill['id']]);
        $resources[$skill['id']] = $stmt->fetchAll();
    }
    
    // Calculate progress
    $total_earned = 0;
    $total_possible = 0;
    
    foreach ($skills as $skill) {
        $total_possible += $skill['points_proficient'];
        switch ($skill['user_status']) {
            case 'not_started':
                $total_earned += $skill['points_not_started'];
                break;
            case 'progressing':
                $total_earned += $skill['points_progressing'];
                break;
            case 'proficient':
                $total_earned += $skill['points_proficient'];
                break;
        }
    }
    
    $progress_percentage = $total_possible > 0 ? round(($total_earned / $total_possible) * 100) : 0;
    
} catch(PDOException $e) {
    $skills = [];
    $resources = [];
    $progress_percentage = 0;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL Hub - Skills</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>ASL Hub - Skills</h1>
            <div class="user-info">
                <span>Welcome, <?php echo htmlspecialchars($_SESSION['user_first_name'] . ' ' . $_SESSION['user_last_name']); ?>!</span>
                <a href="dashboard.php" class="back-btn">← Back to Dashboard</a>
                <a href="logout.php" class="logout-btn">Logout</a>
            </div>
        </header>
        
        <div class="dashboard-container">
            <div class="user-info-box">
                <div class="user-name">
                    <?php echo htmlspecialchars($_SESSION['user_first_name'] . ' ' . $_SESSION['user_last_name']); ?>
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
                <button class="sidebar-button active" onclick="showContent('skills')">Skills</button>
                <button class="sidebar-button" onclick="goBack()">Scroller Game</button>
                <button class="sidebar-button" onclick="goBack()">Coming Soon</button>
                <button class="sidebar-button" onclick="goBack()">Coming Soon</button>
                <button class="sidebar-button" onclick="goBack()">Coming Soon</button>
                <button class="sidebar-button" onclick="goBack()">Coming Soon</button>
            </div>
            
            <div class="main-content">
                <div class="skills-container">
                    <h2>Your ASL Skills Progress</h2>
                    <p>Track your progress through each skill. Click the buttons to update your status and watch your progress bar grow!</p>
                    
                    <!-- Search Bar -->
                    <div class="search-container">
                        <input type="text" id="skillSearch" class="search-input" placeholder="Search skills..." onkeyup="filterSkills()">
                        <button class="search-clear" onclick="clearSearch()">Clear</button>
                        <div class="search-results">
                            <span id="searchResults"><?php echo count($skills); ?> skills found</span>
                        </div>
                    </div>
                    
                    <?php foreach ($skills as $skill): ?>
                        <div class="skill-item" id="skill-<?php echo $skill['id']; ?>">
                            <div class="skill-header">
                                <?php echo htmlspecialchars($skill['skill_name']); ?>
                            </div>
                            
                            <div class="skill-buttons">
                                <button class="skill-button not-started <?php echo $skill['user_status'] === 'not_started' ? 'active' : ''; ?>" 
                                        onclick="updateSkillStatus(<?php echo $skill['id']; ?>, 'not_started')">
                                    Not Started
                                </button>
                                <button class="skill-button progressing <?php echo $skill['user_status'] === 'progressing' ? 'active' : ''; ?>" 
                                        onclick="updateSkillStatus(<?php echo $skill['id']; ?>, 'progressing')">
                                    Progressing
                                </button>
                                <button class="skill-button proficient <?php echo $skill['user_status'] === 'proficient' ? 'active' : ''; ?>" 
                                        onclick="updateSkillStatus(<?php echo $skill['id']; ?>, 'proficient')">
                                    Proficient
                                </button>
                            </div>
                            
                            <?php if (!empty($resources[$skill['id']])): ?>
                                <div class="skill-resources">
                                    <h4>Resources</h4>
                                    <div class="resources-list">
                                        <?php foreach ($resources[$skill['id']] as $resource): ?>
                                            <a href="<?php echo htmlspecialchars($resource['resource_url']); ?>" 
                                               class="resource-item" 
                                               target="_blank"
                                               title="<?php echo htmlspecialchars($resource['resource_description'] ?? ''); ?>">
                                                <?php echo htmlspecialchars($resource['resource_name']); ?>
                                            </a>
                                        <?php endforeach; ?>
                                    </div>
                                </div>
                            <?php else: ?>
                                <div class="skill-resources">
                                    <h4>Resources</h4>
                                    <div class="resources-list">
                                        <span style="color: #4a5568; font-size: 0.9rem;">No resources yet</span>
                                    </div>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                    
                    <?php if (empty($skills)): ?>
                        <div class="skill-item">
                            <div class="skill-header">No Skills Available</div>
                            <p style="text-align: center; color: #4a5568;">
                                Your teacher hasn't added any skills yet. Check back later!
                            </p>
                        </div>
                    <?php endif; ?>
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
        
        function updateSkillStatus(skillId, status) {
            // Show loading state
            const skillItem = document.getElementById('skill-' + skillId);
            const buttons = skillItem.querySelectorAll('.skill-button');
            
            buttons.forEach(button => {
                button.disabled = true;
                button.style.opacity = '0.7';
            });
            
            // Send AJAX request
            fetch('update_skill_status.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'skill_id=' + skillId + '&status=' + status
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Update button states
                    buttons.forEach(button => {
                        button.classList.remove('active');
                        button.disabled = false;
                        button.style.opacity = '1';
                    });
                    
                    // Activate the selected button
                    const activeButton = skillItem.querySelector('.skill-button.' + status);
                    if (activeButton) {
                        activeButton.classList.add('active');
                    }
                    
                    // Update progress bar
                    updateProgressBar(data.progress_percentage);
                    
                    // Show success message briefly
                    showMessage('Progress updated!', 'success');
                } else {
                    // Re-enable buttons on error
                    buttons.forEach(button => {
                        button.disabled = false;
                        button.style.opacity = '1';
                    });
                    
                    showMessage('Error updating progress. Please try again.', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                
                // Re-enable buttons on error
                buttons.forEach(button => {
                    button.disabled = false;
                    button.style.opacity = '1';
                });
                
                showMessage('Error updating progress. Please try again.', 'error');
            });
        }
        
        function updateProgressBar(percentage) {
            const progressFill = document.querySelector('.progress-fill');
            const progressText = document.querySelector('.progress-text');
            
            // Remove all color classes
            progressFill.classList.remove('progress-0-50', 'progress-51-75', 'progress-76-100');
            
            // Apply appropriate color class based on percentage
            if (percentage <= 50) {
                progressFill.classList.add('progress-0-50');
            } else if (percentage <= 75) {
                progressFill.classList.add('progress-51-75');
            } else {
                progressFill.classList.add('progress-76-100');
            }
            
            progressFill.style.width = percentage + '%';
            progressText.textContent = percentage + '%';
        }
        
        function showMessage(message, type) {
            // Create and show a temporary message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            messageDiv.textContent = message;
            messageDiv.style.position = 'fixed';
            messageDiv.style.top = '20px';
            messageDiv.style.right = '20px';
            messageDiv.style.zIndex = '1000';
            messageDiv.style.padding = '10px 15px';
            messageDiv.style.borderRadius = '5px';
            messageDiv.style.fontWeight = '500';
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.remove();
            }, 3000);
        }
        
        function goBack() {
            window.location.href = 'dashboard.php';
        }
        
        // Search functionality
        function filterSkills() {
            const searchTerm = document.getElementById('skillSearch').value.toLowerCase();
            const skillItems = document.querySelectorAll('.skill-item');
            let visibleCount = 0;
            
            skillItems.forEach(item => {
                const skillName = item.querySelector('.skill-header').textContent.toLowerCase();
                const skillDescription = item.querySelector('p');
                const description = skillDescription ? skillDescription.textContent.toLowerCase() : '';
                
                if (skillName.includes(searchTerm) || description.includes(searchTerm)) {
                    item.classList.remove('hidden');
                    visibleCount++;
                } else {
                    item.classList.add('hidden');
                }
            });
            
            document.getElementById('searchResults').textContent = visibleCount + ' skills found';
        }
        
        function clearSearch() {
            document.getElementById('skillSearch').value = '';
            const skillItems = document.querySelectorAll('.skill-item');
            skillItems.forEach(item => {
                item.classList.remove('hidden');
            });
            document.getElementById('searchResults').textContent = skillItems.length + ' skills found';
        }
    </script>
</body>
</html>