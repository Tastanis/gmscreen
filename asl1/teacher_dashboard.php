<?php
session_start();
require_once 'config.php';
require_once __DIR__ . '/../common/asl_student_dashboard_data.php';

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
            u.class_period,
            u.level,
            COALESCE(
                SUM(CASE 
                    WHEN us.status = 'not_started' THEN s.points_not_started
                    WHEN us.status = 'progressing' THEN s.points_progressing
                    WHEN us.status = 'proficient' THEN s.points_proficient
                    ELSE 0
                END), 0
            ) as earned_points,
            COALESCE(
                (
                    SELECT SUM(points_proficient)
                    FROM skills
                    WHERE asl_level = COALESCE(u.level, 1) OR asl_level = 3
                ), 0
            ) as total_possible_points
        FROM users u
        LEFT JOIN user_skills us ON u.id = us.user_id
        LEFT JOIN skills s ON us.skill_id = s.id
            AND (s.asl_level = COALESCE(u.level, 1) OR s.asl_level = 3)
        WHERE u.is_teacher = FALSE
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.class_period, u.level
        ORDER BY u.first_name, u.last_name
    ");
    $stmt->execute();
    $students = $stmt->fetchAll();

    aslhubEnsureStudentDashboardSchema($pdo);
    $lt_total_targets = null;
    foreach ($students as &$student) {
        $lt_dashboard = aslhubFetchStudentDashboardData($pdo, (int) $student['id']);
        $student['earned_points'] = $lt_dashboard['overall']['earnedPoints'] ?? 0;
        $student['total_possible_points'] = $lt_dashboard['overall']['totalPoints'] ?? 0;
        $student['lt_total_targets'] = $lt_dashboard['overall']['totalTargets'] ?? 0;
        if ($lt_total_targets === null) {
            $lt_total_targets = $student['lt_total_targets'];
        }
    }
    unset($student);
    
    // Get total skills count
    $stmt = $pdo->prepare("SELECT COUNT(*) as total_skills FROM asl_learning_targets WHERE active = 1");
    $stmt->execute();
    $total_skills = $stmt->fetchColumn();
    
    // Get skills summary
    $stmt = $pdo->prepare("
        SELECT
            s.id,
            s.skill_name,
            s.asl_level,
            COUNT(CASE WHEN us.status = 'not_started' OR us.status IS NULL THEN 1 END) as not_started,
            COUNT(CASE WHEN us.status = 'progressing' THEN 1 END) as progressing,
            COUNT(CASE WHEN us.status = 'proficient' THEN 1 END) as proficient
        FROM skills s
        LEFT JOIN user_skills us ON s.id = us.skill_id
        LEFT JOIN users u ON us.user_id = u.id AND u.is_teacher = FALSE
            AND (s.asl_level = COALESCE(u.level, 1) OR s.asl_level = 3)
        GROUP BY s.id, s.skill_name, s.asl_level
        ORDER BY s.order_index
    ");
    $stmt->execute();
    $skills_summary = $stmt->fetchAll();
    
} catch(PDOException $e) {
    $students = [];
    $total_skills = 0;
    $skills_summary = [];
}

