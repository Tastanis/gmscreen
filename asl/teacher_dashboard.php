<?php
session_start();
require_once 'config.php';

// Check if user is logged in and is a teacher
if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    header('Location: index.php');
    exit;
}

// Get all students and their progress
try {
    $stmt = $pdo->prepare("
        SELECT 
            u.id,
            u.first_name,
            u.last_name,
            u.email,
            COALESCE(
                SUM(CASE 
                    WHEN us.status = 'not_started' THEN s.points_not_started
                    WHEN us.status = 'progressing' THEN s.points_progressing
                    WHEN us.status = 'proficient' THEN s.points_proficient
                    ELSE 0
                END), 0
            ) as earned_points,
            COALESCE(
                (SELECT SUM(points_proficient) FROM skills), 0
            ) as total_possible_points
        FROM users u
        LEFT JOIN user_skills us ON u.id = us.user_id
        LEFT JOIN skills s ON us.skill_id = s.id
        WHERE u.is_teacher = FALSE
        GROUP BY u.id, u.first_name, u.last_name, u.email
        ORDER BY u.first_name, u.last_name
    ");
    $stmt->execute();
    $students = $stmt->fetchAll();
    
    // Get total skills count
    $stmt = $pdo->prepare("SELECT COUNT(*) as total_skills FROM skills");
    $stmt->execute();
    $total_skills = $stmt->fetchColumn();
    
    // Get skills summary
    $stmt = $pdo->prepare("
        SELECT 
            s.skill_name,
            COUNT(CASE WHEN us.status = 'not_started' OR us.status IS NULL THEN 1 END) as not_started,
            COUNT(CASE WHEN us.status = 'progressing' THEN 1 END) as progressing,
            COUNT(CASE WHEN us.status = 'proficient' THEN 1 END) as proficient
        FROM skills s
        LEFT JOIN user_skills us ON s.id = us.skill_id
        LEFT JOIN users u ON us.user_id = u.id AND u.is_teacher = FALSE
        GROUP BY s.id, s.skill_name
        ORDER BY s.order_index
    ");
    $stmt->execute();
    $skills_summary = $stmt->fetchAll();
    
} catch(PDOException $e) {
    $students = [];
    $total_skills = 0;
    $skills_summary = [];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL Hub - Teacher Dashboard</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>ASL Hub - Teacher Dashboard</h1>
            <div class="user-info">
                <span>Welcome, <?php echo htmlspecialchars($_SESSION['user_first_name'] . ' ' . $_SESSION['user_last_name']); ?>!</span>
                <a href="logout.php" class="logout-btn">Logout</a>
            </div>
        </header>
        
        <div class="teacher-dashboard">
            <div class="main-content">
                <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                    <button class="form-button" onclick="showSection('students')" id="students-btn">Student Progress</button>
                    <button class="form-button" onclick="showSection('skills')" id="skills-btn">Skills Overview</button>
                    <button class="form-button" onclick="showSection('manage')" id="manage-btn">Manage Skills</button>
                    <button class="form-button" onclick="showSection('scroller')" id="scroller-btn">Scroller Game</button>
                </div>
                
                <!-- Students Section -->
                <div id="students-section">
                    <h2>Student Progress Overview</h2>
                    <p>Total Students: <strong><?php echo count($students); ?></strong> | Total Skills: <strong><?php echo $total_skills; ?></strong></p>
                    
                    <div class="students-grid">
                        <?php foreach ($students as $student): ?>
                            <?php
                            $progress_percentage = $student['total_possible_points'] > 0 ? 
                                round(($student['earned_points'] / $student['total_possible_points']) * 100) : 0;
                            ?>
                            <div class="student-card">
                                <div class="student-name">
                                    <?php echo htmlspecialchars($student['first_name'] . ' ' . $student['last_name']); ?>
                                </div>
                                <div class="student-email">
                                    <?php echo htmlspecialchars($student['email']); ?>
                                </div>
                                <div class="student-progress">
                                    <div class="student-progress-bar">
                                        <div class="student-progress-fill 
                                            <?php 
                                                if ($progress_percentage <= 50) {
                                                    echo 'progress-0-50';
                                                } elseif ($progress_percentage <= 75) {
                                                    echo 'progress-51-75';
                                                } else {
                                                    echo 'progress-76-100';
                                                }
                                            ?>" 
                                            style="width: <?php echo $progress_percentage; ?>%"></div>
                                    </div>
                                    <div class="student-progress-text">
                                        <?php echo $progress_percentage; ?>% Complete
                                    </div>
                                </div>
                                <div class="student-stats">
                                    <small>
                                        Points: <?php echo $student['earned_points']; ?> / <?php echo $student['total_possible_points']; ?>
                                    </small>
                                </div>
                                <button class="form-button" onclick="viewStudentDetails(<?php echo $student['id']; ?>)" style="margin-top: 10px; font-size: 0.9rem; padding: 6px 12px;">
                                    View Details
                                </button>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                
                <!-- Skills Overview Section -->
                <div id="skills-section" style="display: none;">
                    <h2>Skills Overview</h2>
                    <p>Progress summary across all skills and students</p>
                    
                    <div class="skills-summary">
                        <?php 
                        // Get all skills with their IDs for the action buttons
                        $stmt = $pdo->prepare("SELECT id, skill_name, skill_description FROM skills ORDER BY order_index");
                        $stmt->execute();
                        $all_skills = $stmt->fetchAll();
                        
                        foreach ($all_skills as $skill): 
                            // Find the corresponding skill summary
                            $skill_summary = null;
                            foreach ($skills_summary as $summary) {
                                if ($summary['skill_name'] === $skill['skill_name']) {
                                    $skill_summary = $summary;
                                    break;
                                }
                            }
                            
                            if (!$skill_summary) {
                                $skill_summary = [
                                    'skill_name' => $skill['skill_name'],
                                    'not_started' => 0,
                                    'progressing' => 0,
                                    'proficient' => 0
                                ];
                            }
                        ?>
                            <div class="skill-summary-card">
                                <div class="skill-summary-header">
                                    <h3><?php echo htmlspecialchars($skill_summary['skill_name']); ?></h3>
                                    <div class="skill-actions">
                                        <button class="action-btn edit-btn" onclick="editSkill(<?php echo $skill['id']; ?>, '<?php echo htmlspecialchars($skill['skill_name']); ?>', '<?php echo htmlspecialchars($skill['skill_description']); ?>')">Edit</button>
                                        <button class="action-btn resources-btn" onclick="manageResources(<?php echo $skill['id']; ?>, '<?php echo htmlspecialchars($skill['skill_name']); ?>')">Resources</button>
                                        <button class="action-btn delete-btn" onclick="deleteSkill(<?php echo $skill['id']; ?>, '<?php echo htmlspecialchars($skill['skill_name']); ?>')">Delete</button>
                                    </div>
                                </div>
                                <div class="skill-stats">
                                    <div class="stat-item">
                                        <span class="stat-label">Not Started:</span>
                                        <span class="stat-value not-started"><?php echo $skill_summary['not_started']; ?></span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Progressing:</span>
                                        <span class="stat-value progressing"><?php echo $skill_summary['progressing']; ?></span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Proficient:</span>
                                        <span class="stat-value proficient"><?php echo $skill_summary['proficient']; ?></span>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                
                <!-- Manage Skills Section -->
                <div id="manage-section" style="display: none;">
                    <h2>Manage Skills</h2>
                    <p>Add, edit, or remove skills and resources</p>
                    
                    <div class="manage-actions">
                        <button class="form-button" onclick="showAddSkillForm()" style="background: #28a745;">
                            Add New Skill
                        </button>
                        <button class="form-button" onclick="exportProgress()" style="background: #17a2b8;">
                            Export Progress Report
                        </button>
                    </div>
                    
                    <div id="add-skill-form" style="display: none; margin-top: 20px; padding: 20px; background: rgba(247, 250, 252, 0.8); border-radius: 12px;">
                        <h3>Add New Skill</h3>
                        <form id="new-skill-form">
                            <div class="form-group">
                                <label>Skill Name</label>
                                <input type="text" name="skill_name" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label>Skill Description</label>
                                <textarea name="skill_description" class="form-input" rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label>Resources (one per line)</label>
                                <textarea name="resources" class="form-input" rows="5" placeholder="Resource Name 1&#10;Resource Name 2&#10;Resource Name 3"></textarea>
                            </div>
                            <button type="submit" class="form-button">Add Skill</button>
                            <button type="button" class="form-button" onclick="hideAddSkillForm()" style="background: #6c757d;">Cancel</button>
                        </form>
                    </div>
                </div>
                
                <!-- Scroller Game Section -->
                <div id="scroller-section" style="display: none;">
                    <h2>Scroller Game Management</h2>
                    <p>Create and manage word lists for the scroller game, and control active sessions</p>
                    
                    <!-- Active Session Display -->
                    <div id="active-session-display" style="display: none; margin-bottom: 30px; padding: 20px; background: rgba(72, 187, 120, 0.1); border-radius: 12px; border: 2px solid #48bb78;">
                        <h3 style="margin-top: 0; color: #22543d;">Active Game Session</h3>
                        <div id="session-info-content">
                            <!-- Session info will be displayed here -->
                        </div>
                    </div>
                    
                    <div class="scroller-management">
                        <div class="scroller-actions">
                            <button class="form-button" onclick="showAddWordlistForm()" style="background: #28a745;">
                                Create New Word List
                            </button>
                            <button class="form-button" onclick="refreshWordlists()" style="background: #17a2b8;">
                                Refresh
                            </button>
                        </div>
                        
                        <div id="workflow-instructions" style="margin-top: 15px; padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3;">
                            <h4 style="margin-top: 0; color: #1976d2;">How to Start a Game Session:</h4>
                            <ol style="margin: 0; color: #1565c0;">
                                <li><strong>Create or activate a word list</strong> - Click "Activate" on any word list below</li>
                                <li><strong>Start a session</strong> - Click "Start Session" button that appears on active word lists</li>
                                <li><strong>Share the session code</strong> - Give the code to your students to join</li>
                                <li><strong>Begin the display</strong> - Click "Start Scrolling Display" when ready</li>
                            </ol>
                        </div>
                        
                        <div id="add-wordlist-form" style="display: none; margin-top: 20px; padding: 20px; background: rgba(247, 250, 252, 0.8); border-radius: 12px;">
                            <h3>Create New Word List</h3>
                            <form id="new-wordlist-form">
                                <div class="form-group">
                                    <label>Word List Name</label>
                                    <input type="text" name="wordlist_name" class="form-input" required placeholder="e.g., Basic Vocabulary">
                                </div>
                                <div class="form-group">
                                    <label>Words (paste one per line or comma-separated)</label>
                                    <textarea name="words" class="form-input" rows="8" required placeholder="hello&#10;world&#10;sign&#10;deaf&#10;..."></textarea>
                                </div>
                                <div class="form-group">
                                    <label>Default Speed (0.5 - 2.0)</label>
                                    <input type="number" name="speed" class="form-input" min="0.5" max="2.0" step="0.1" value="1.0" required>
                                </div>
                                <div class="form-group">
                                    <label>Default Word Count (5 - 50)</label>
                                    <input type="number" name="word_count" class="form-input" min="5" max="50" value="24" required>
                                </div>
                                <button type="submit" class="form-button">Create Word List</button>
                                <button type="button" class="form-button" onclick="hideAddWordlistForm()" style="background: #6c757d;">Cancel</button>
                            </form>
                        </div>
                        
                        <!-- Create Session Form -->
                        <div id="create-session-form" style="display: none; margin-top: 20px; padding: 20px; background: rgba(247, 250, 252, 0.8); border-radius: 12px;">
                            <h3>Start New Game Session</h3>
                            <form id="new-session-form">
                                <div class="form-group">
                                    <label>Select Word Lists</label>
                                    <div id="session-wordlists" style="display: flex; flex-direction: column; gap: 4px;"></div>
                                </div>
                                <div class="form-group">
                                    <label>Override Speed (0.5 - 2.0)</label>
                                    <input type="number" name="speed" class="form-input" min="0.5" max="2.0" step="0.1" placeholder="Default">
                                </div>
                                <div class="form-group">
                                    <label>Override Word Count (5 - 50)</label>
                                    <input type="number" name="word_count" class="form-input" min="5" max="50" placeholder="Default">
                                </div>
                                <div class="form-group">
                                    <label>Custom Seed (Optional - leave empty for random)</label>
                                    <input type="number" name="custom_seed" class="form-input" placeholder="e.g., 12345" min="1" max="2147483647">
                                    <small style="color: #666;">Students who join with the same seed will see words in the same order</small>
                                </div>
                                <button type="submit" class="form-button" style="background: #4299e1;">Create Session</button>
                                <button type="button" class="form-button" onclick="hideCreateSessionForm()" style="background: #6c757d;">Cancel</button>
                            </form>
                        </div>
                        
                        <div id="wordlists-container" style="margin-top: 30px;">
                            <h3>Your Word Lists</h3>
                            <div id="wordlists-list">
                                <!-- Word lists will be loaded here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Edit Wordlist Modal -->
    <div id="edit-wordlist-modal" class="resources-modal-overlay" style="display: none;">
        <div class="resources-modal-container">
            <div class="resources-modal-header">
                <h2>Edit Word List</h2>
                <button class="modal-close-btn" onclick="closeEditWordlistModal()">&times;</button>
            </div>
            
            <div class="resources-modal-content">
                <form id="edit-wordlist-form">
                    <input type="hidden" id="edit-wordlist-id" name="wordlist_id">
                    <div class="form-group">
                        <label for="edit-wordlist-name">Word List Name</label>
                        <input type="text" id="edit-wordlist-name" name="wordlist_name" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-words">Words (one per line or comma-separated)</label>
                        <textarea id="edit-words" name="words" class="form-input" rows="8" required></textarea>
                    </div>
                    <div class="form-group">
                        <label for="edit-speed">Default Speed (0.5 - 2.0)</label>
                        <input type="number" id="edit-speed" name="speed" class="form-input" min="0.5" max="2.0" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-word-count">Default Word Count (5 - 50)</label>
                        <input type="number" id="edit-word-count" name="word_count" class="form-input" min="5" max="50" required>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" class="form-button">Update Word List</button>
                        <button type="button" class="form-button" onclick="closeEditWordlistModal()" style="background: #6c757d;">Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Resource Management Modal -->
    <div id="resources-modal" class="resources-modal-overlay">
        <div class="resources-modal-container">
            <div class="resources-modal-header">
                <h2 id="resources-modal-title">Manage Resources</h2>
                <button class="modal-close-btn" onclick="closeResourcesModal()">&times;</button>
            </div>
            
            <div class="resources-modal-content">
                <div class="resources-section">
                    <h3>Current Resources</h3>
                    <div id="resources-list"></div>
                </div>
                
                <div class="add-resource-section">
                    <h3>Add New Resource</h3>
                    <form id="add-resource-form" class="add-resource-form">
                        <div class="form-group">
                            <label for="resource_name">Resource Name</label>
                            <input type="text" id="resource_name" name="resource_name" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label for="resource_url">Resource URL</label>
                            <input type="url" id="resource_url" name="resource_url" class="form-input" required placeholder="https://example.com">
                        </div>
                        <div class="form-group">
                            <label for="resource_description">Description (Optional)</label>
                            <textarea id="resource_description" name="resource_description" class="form-input" rows="3" placeholder="Brief description of this resource"></textarea>
                        </div>
                        <button type="submit" class="form-button">Add Resource</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function showSection(sectionName) {
            // Hide all sections
            document.getElementById('students-section').style.display = 'none';
            document.getElementById('skills-section').style.display = 'none';
            document.getElementById('manage-section').style.display = 'none';
            document.getElementById('scroller-section').style.display = 'none';
            
            // Remove active class from all buttons
            document.getElementById('students-btn').classList.remove('active');
            document.getElementById('skills-btn').classList.remove('active');
            document.getElementById('manage-btn').classList.remove('active');
            document.getElementById('scroller-btn').classList.remove('active');
            
            // Show selected section and activate button
            document.getElementById(sectionName + '-section').style.display = 'block';
            document.getElementById(sectionName + '-btn').classList.add('active');
            
            // Load section-specific content
            if (sectionName === 'scroller') {
                loadWordlists();
            }
        }
        
        function viewStudentDetails(studentId) {
            // This would open a modal or redirect to detailed student view
            alert('Student details functionality coming soon! Student ID: ' + studentId);
        }
        
        function showAddSkillForm() {
            document.getElementById('add-skill-form').style.display = 'block';
        }
        
        function hideAddSkillForm() {
            document.getElementById('add-skill-form').style.display = 'none';
            document.getElementById('new-skill-form').reset();
        }
        
        function exportProgress() {
            // This would generate and download a progress report
            alert('Export functionality coming soon!');
        }
        
        
        // Set initial active state
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('students-btn').classList.add('active');
            
            // Add form submission handler
            document.getElementById('new-skill-form').addEventListener('submit', function(e) {
                e.preventDefault();
                submitNewSkill();
            });
            
            // Add scroller wordlist form submission handler
            document.getElementById('new-wordlist-form').addEventListener('submit', function(e) {
                e.preventDefault();
                submitNewWordlist();
            });
            
            // Add session form submission handler
            document.getElementById('new-session-form').addEventListener('submit', function(e) {
                e.preventDefault();
                submitNewSession();
            });
            
            // Add edit wordlist form submission handler
            document.getElementById('edit-wordlist-form').addEventListener('submit', function(e) {
                e.preventDefault();
                submitEditWordlist();
            });
        });
        
        function submitNewSkill() {
            const form = document.getElementById('new-skill-form');
            const formData = new FormData(form);
            const submitButton = form.querySelector('button[type="submit"]');
            
            // Show loading state
            submitButton.disabled = true;
            submitButton.textContent = 'Adding Skill...';
            
            fetch('add_skill.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage('Skill added successfully!', 'success');
                    form.reset();
                    hideAddSkillForm();
                    
                    // Refresh the page to show new skill
                    setTimeout(() => {
                        location.reload();
                    }, 1500);
                } else {
                    showMessage(data.message || 'Error adding skill', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showMessage('Error adding skill. Please try again.', 'error');
            })
            .finally(() => {
                // Reset button state
                submitButton.disabled = false;
                submitButton.textContent = 'Add Skill';
            });
        }

        function loadWordlists() {
            fetch('get_wordlists.php')
                .then(response => response.json())
                .then(data => {
                    const listContainer = document.getElementById('wordlists-list');
                    const sessionContainer = document.getElementById('session-wordlists');
                    if (!listContainer || !sessionContainer) return;
                    listContainer.innerHTML = '';
                    sessionContainer.innerHTML = '';
                    data.wordlists.forEach(list => {
                        const listDiv = document.createElement('div');
                        listDiv.className = 'wordlist-item';
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = list.wordlist_name;
                        listDiv.appendChild(nameSpan);

                        const editBtn = document.createElement('button');
                        editBtn.className = 'action-btn edit-btn';
                        editBtn.textContent = 'Edit';
                        editBtn.addEventListener('click', () => showEditWordlistModal(list));
                        listDiv.appendChild(editBtn);

                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'action-btn delete-btn';
                        deleteBtn.textContent = 'Delete';
                        deleteBtn.addEventListener('click', () => deleteWordlist(list.id));
                        listDiv.appendChild(deleteBtn);

                        listContainer.appendChild(listDiv);

                        const label = document.createElement('label');
                        label.style.marginBottom = '4px';
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.name = 'wordlist_ids[]';
                        checkbox.value = list.id;
                        checkbox.dataset.name = list.wordlist_name;
                        label.appendChild(checkbox);
                        label.append(' ' + list.wordlist_name);
                        sessionContainer.appendChild(label);
                    });
                })
                .catch(error => {
                    console.error('Error loading word lists:', error);
                });
        }

        function showAddWordlistForm() {
            document.getElementById('add-wordlist-form').style.display = 'block';
        }

        function hideAddWordlistForm() {
            document.getElementById('add-wordlist-form').style.display = 'none';
            document.getElementById('new-wordlist-form').reset();
        }

        function refreshWordlists() {
            loadWordlists();
        }

        function submitNewWordlist() {
            const form = document.getElementById('new-wordlist-form');
            const formData = new FormData(form);
            fetch('add_wordlist.php', { method: 'POST', body: formData })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showMessage('Word list created!', 'success');
                        hideAddWordlistForm();
                        loadWordlists();
                    } else {
                        showMessage(data.message || 'Error creating word list', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error creating word list:', error);
                    showMessage('Error creating word list. Please try again.', 'error');
                });
        }

        function showEditWordlistModal(list) {
            document.getElementById('edit-wordlist-id').value = list.id;
            document.getElementById('edit-wordlist-name').value = list.wordlist_name;
            document.getElementById('edit-words').value = (list.words || []).join('\n');
            document.getElementById('edit-speed').value = list.speed;
            document.getElementById('edit-word-count').value = list.word_count;
            document.getElementById('edit-wordlist-modal').style.display = 'block';
        }

        function closeEditWordlistModal() {
            document.getElementById('edit-wordlist-modal').style.display = 'none';
        }

        function submitEditWordlist() {
            const form = document.getElementById('edit-wordlist-form');
            const formData = new FormData(form);
            fetch('edit_wordlist.php', { method: 'POST', body: formData })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showMessage('Word list updated!', 'success');
                        closeEditWordlistModal();
                        loadWordlists();
                    } else {
                        showMessage(data.message || 'Error updating word list', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error updating word list:', error);
                    showMessage('Error updating word list. Please try again.', 'error');
                });
        }

        function deleteWordlist(id) {
            if (!confirm('Delete this word list?')) return;
            const formData = new FormData();
            formData.append('wordlist_id', id);
            fetch('delete_wordlist.php', { method: 'POST', body: formData })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showMessage('Word list deleted', 'success');
                        loadWordlists();
                    } else {
                        showMessage(data.message || 'Error deleting word list', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error deleting word list:', error);
                    showMessage('Error deleting word list. Please try again.', 'error');
                });
        }

        function showCreateSessionForm() {
            document.getElementById('create-session-form').style.display = 'block';
        }

        function hideCreateSessionForm() {
            document.getElementById('create-session-form').style.display = 'none';
            document.getElementById('new-session-form').reset();
        }

        function submitNewSession() {
            const form = document.getElementById('new-session-form');
            const selected = Array.from(form.querySelectorAll('input[name="wordlist_ids[]"]:checked'));
            if (selected.length === 0) {
                showMessage('Please select at least one word list', 'error');
                return;
            }

            const formData = new FormData();
            selected.forEach(cb => formData.append('wordlist_ids[]', cb.value));
            if (form.speed.value) formData.append('speed', form.speed.value);
            if (form.word_count.value) formData.append('word_count', form.word_count.value);
            if (form.custom_seed.value) formData.append('custom_seed', form.custom_seed.value);

            fetch('create_session.php', { method: 'POST', body: formData })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const info = document.getElementById('session-info-content');
                        const names = selected.map(cb => cb.dataset.name).join(', ');
                        info.innerHTML = `<p><strong>Word Lists:</strong> ${names}</p>` +
                                         `<p><strong>Speed:</strong> ${data.speed ?? 'Default'}</p>` +
                                         `<p><strong>Word Count:</strong> ${data.word_count ?? 'Default'}</p>` +
                                         `<p><strong>Session Code:</strong> ${data.session_code}</p>`;
                        document.getElementById('active-session-display').style.display = 'block';
                        hideCreateSessionForm();
                        showMessage('Session created successfully!', 'success');
                    } else {
                        showMessage(data.message || 'Error creating session', 'error');
                    }
                })
                .catch(error => {
                    console.error('Error creating session:', error);
                    showMessage('Error creating session. Please try again.', 'error');
                });
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
            messageDiv.style.padding = '12px 20px';
            messageDiv.style.borderRadius = '8px';
            messageDiv.style.fontWeight = '500';
            messageDiv.style.maxWidth = '300px';
            
            if (type === 'success') {
                messageDiv.style.background = '#c6f6d5';
                messageDiv.style.color = '#22543d';
                messageDiv.style.border = '1px solid #48bb78';
            } else {
                messageDiv.style.background = '#feb2b2';
                messageDiv.style.color = '#742a2a';
                messageDiv.style.border = '1px solid #f56565';
            }
            
            document.body.appendChild(messageDiv);
            
            setTimeout(() => {
                messageDiv.remove();
            }, 3000);
        }
        
        // Edit skill function
        function editSkill(skillId, skillName, skillDescription) {
            const newName = prompt('Edit skill name:', skillName);
            if (newName === null) return; // User cancelled
            
            if (newName.trim() === '') {
                alert('Skill name cannot be empty');
                return;
            }
            
            const newDescription = prompt('Edit skill description:', skillDescription);
            if (newDescription === null) return; // User cancelled
            
            const formData = new FormData();
            formData.append('skill_id', skillId);
            formData.append('skill_name', newName.trim());
            formData.append('skill_description', newDescription.trim());
            
            fetch('edit_skill.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage(data.message, 'success');
                    setTimeout(() => {
                        location.reload();
                    }, 1500);
                } else {
                    showMessage(data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showMessage('Error updating skill. Please try again.', 'error');
            });
        }
        
        // Delete skill function
        function deleteSkill(skillId, skillName) {
            if (!confirm(`Are you sure you want to delete the skill "${skillName}"?\n\nThis will:\n- Delete the skill\n- Delete all associated resources\n- Remove all student progress for this skill\n\nThis action cannot be undone!`)) {
                return;
            }
            
            const formData = new FormData();
            formData.append('skill_id', skillId);
            
            fetch('delete_skill.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage(data.message, 'success');
                    setTimeout(() => {
                        location.reload();
                    }, 1500);
                } else {
                    showMessage(data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showMessage('Error deleting skill. Please try again.', 'error');
            });
        }
        
        // Manage resources function
        function manageResources(skillId, skillName) {
            openResourcesModal(skillId, skillName);
        }
        
        // Add helper function for HTML escaping if not already present
        function escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
        // Resource Management Modal Functions
        function openResourcesModal(skillId, skillName) {
            const modal = document.getElementById('resources-modal');
            const modalTitle = document.getElementById('resources-modal-title');
            const resourcesList = document.getElementById('resources-list');
            const addResourceForm = document.getElementById('add-resource-form');
            
            // Set modal title and store skill info
            modalTitle.textContent = `Manage Resources - ${skillName}`;
            modal.dataset.skillId = skillId;
            modal.dataset.skillName = skillName;
            
            // Clear form and show loading
            addResourceForm.reset();
            resourcesList.innerHTML = '<div class="resources-loading">Loading resources...</div>';
            
            // Show modal
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Load existing resources
            loadResources(skillId);
        }
        
        function closeResourcesModal() {
            const modal = document.getElementById('resources-modal');
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        function loadResources(skillId) {
            const resourcesList = document.getElementById('resources-list');
            const formData = new FormData();
            formData.append('action', 'get_resources');
            formData.append('skill_id', skillId);
            
            fetch('manage_resources.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayResources(data.resources);
                } else {
                    resourcesList.innerHTML = `<div class="resources-error">Error loading resources: ${data.message}</div>`;
                }
            })
            .catch(error => {
                console.error('Error loading resources:', error);
                resourcesList.innerHTML = '<div class="resources-error">Error loading resources. Please try again.</div>';
            });
        }
        
        function displayResources(resources) {
            const resourcesList = document.getElementById('resources-list');
            
            if (resources.length === 0) {
                resourcesList.innerHTML = '<div class="no-resources">No resources added yet. Add your first resource below!</div>';
                return;
            }
            
            let html = '';
            resources.forEach(resource => {
                html += `
                    <div class="resource-card" data-resource-id="${resource.id}">
                        <div class="resource-header">
                            <div class="resource-name">${escapeHtml(resource.resource_name)}</div>
                            <div class="resource-actions">
                                <button class="resource-action-btn edit-btn" onclick="editResource(${resource.id})">Edit</button>
                                <button class="resource-action-btn delete-btn" onclick="deleteResource(${resource.id})">Delete</button>
                            </div>
                        </div>
                        <div class="resource-url">
                            <a href="${escapeHtml(resource.resource_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(resource.resource_url)}</a>
                        </div>
                        ${resource.resource_description ? `<div class="resource-description">${escapeHtml(resource.resource_description)}</div>` : ''}
                    </div>
                `;
            });
            
            resourcesList.innerHTML = html;
        }
        
        function addResource() {
            const modal = document.getElementById('resources-modal');
            const skillId = modal.dataset.skillId;
            const form = document.getElementById('add-resource-form');
            const formData = new FormData(form);
            const submitBtn = form.querySelector('button[type="submit"]');
            
            formData.append('action', 'add_resource');
            formData.append('skill_id', skillId);
            
            // Show loading state
            submitBtn.disabled = true;
            submitBtn.textContent = 'Adding Resource...';
            
            fetch('manage_resources.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showResourceNotification('Resource added successfully!', 'success');
                    form.reset();
                    loadResources(skillId);
                } else {
                    showResourceNotification(data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error adding resource:', error);
                showResourceNotification('Error adding resource. Please try again.', 'error');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Add Resource';
            });
        }
        
        function editResource(resourceId) {
            const resourceCard = document.querySelector(`[data-resource-id="${resourceId}"]`);
            const nameElement = resourceCard.querySelector('.resource-name');
            const urlElement = resourceCard.querySelector('.resource-url a');
            const descriptionElement = resourceCard.querySelector('.resource-description');
            const actionsElement = resourceCard.querySelector('.resource-actions');
            
            // Store original values
            const originalName = nameElement.textContent;
            const originalUrl = urlElement.href;
            const originalDescription = descriptionElement ? descriptionElement.textContent : '';
            
            // Create edit form
            const editForm = `
                <div class="resource-edit-form">
                    <input type="text" class="edit-name" value="${escapeHtml(originalName)}" placeholder="Resource Name">
                    <input type="url" class="edit-url" value="${escapeHtml(originalUrl)}" placeholder="Resource URL">
                    <textarea class="edit-description" placeholder="Description (optional)">${escapeHtml(originalDescription)}</textarea>
                    <div class="edit-actions">
                        <button class="resource-action-btn save-btn" onclick="saveResourceEdit(${resourceId})">Save</button>
                        <button class="resource-action-btn cancel-btn" onclick="cancelResourceEdit(${resourceId})">Cancel</button>
                    </div>
                </div>
            `;
            
            // Replace content with edit form
            resourceCard.innerHTML = editForm;
            
            // Store original content for cancel
            resourceCard.dataset.originalContent = resourceCard.innerHTML;
        }
        
        function saveResourceEdit(resourceId) {
            const resourceCard = document.querySelector(`[data-resource-id="${resourceId}"]`);
            const modal = document.getElementById('resources-modal');
            const skillId = modal.dataset.skillId;
            
            const name = resourceCard.querySelector('.edit-name').value.trim();
            const url = resourceCard.querySelector('.edit-url').value.trim();
            const description = resourceCard.querySelector('.edit-description').value.trim();
            
            if (!name || !url) {
                showResourceNotification('Resource name and URL are required', 'error');
                return;
            }
            
            const formData = new FormData();
            formData.append('action', 'update_resource');
            formData.append('skill_id', skillId);
            formData.append('resource_id', resourceId);
            formData.append('resource_name', name);
            formData.append('resource_url', url);
            formData.append('resource_description', description);
            
            const saveBtn = resourceCard.querySelector('.save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            fetch('manage_resources.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showResourceNotification('Resource updated successfully!', 'success');
                    loadResources(skillId);
                } else {
                    showResourceNotification(data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error updating resource:', error);
                showResourceNotification('Error updating resource. Please try again.', 'error');
            });
        }
        
        function cancelResourceEdit(resourceId) {
            const modal = document.getElementById('resources-modal');
            const skillId = modal.dataset.skillId;
            loadResources(skillId);
        }
        
        function deleteResource(resourceId) {
            if (!confirm('Are you sure you want to delete this resource? This action cannot be undone.')) {
                return;
            }
            
            const modal = document.getElementById('resources-modal');
            const skillId = modal.dataset.skillId;
            
            const formData = new FormData();
            formData.append('action', 'delete_resource');
            formData.append('skill_id', skillId);
            formData.append('resource_id', resourceId);
            
            fetch('manage_resources.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showResourceNotification('Resource deleted successfully!', 'success');
                    loadResources(skillId);
                } else {
                    showResourceNotification(data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error deleting resource:', error);
                showResourceNotification('Error deleting resource. Please try again.', 'error');
            });
        }
        
        function showResourceNotification(message, type) {
            const notification = document.createElement('div');
            notification.className = `resource-notification ${type}`;
            notification.textContent = message;
            
            const modal = document.getElementById('resources-modal');
            modal.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Event listeners for modal
        document.addEventListener('DOMContentLoaded', function() {
            // Close modal when clicking outside
            document.addEventListener('click', function(e) {
                const modal = document.getElementById('resources-modal');
                if (e.target === modal) {
                    closeResourcesModal();
                }
            });
            
            // Close modal with ESC key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeResourcesModal();
                }
            });
            
            // Handle add resource form submission
            const addResourceForm = document.getElementById('add-resource-form');
            if (addResourceForm) {
                addResourceForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    addResource();
                });
            }
        });
    </script>
    
    <style>
        .teacher-dashboard .main-content {
            grid-column: 1 / -1;
        }
        
        .skill-summary-card {
            background: rgba(247, 250, 252, 0.8);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 2px solid #e2e8f0;
        }
        
        .skill-summary-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .skill-summary-card h3 {
            color: #2d3748;
            margin: 0;
            flex: 1;
        }
        
        .skill-actions {
            display: flex;
            gap: 8px;
        }
        
        .action-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        
        .edit-btn {
            background: #4299e1;
            color: white;
        }
        
        .edit-btn:hover {
            background: #3182ce;
        }
        
        .resources-btn {
            background: #38a169;
            color: white;
        }
        
        .resources-btn:hover {
            background: #2f855a;
        }
        
        .delete-btn {
            background: #e53e3e;
            color: white;
        }
        
        .delete-btn:hover {
            background: #c53030;
        }
        
        .skill-stats {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .stat-label {
            font-weight: 600;
            color: #4a5568;
        }
        
        .stat-value {
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            min-width: 24px;
            text-align: center;
        }
        
        .stat-value.not-started {
            background: #feb2b2;
            color: #742a2a;
        }
        
        .stat-value.progressing {
            background: #faf089;
            color: #744210;
        }
        
        .stat-value.proficient {
            background: #c6f6d5;
            color: #22543d;
        }
        
        .manage-actions {
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .student-email {
            font-size: 0.9rem;
            color: #4a5568;
            margin-bottom: 10px;
        }
        
        .student-stats {
            margin-top: 5px;
            color: #4a5568;
        }
        
        .form-button.active {
            background: linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%);
        }
    </style>
</body>
</html>