$aslhub_site_level = defined('ASLHUB_SITE_LEVEL') ? (int) ASLHUB_SITE_LEVEL : 1;
$standards_data = aslhubFetchTeacherStandardsData($pdo, $aslhub_site_level);
$standards_json = json_encode($standards_data, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
if ($standards_json === false) {
    $standards_json = '{}';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Teacher Dashboard</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body class="student-dashboard-page teacher-dashboard-page">
    <div class="student-shell">
        <header class="student-topbar">
            <div>
                <p class="student-kicker">ASL Hub</p>
                <h1>Teacher Dashboard</h1>
            </div>
            <nav class="student-actions" aria-label="Teacher tools">
                <span class="teacher-welcome">Welcome, <?php echo htmlspecialchars($_SESSION['user_first_name']); ?></span>
                <a class="logout-link" href="logout.php">Logout</a>
            </nav>
        </header>

        <nav class="teacher-tabs" aria-label="Dashboard sections">
            <button type="button" class="teacher-tab" onclick="showSection('students')" id="students-btn">Student Progress</button>
            <button type="button" class="teacher-tab" onclick="showSection('standards')" id="standards-btn">Standards</button>
            <button type="button" class="teacher-tab" onclick="showSection('scroller')" id="scroller-btn">Scroller Game</button>
            <button type="button" class="teacher-tab" onclick="window.location.href='bingo_dashboard.php'" id="bingo-btn">Bingo</button>
        </nav>

        <main class="student-dashboard">
            <!-- Students Section -->
            <section class="student-section" id="students-section">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Class Overview</p>
                        <h2>Student Progress</h2>
                    </div>
                    <p class="teacher-section-summary">
                        Showing <strong><span id="filtered-count"><?php echo count($students); ?></span></strong>
                        of <strong><span id="total-count"><?php echo count($students); ?></span></strong> students
                        <span class="teacher-dot" aria-hidden="true">&middot;</span>
                        <strong><?php echo $total_skills; ?></strong> learning targets
                    </p>
                </div>

                <div class="teacher-filter-bar">
                    <label class="teacher-filter-field teacher-filter-search">
                        <span>Search</span>
                        <input type="text" id="student-search" placeholder="Student name&hellip;">
                    </label>
                    <label class="teacher-filter-field">
                        <span>Period</span>
                        <select id="period-filter">
                            <option value="all">All Periods</option>
                            <option value="1">Period 1</option>
                            <option value="2">Period 2</option>
                            <option value="3">Period 3</option>
                            <option value="4">Period 4</option>
                            <option value="5">Period 5</option>
                            <option value="6">Period 6</option>
                            <option value="unassigned">Unassigned</option>
                        </select>
                    </label>
                    <label class="teacher-filter-field">
                        <span>Level</span>
                        <select id="level-filter">
                            <option value="all">All Levels</option>
                            <option value="1">ASL 1</option>
                            <option value="2">ASL 2</option>
                        </select>
                    </label>
                    <label class="teacher-filter-field">
                        <span>Sort by</span>
                        <select id="sort-filter">
                            <option value="first-asc">First name (A&ndash;Z)</option>
                            <option value="first-desc">First name (Z&ndash;A)</option>
                            <option value="last-asc">Last name (A&ndash;Z)</option>
                            <option value="last-desc">Last name (Z&ndash;A)</option>
                            <option value="progress-asc">Progress (low to high)</option>
                            <option value="progress-desc">Progress (high to low)</option>
                        </select>
                    </label>
                    <button type="button" class="teacher-filter-reset" onclick="resetFilters()">Reset</button>
                </div>

                <div class="students-grid" id="students-grid">
                    <?php foreach ($students as $student): ?>
                        <?php
                        $progress_percentage = $student['total_possible_points'] > 0 ?
                            round(($student['earned_points'] / $student['total_possible_points']) * 100) : 0;
                        $progress_class = $progress_percentage <= 50 ? 'progress-0-50'
                            : ($progress_percentage <= 75 ? 'progress-51-75' : 'progress-76-100');
                        $initials = htmlspecialchars(substr($student['first_name'] ?? 'A', 0, 1) . substr($student['last_name'] ?? 'S', 0, 1));
                        ?>
                        <article class="student-card"
                             data-first-name="<?php echo htmlspecialchars(strtolower($student['first_name'])); ?>"
                             data-last-name="<?php echo htmlspecialchars(strtolower($student['last_name'])); ?>"
                             data-period="<?php echo $student['class_period'] ?? 'unassigned'; ?>"
                             data-level="<?php echo $student['level'] ?? '1'; ?>"
                             data-progress="<?php echo $progress_percentage; ?>"
                             data-student-id="<?php echo $student['id']; ?>">
                            <header class="student-card-header">
                                <div class="student-card-avatar" aria-hidden="true"><?php echo $initials; ?></div>
                                <div class="student-card-identity">
                                    <h3 class="student-name"><?php echo htmlspecialchars($student['first_name'] . ' ' . $student['last_name']); ?></h3>
                                </div>
                            </header>
                            <div class="student-card-meta">
                                <span>Period <?php echo $student['class_period'] ?? '&mdash;'; ?></span>
                                <span>ASL <?php echo $student['level'] ?? '1'; ?></span>
                            </div>
                            <div class="student-progress">
                                <div class="student-progress-bar">
                                    <div class="student-progress-fill <?php echo $progress_class; ?>" style="width: <?php echo $progress_percentage; ?>%"></div>
                                </div>
                                <div class="student-progress-text">
                                    <span><?php echo $progress_percentage; ?>% complete</span>
                                    <span class="student-points"><?php echo $student['earned_points']; ?> / <?php echo $student['total_possible_points']; ?> pts</span>
                                </div>
                            </div>
                            <div class="student-card-actions">
                                <button type="button" class="teacher-btn teacher-btn-primary" onclick="viewStudentDetails(<?php echo $student['id']; ?>)">View Details</button>
                                <button type="button" class="teacher-btn teacher-btn-danger delete-student-button" onclick="deleteStudent(<?php echo $student['id']; ?>, '<?php echo htmlspecialchars($student['first_name'] . ' ' . $student['last_name'], ENT_QUOTES); ?>', this)">Delete</button>
                            </div>
                        </article>
                    <?php endforeach; ?>
                </div>
            </section>
                
            <!-- Standards Section -->
            <section class="student-section" id="standards-section" style="display: none;">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Standards &amp; Learning Targets</p>
                        <h2>Standards for ASL <?php echo (int) $aslhub_site_level; ?></h2>
                    </div>
                    <p>Click a bucket, then a standard, then add learning targets that will appear for every ASL <?php echo (int) $aslhub_site_level; ?> student.</p>
                </div>

                <div class="curriculum-grid teacher-standards-grid">
                    <div>
                        <h3 class="column-title">Buckets</h3>
                        <div id="standards-bucket-list" class="bucket-list"></div>
                    </div>
                    <div>
                        <h3 class="column-title">Standards</h3>
                        <div id="standards-standard-list" class="standard-list"></div>
                    </div>
                    <div>
                        <h3 class="column-title">Learning Targets</h3>
                        <div id="standards-target-panel" class="target-panel"></div>
                        <form id="standards-add-lt-form" class="add-lt-form">
                            <h4>Add Learning Target</h4>
                            <input type="text" name="title" placeholder="Learning target title" required>
                            <textarea name="description" placeholder="Optional description"></textarea>
                            <button type="submit">Add to Selected Standard</button>
                        </form>
                    </div>
                </div>
            </section>

            <!-- Hidden legacy skills overview (disabled) -->

            <!-- Scroller Game Section -->
            <section class="student-section" id="scroller-section" style="display: none;">
                <div class="student-section-header">
                    <div>
                        <p class="student-kicker">Scroller Game</p>
                        <h2>Word Lists &amp; Sessions</h2>
                    </div>
                    <p>Manage word lists and run live student sessions.</p>
                </div>
                    
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
                                <div class="form-group">
                                    <label>ASL Level</label>
                                    <select name="asl_level" class="form-input" required>
                                        <option value="1" selected>ASL 1 Only</option>
                                        <option value="2">ASL 2 Only</option>
                                        <option value="3">Both ASL 1 & 2</option>
                                    </select>
                                    <small style="color: #6c757d; font-size: 0.85rem; margin-top: 5px; display: block;">
                                        Choose which level(s) can access this word list in the scroller game.
                                    </small>
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
                            <div style="margin-bottom: 20px;">
                                <a href="scrollergame/index.html" target="_blank" class="form-button" style="background: #17a2b8; display: inline-block; text-decoration: none; color: white;">
                                    Launch Scroller Game
                                </a>
                                <span style="margin-left: 10px; color: #666; font-size: 0.9em;">
                                    (Check "Enable for Scroller" to make word lists available in the game)
                                </span>
                            </div>
                            <div id="wordlists-list">
                            <!-- Word lists will be loaded here -->
                        </div>
                    </div>
                </div>
            </section>
        </main>
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
                    <div class="form-group">
                        <label for="edit-asl-level">ASL Level</label>
                        <select id="edit-asl-level" name="asl_level" class="form-input" required>
                            <option value="1">ASL 1 Only</option>
                            <option value="2">ASL 2 Only</option>
                            <option value="3">Both ASL 1 & 2</option>
                        </select>
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
            ['students', 'standards', 'scroller'].forEach(name => {
                const section = document.getElementById(name + '-section');
                const btn = document.getElementById(name + '-btn');
                if (section) section.style.display = 'none';
                if (btn) btn.classList.remove('active');
            });

            const showSec = document.getElementById(sectionName + '-section');
            const showBtn = document.getElementById(sectionName + '-btn');
            if (showSec) showSec.style.display = 'block';
            if (showBtn) showBtn.classList.add('active');

            if (sectionName === 'scroller') {
                loadWordlists();
            } else if (sectionName === 'standards') {
                renderStandardsSection();
            }
        }
        
        function viewStudentDetails(studentId) {
            // Redirect to student details page
            window.location.href = 'student_details.php?id=' + studentId;
        }

        function deleteStudent(studentId, studentName, buttonElement) {
            if (!confirm('Delete ' + studentName + '? This action cannot be undone.')) {
                return;
            }

            const deleteButton = buttonElement || null;
            const originalText = deleteButton ? deleteButton.textContent : '';

            if (deleteButton) {
                deleteButton.disabled = true;
                deleteButton.textContent = 'Deleting...';
            }

            const params = new URLSearchParams();
            params.append('student_id', studentId);

            fetch('delete_student.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const card = document.querySelector('.student-card[data-student-id="' + studentId + '"]');
                    if (card) {
                        card.remove();
                    }

                    const totalCountElement = document.getElementById('total-count');
                    if (totalCountElement) {
                        const currentTotal = parseInt(totalCountElement.textContent, 10);
                        if (!Number.isNaN(currentTotal) && currentTotal > 0) {
                            totalCountElement.textContent = currentTotal - 1;
                        }
                    }

                    showMessage(studentName + ' has been deleted.', 'success');
                    filterAndSortStudents();
                } else {
                    showMessage(data.message || 'Error deleting student.', 'error');
                    if (deleteButton) {
                        deleteButton.disabled = false;
                        deleteButton.textContent = originalText;
                    }
                }
            })
            .catch(error => {
                console.error('Error deleting student:', error);
                showMessage('Error deleting student. Please try again.', 'error');
                if (deleteButton) {
                    deleteButton.disabled = false;
                    deleteButton.textContent = originalText;
                }
            });
        }

        // ===== Standards section =====
        const SITE_ASL_LEVEL = <?php echo (int) $aslhub_site_level; ?>;
        let standardsData = <?php echo $standards_json; ?>;
        const standardsState = {
            bucketId: (standardsData.buckets && standardsData.buckets[0]) ? standardsData.buckets[0].id : null,
            standardId: (standardsData.buckets && standardsData.buckets[0] && standardsData.buckets[0].standards[0]) ? standardsData.buckets[0].standards[0].id : null
        };

        function standardsEscapeHtml(value) {
            const div = document.createElement('div');
            div.textContent = value == null ? '' : String(value);
            return div.innerHTML;
        }

        function getStandardsBucket(bucketId) {
            return (standardsData.buckets || []).find(b => b.id === bucketId) || null;
        }

        function getStandardsStandard(standardId) {
            for (const b of standardsData.buckets || []) {
                const found = (b.standards || []).find(s => s.id === standardId);
                if (found) return found;
            }
            return null;
        }

        function getStandardsTargets(standardId) {
            return (standardsData.targetsByStandard || {})[standardId] || [];
        }

        function renderStandardsBuckets() {
            const list = document.getElementById('standards-bucket-list');
            if (!list) return;
            list.innerHTML = (standardsData.buckets || []).map(b => {
                const count = (b.standards || []).reduce((sum, s) => sum + getStandardsTargets(s.id).length, 0);
                return `
                    <button type="button" class="bucket-card ${b.id === standardsState.bucketId ? 'active' : ''}" data-bucket-id="${standardsEscapeHtml(b.id)}">
                        <span class="bucket-code">${standardsEscapeHtml(b.code)}</span>
                        <span class="bucket-name">${standardsEscapeHtml(b.name)}</span>
                        <span class="bucket-progress">${count} learning target${count === 1 ? '' : 's'}</span>
                    </button>
                `;
            }).join('');
            list.querySelectorAll('[data-bucket-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const b = getStandardsBucket(btn.dataset.bucketId);
                    standardsState.bucketId = btn.dataset.bucketId;
                    standardsState.standardId = (b && b.standards[0]) ? b.standards[0].id : null;
                    renderStandardsSection();
                });
            });
        }

        function renderStandardsStandards() {
            const list = document.getElementById('standards-standard-list');
            if (!list) return;
            const bucket = getStandardsBucket(standardsState.bucketId);
            const standards = bucket ? (bucket.standards || []) : [];
            list.innerHTML = standards.map(s => {
                const count = getStandardsTargets(s.id).length;
                return `
                    <button type="button" class="standard-row ${s.id === standardsState.standardId ? 'active' : ''}" data-standard-id="${standardsEscapeHtml(s.id)}">
                        <span class="standard-id">${standardsEscapeHtml(s.id)}</span>
                        <span class="standard-name">${standardsEscapeHtml(s.name)}</span>
                        <span class="standard-desc">${standardsEscapeHtml(s.description || '')}</span>
                        <span class="standard-progress">${count} LT${count === 1 ? '' : 's'}</span>
                    </button>
                `;
            }).join('');
            list.querySelectorAll('[data-standard-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    standardsState.standardId = btn.dataset.standardId;
                    renderStandardsSection();
                });
            });
        }

        function renderStandardsTargets() {
            const panel = document.getElementById('standards-target-panel');
            if (!panel) return;
            const standard = getStandardsStandard(standardsState.standardId);
            if (!standard) {
                panel.innerHTML = '<div class="empty-panel">Select a standard to view its learning targets.</div>';
                return;
            }
            const targets = getStandardsTargets(standard.id);
            const targetItems = targets.length
                ? targets.map(t => `
                    <div class="target-row">
                        <span>${standardsEscapeHtml(t.title)}</span>
                        ${t.description ? `<small>${standardsEscapeHtml(t.description)}</small>` : ''}
                    </div>
                `).join('')
                : '<div class="empty-panel">No learning targets yet. Add one below.</div>';
            panel.innerHTML = `
                <div class="target-standard-summary">
                    <span>${standardsEscapeHtml(standard.id)}</span>
                    <h4>${standardsEscapeHtml(standard.name)}</h4>
                    <p>${standardsEscapeHtml(standard.description || '')}</p>
                </div>
                <div class="target-list">${targetItems}</div>
            `;
        }

        function renderStandardsSection() {
            renderStandardsBuckets();
            renderStandardsStandards();
            renderStandardsTargets();
        }

        function submitStandardsAddLearningTarget() {
            const form = document.getElementById('standards-add-lt-form');
            if (!form) return;
            if (!standardsState.standardId) {
                showMessage('Select a standard first.', 'error');
                return;
            }
            const formData = new FormData(form);
            formData.append('standard_id', standardsState.standardId);
            formData.append('asl_level', SITE_ASL_LEVEL);

            fetch('add_learning_target.php', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (!data.success) {
                        throw new Error(data.message || 'Unable to add learning target.');
                    }
                    if (data.standards) {
                        standardsData = data.standards;
                    }
                    form.reset();
                    renderStandardsSection();
                    showMessage('Learning target added.', 'success');
                })
                .catch(err => showMessage(err.message || 'Unable to add learning target.', 'error'));
        }


        // Set initial active state
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('students-btn').classList.add('active');
            
            // Add event listeners for filters
            document.getElementById('student-search').addEventListener('input', filterAndSortStudents);
            document.getElementById('period-filter').addEventListener('change', filterAndSortStudents);
            document.getElementById('level-filter').addEventListener('change', filterAndSortStudents);
            document.getElementById('sort-filter').addEventListener('change', filterAndSortStudents);
            
            // Standards add-LT form handler
            const addLtForm = document.getElementById('standards-add-lt-form');
            if (addLtForm) {
                addLtForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    submitStandardsAddLearningTarget();
                });
            }

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

                        // Add checkbox for scroller game
                        const scrollerLabel = document.createElement('label');
                        scrollerLabel.style.marginLeft = '10px';
                        scrollerLabel.style.marginRight = '10px';
                        const scrollerCheckbox = document.createElement('input');
                        scrollerCheckbox.type = 'checkbox';
                        scrollerCheckbox.checked = list.scroller_enabled == 1;
                        scrollerCheckbox.addEventListener('change', () => toggleScrollerEnabled(list.id, scrollerCheckbox.checked));
                        scrollerLabel.appendChild(scrollerCheckbox);
                        scrollerLabel.append(' Enable for Scroller');
                        listDiv.appendChild(scrollerLabel);

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

        function toggleScrollerEnabled(wordlistId, enabled) {
            fetch('toggle_scroller_enabled.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    wordlist_id: wordlistId,
                    enabled: enabled ? 1 : 0
                })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    console.error('Failed to update scroller setting');
                    // Reload to restore correct state
                    loadWordlists();
                }
            })
            .catch(error => {
                console.error('Error updating scroller setting:', error);
                loadWordlists();
            });
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
            const modal = document.getElementById('edit-wordlist-modal');
            document.getElementById('edit-wordlist-id').value = list.id;
            document.getElementById('edit-wordlist-name').value = list.wordlist_name;
            document.getElementById('edit-words').value = (list.words || []).join('\n');
            document.getElementById('edit-speed').value = list.speed;
            document.getElementById('edit-word-count').value = list.word_count;
            document.getElementById('edit-asl-level').value = list.asl_level || 1;

            // Display modal with animation similar to resource modal
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('active'));
            document.body.style.overflow = 'hidden';
        }

        function closeEditWordlistModal() {
            const modal = document.getElementById('edit-wordlist-modal');
            modal.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
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

        // Move skill functions
        function moveSkill(skillId, action) {
            const formData = new FormData();
            formData.append('skill_id', skillId);
            formData.append('action', action);
            
            fetch('reorder_skill.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage(data.message, 'success');
                    // Reload the skills section
                    setTimeout(() => {
                        location.reload();
                    }, 500);
                } else {
                    showMessage(data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showMessage('Error moving skill. Please try again.', 'error');
            });
        }
        
        function moveToPosition(skillId, targetPosition) {
            const currentPosition = document.getElementById('position-' + skillId).defaultValue;
            
            if (targetPosition === currentPosition) {
                return; // No change
            }
            
            const formData = new FormData();
            formData.append('skill_id', skillId);
            formData.append('action', 'move_to_position');
            formData.append('target_position', targetPosition);
            
            fetch('reorder_skill.php', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage(data.message, 'success');
                    // Reload the skills section
                    setTimeout(() => {
                        location.reload();
                    }, 500);
                } else {
                    showMessage(data.message, 'error');
                    // Reset input value
                    document.getElementById('position-' + skillId).value = currentPosition;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showMessage('Error moving skill to position. Please try again.', 'error');
                // Reset input value
                document.getElementById('position-' + skillId).value = currentPosition;
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
        function editSkill(skillId, skillName, skillDescription, skillUnit, skillLevel) {
            const currentLevel = [1, 2, 3].includes(Number(skillLevel)) ? Number(skillLevel) : 1;
            const newName = prompt('Edit skill name:', skillName);
            if (newName === null) return; // User cancelled

            if (newName.trim() === '') {
                alert('Skill name cannot be empty');
                return;
            }

            const newDescription = prompt('Edit skill description:', skillDescription);
            if (newDescription === null) return; // User cancelled

            const newUnit = prompt('Edit unit (leave blank for year-round skills):', skillUnit || '');
            if (newUnit === null) return; // User cancelled

            const levelPrompt = prompt('Set ASL level for this skill (1 = ASL 1, 2 = ASL 2, 3 = Both):', currentLevel);
            if (levelPrompt === null) return; // User cancelled

            const parsedLevel = parseInt(levelPrompt, 10);
            if (![1, 2, 3].includes(parsedLevel)) {
                alert('ASL level must be 1, 2, or 3.');
                return;
            }

            const formData = new FormData();
            formData.append('skill_id', skillId);
            formData.append('skill_name', newName.trim());
            formData.append('skill_description', newDescription.trim());
            formData.append('unit', newUnit.trim());
            formData.append('asl_level', parsedLevel);
            
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
        
        // Student filtering and sorting functions
        function filterAndSortStudents() {
            const searchTerm = document.getElementById('student-search').value.toLowerCase();
            const periodFilter = document.getElementById('period-filter').value;
            const levelFilter = document.getElementById('level-filter').value;
            const sortBy = document.getElementById('sort-filter').value;

            const cards = Array.from(document.querySelectorAll('.student-card'));
            let visibleCount = 0;

            const totalCountElement = document.getElementById('total-count');
            if (totalCountElement) {
                totalCountElement.textContent = cards.length;
            }

            // First, filter cards
            cards.forEach(card => {
                const firstName = card.dataset.firstName;
                const lastName = card.dataset.lastName;
                const period = card.dataset.period;
                const level = card.dataset.level;
                const fullName = firstName + ' ' + lastName;
                
                let show = true;
                
                // Search filter
                if (searchTerm && !fullName.includes(searchTerm)) {
                    show = false;
                }
                
                // Period filter
                if (periodFilter !== 'all' && period !== periodFilter) {
                    show = false;
                }
                
                // Level filter
                if (levelFilter !== 'all' && level !== levelFilter) {
                    show = false;
                }
                
                card.style.display = show ? '' : 'none';
                if (show) visibleCount++;
            });
            
            // Update count
            document.getElementById('filtered-count').textContent = visibleCount;
            
            // Sort visible cards
            const visibleCards = cards.filter(card => card.style.display !== 'none');
            const container = document.getElementById('students-grid');
            
            visibleCards.sort((a, b) => {
                switch(sortBy) {
                    case 'first-asc':
                        return a.dataset.firstName.localeCompare(b.dataset.firstName);
                    case 'first-desc':
                        return b.dataset.firstName.localeCompare(a.dataset.firstName);
                    case 'last-asc':
                        return a.dataset.lastName.localeCompare(b.dataset.lastName);
                    case 'last-desc':
                        return b.dataset.lastName.localeCompare(a.dataset.lastName);
                    case 'progress-asc':
                        return parseFloat(a.dataset.progress) - parseFloat(b.dataset.progress);
                    case 'progress-desc':
                        return parseFloat(b.dataset.progress) - parseFloat(a.dataset.progress);
                    default:
                        return 0;
                }
            });
            
            // Re-append cards in sorted order
            visibleCards.forEach(card => container.appendChild(card));
            
            // Keep hidden cards at the end
            cards.filter(card => card.style.display === 'none').forEach(card => container.appendChild(card));
        }
        
        function resetFilters() {
            document.getElementById('student-search').value = '';
            document.getElementById('period-filter').value = 'all';
            document.getElementById('level-filter').value = 'all';
            document.getElementById('sort-filter').value = 'first-asc';
            filterAndSortStudents();
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
        /* ===== TEACHER DASHBOARD — APPLE-CLEAN ===== */
        .teacher-dashboard-page .student-section {
            padding: 22px;
        }

        .teacher-welcome {
            color: #6e6e73;
            font-size: 0.92rem;
            font-weight: 600;
            padding: 0 6px;
            white-space: nowrap;
        }

        .teacher-tabs {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            padding: 6px;
            margin-bottom: 18px;
            background: rgba(255, 255, 255, 0.88);
            border: 1px solid rgba(210, 210, 215, 0.72);
            border-radius: 8px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.06);
            backdrop-filter: blur(18px);
        }

        .teacher-tab {
            background: transparent;
            border: 1px solid transparent;
            border-radius: 8px;
            color: #1d1d1f;
            cursor: pointer;
            font: inherit;
            font-size: 0.92rem;
            font-weight: 600;
            padding: 9px 14px;
            transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
        }

        .teacher-tab:hover {
            background: #f5f5f7;
        }

        .teacher-tab.active {
            background: #1d1d1f;
            color: #fff;
        }

        .teacher-section-summary {
            color: #6e6e73;
            margin: 0;
        }

        .teacher-section-summary strong {
            color: #1d1d1f;
        }

        .teacher-dot {
            color: #d2d2d7;
            margin: 0 6px;
        }

        /* Filter bar */
        .teacher-filter-bar {
            display: grid;
            grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(140px, 1fr)) auto;
            gap: 12px;
            align-items: end;
            padding: 16px;
            margin: 18px 0 22px;
            background: #fbfbfd;
            border: 1px solid #e8e8ed;
            border-radius: 10px;
        }

        .teacher-filter-field {
            display: grid;
            gap: 6px;
        }

        .teacher-filter-field span {
            color: #6e6e73;
            font-size: 0.78rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .teacher-filter-field input,
        .teacher-filter-field select {
            width: 100%;
            border: 1px solid #d2d2d7;
            border-radius: 8px;
            background: #fff;
            color: #1d1d1f;
            font: inherit;
            padding: 9px 11px;
            min-height: 40px;
        }

        .teacher-filter-field input:focus,
        .teacher-filter-field select:focus {
            outline: none;
            border-color: #0071e3;
            box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.18);
        }

        .teacher-filter-reset {
            border: 1px solid #d2d2d7;
            background: #fff;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-weight: 600;
            padding: 9px 16px;
            min-height: 40px;
            color: #1d1d1f;
            transition: border-color 0.16s ease, box-shadow 0.16s ease;
        }

        .teacher-filter-reset:hover {
            border-color: #0071e3;
            box-shadow: 0 8px 18px rgba(0, 113, 227, 0.12);
        }

        @media (max-width: 900px) {
            .teacher-filter-bar {
                grid-template-columns: 1fr 1fr;
            }
            .teacher-filter-search {
                grid-column: 1 / -1;
            }
        }

        /* Student cards */
        .teacher-dashboard-page .students-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
        }

        .teacher-dashboard-page .student-card {
            background: #fff;
            border: 1px solid rgba(210, 210, 215, 0.8);
            border-radius: 10px;
            padding: 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
            transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }

        .teacher-dashboard-page .student-card:hover {
            transform: translateY(-2px);
            border-color: #0071e3;
            box-shadow: 0 16px 36px rgba(0, 113, 227, 0.12);
        }

        .student-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        .student-card-avatar {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: #1d1d1f;
            color: #fff;
            display: grid;
            place-items: center;
            font-size: 0.9rem;
            font-weight: 800;
            flex: 0 0 auto;
        }

        .student-card-identity {
            min-width: 0;
        }

        .teacher-dashboard-page .student-name {
            font-size: 1.02rem;
            font-weight: 700;
            color: #1d1d1f;
            margin: 0;
            overflow-wrap: anywhere;
        }

        .teacher-dashboard-page .student-email {
            color: #6e6e73;
            font-size: 0.84rem;
            margin: 2px 0 0;
            overflow-wrap: anywhere;
        }

        .student-card-meta {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .student-card-meta span {
            background: #f5f5f7;
            color: #1d1d1f;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
            padding: 3px 10px;
        }

        .teacher-dashboard-page .student-progress {
            display: grid;
            gap: 6px;
        }

        .teacher-dashboard-page .student-progress-bar {
            background: #e8e8ed;
            border-radius: 999px;
            height: 8px;
            overflow: hidden;
        }

        .teacher-dashboard-page .student-progress-fill {
            height: 100%;
            border-radius: 999px;
            transition: width 0.3s ease;
        }

        .teacher-dashboard-page .student-progress-fill.progress-0-50 { background: #ff9f0a; }
        .teacher-dashboard-page .student-progress-fill.progress-51-75 { background: #ffd60a; }
        .teacher-dashboard-page .student-progress-fill.progress-76-100 { background: #30d158; }

        .teacher-dashboard-page .student-progress-text {
            display: flex;
            justify-content: space-between;
            color: #6e6e73;
            font-size: 0.82rem;
            font-weight: 600;
        }

        .student-points {
            color: #1d1d1f;
        }

        .student-card-actions {
            display: flex;
            gap: 8px;
            margin-top: auto;
        }

        /* Buttons */
        .teacher-btn {
            border: 1px solid #d2d2d7;
            background: #fff;
            color: #1d1d1f;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-size: 0.88rem;
            font-weight: 600;
            padding: 8px 14px;
            min-height: 36px;
            transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, color 0.16s ease;
        }

        .teacher-btn:hover {
            border-color: #0071e3;
            box-shadow: 0 8px 18px rgba(0, 113, 227, 0.12);
        }

        .teacher-btn-primary {
            background: #0071e3;
            border-color: #0071e3;
            color: #fff;
        }

        .teacher-btn-primary:hover {
            background: #0062c4;
            border-color: #0062c4;
            box-shadow: 0 8px 18px rgba(0, 113, 227, 0.24);
        }

        .teacher-btn-danger {
            border-color: #ffd1d8;
            color: #b4233a;
        }

        .teacher-btn-danger:hover {
            border-color: #b4233a;
            background: #fff5f6;
            box-shadow: 0 8px 18px rgba(180, 35, 58, 0.16);
        }

        .teacher-btn-success {
            background: #30d158;
            border-color: #30d158;
            color: #fff;
        }

        .teacher-btn-success:hover {
            background: #29b34d;
            border-color: #29b34d;
        }

        .teacher-btn-neutral {
            background: #f5f5f7;
        }

        /* Skill summary cards */
        .skills-summary {
            display: grid;
            gap: 14px;
        }

        .skill-summary-card {
            background: #fbfbfd;
            border: 1px solid #e8e8ed;
            border-radius: 10px;
            padding: 18px;
        }

        .skill-summary-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 14px;
            flex-wrap: wrap;
        }

        .skill-summary-card h3 {
            color: #1d1d1f;
            margin: 0;
            font-size: 1.05rem;
            font-weight: 700;
        }

        .skill-actions {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .action-btn {
            border: 1px solid #d2d2d7;
            background: #fff;
            color: #1d1d1f;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-size: 0.82rem;
            font-weight: 600;
            padding: 6px 12px;
            transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
        }

        .action-btn.edit-btn:hover { border-color: #0071e3; color: #0071e3; }
        .action-btn.resources-btn:hover { border-color: #30d158; color: #248a3d; }
        .action-btn.delete-btn:hover { border-color: #ff453a; color: #b4233a; background: #fff5f6; }

        .skill-position-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e8e8ed;
        }

        .skill-position-number {
            font-size: 0.92rem;
            font-weight: 700;
            color: #6e6e73;
            min-width: 40px;
        }

        .position-buttons {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .position-btn {
            width: 28px;
            height: 28px;
            border: 1px solid #d2d2d7;
            background: #fff;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            color: #1d1d1f;
            transition: all 0.16s;
        }

        .position-btn:hover:not(:disabled) {
            background: #0071e3;
            color: #fff;
            border-color: #0071e3;
        }

        .position-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .position-input {
            width: 56px;
            padding: 4px 8px;
            border: 1px solid #d2d2d7;
            border-radius: 6px;
            font-size: 13px;
        }

        .skill-meta-line {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 6px;
            flex-wrap: wrap;
        }

        .skill-level-badge {
            display: inline-block;
            padding: 2px 9px;
            background: #f5f5f7;
            color: #1d1d1f;
            border: 1px solid #e8e8ed;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
        }

        .skill-unit {
            display: inline-block;
            padding: 2px 9px;
            background: #eaf4ff;
            color: #0062c4;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
        }

        .skill-unit.no-unit {
            background: #f5f5f7;
            color: #6e6e73;
        }

        .skill-stats {
            display: flex;
            gap: 18px;
            flex-wrap: wrap;
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #6e6e73;
            font-size: 0.88rem;
        }

        .stat-label { font-weight: 600; }

        .stat-value {
            padding: 3px 9px;
            border-radius: 999px;
            font-weight: 700;
            min-width: 28px;
            text-align: center;
            font-size: 0.82rem;
        }

        .stat-value.not-started { background: #fff1f2; color: #b4233a; }
        .stat-value.progressing { background: #fff8e1; color: #8a6d00; }
        .stat-value.proficient { background: #e8faec; color: #248a3d; }

        /* Manage section */
        .manage-actions {
            display: flex;
            gap: 10px;
            margin-bottom: 18px;
            flex-wrap: wrap;
        }

        .teacher-inline-form {
            margin-top: 18px;
            padding: 18px;
            background: #fbfbfd;
            border: 1px solid #e8e8ed;
            border-radius: 10px;
        }
    </style>
</body>
</html>
