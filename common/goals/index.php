<?php
if (!isset($ASL_BASE_PATH)) {
    $ASL_BASE_PATH = dirname(__DIR__, 2) . '/asl1';
}
if (!isset($ASL_RELATIVE_PATH)) {
    $ASL_RELATIVE_PATH = '..';
}
if (!isset($ASL_LEVEL_NAME)) {
    $ASL_LEVEL_NAME = 'ASL';
}

session_start();
require_once $ASL_BASE_PATH . '/config.php';

if (!isset($_SESSION['user_id'])) {
    header('Location: ' . $ASL_RELATIVE_PATH . '/index.php');
    exit;
}

if (isset($_SESSION['is_teacher']) && $_SESSION['is_teacher']) {
    header('Location: ' . $ASL_RELATIVE_PATH . '/teacher_dashboard.php');
    exit;
}

$userFullName = trim((string)($_SESSION['user_first_name'] ?? '') . ' ' . (string)($_SESSION['user_last_name'] ?? ''));

try {
    $stmt = $pdo->prepare('SELECT id, framework, goal_type, goal_focus, success_criteria, status, created_at FROM user_goals WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$_SESSION['user_id']]);
    $goals = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    $goals = [];
}

$totalGoals = count($goals);
$progressPercentage = 0;

if ($totalGoals > 0) {
    $statusWeights = [
        'not_started' => 0,
        'progressing' => 0.5,
        'proficient' => 1,
    ];

    $totalWeight = 0;
    foreach ($goals as $goal) {
        $status = $goal['status'] ?? 'not_started';
        $totalWeight += $statusWeights[$status] ?? 0;
    }

    $progressPercentage = (int) round(($totalWeight / $totalGoals) * 100);
}

$goalsJson = json_encode($goals, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
$escapedName = htmlspecialchars($userFullName !== '' ? $userFullName : 'Student', ENT_QUOTES, 'UTF-8');
$levelHeading = htmlspecialchars($ASL_LEVEL_NAME, ENT_QUOTES, 'UTF-8');
$cssPath = htmlspecialchars($ASL_RELATIVE_PATH . '/css/asl-style.css', ENT_QUOTES, 'UTF-8');
$dashboardPath = htmlspecialchars($ASL_RELATIVE_PATH . '/dashboard.php', ENT_QUOTES, 'UTF-8');
$logoutPath = htmlspecialchars($ASL_RELATIVE_PATH . '/logout.php', ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title><?php echo $levelHeading; ?> Goals</title>
    <link rel="stylesheet" href="<?php echo $cssPath; ?>">
</head>
<body>
    <div class="container goals-page">
        <header>
            <h1><?php echo $levelHeading; ?> Goals</h1>
            <div class="user-info">
                <span>Welcome, <?php echo $escapedName; ?>!</span>
                <a href="<?php echo $dashboardPath; ?>" class="back-btn">← Back to Dashboard</a>
                <a href="<?php echo $logoutPath; ?>" class="logout-btn">Logout</a>
            </div>
        </header>

        <div class="dashboard-container">
            <div class="user-info-box">
                <div class="user-name"><?php echo $escapedName; ?></div>
            </div>

            <div class="progress-bar-container goals-progress">
                <div class="progress-label">Goals Progress</div>
                <div class="progress-bar">
                    <div class="progress-fill" id="goal-progress-fill" style="width: <?php echo $progressPercentage; ?>%"></div>
                    <div class="progress-text" id="goal-progress-text"><?php echo $progressPercentage; ?>%</div>
                </div>
            </div>

            <div class="goals-layout">
                <section class="goal-create-card">
                    <h2>Create a New Goal</h2>
                    <p class="goal-instructions">Choose your goal framework and focus. We'll track it separately from your skill progress.</p>

                    <form id="goal-form" class="goal-form" autocomplete="off">
                        <div class="goal-form-row">
                            <label for="goal-framework">Goal Framework</label>
                            <select id="goal-framework" class="goal-select">
                                <option value="simple" selected>Simple</option>
                            </select>
                        </div>

                        <div class="goal-form-row">
                            <span class="goal-label">Goal Type</span>
                            <div class="goal-type-toggle" role="radiogroup" aria-label="Select goal timeframe">
                                <label class="goal-type-option">
                                    <input type="radio" name="goal-type" value="daily" checked>
                                    <span>Daily</span>
                                </label>
                                <label class="goal-type-option">
                                    <input type="radio" name="goal-type" value="weekly">
                                    <span>Weekly</span>
                                </label>
                            </div>
                        </div>

                        <div class="goal-form-row">
                            <label for="goal-focus" id="goal-focus-label">Today my goal is to...</label>
                            <textarea id="goal-focus" class="goal-textarea" rows="3" placeholder="Practice fingerspelling for 10 minutes"></textarea>
                        </div>

                        <div class="goal-form-row">
                            <label for="goal-success" id="goal-success-label">When I can..., I know I've accomplished my goal.</label>
                            <textarea id="goal-success" class="goal-textarea" rows="3" placeholder="Fingerspell the alphabet smoothly without pausing"></textarea>
                        </div>

                        <button type="submit" class="form-button goal-submit-button">Save Goal</button>
                    </form>

                    <div id="goal-message" class="goal-message" role="alert" aria-live="polite"></div>
                </section>

                <section class="goal-cards-card">
                    <div class="goal-cards-header">
                        <h2>Your Goals</h2>
                        <p>Update each goal as you progress. You can delete a goal once you're finished with it.</p>
                    </div>
                    <div id="goal-list" class="goal-card-list"></div>
                </section>
            </div>
        </div>
    </div>

    <script>
        const goalData = <?php echo $goalsJson ?: '[]'; ?>;
        const goalForm = document.getElementById('goal-form');
        const goalList = document.getElementById('goal-list');
        const goalMessage = document.getElementById('goal-message');
        const goalFocusLabel = document.getElementById('goal-focus-label');
        const goalSuccessLabel = document.getElementById('goal-success-label');
        const goalFocusInput = document.getElementById('goal-focus');
        const goalSuccessInput = document.getElementById('goal-success');
        const goalProgressFill = document.getElementById('goal-progress-fill');
        const goalProgressText = document.getElementById('goal-progress-text');
        const goalTypeRadios = Array.from(document.querySelectorAll('input[name="goal-type"]'));

        const statusWeights = {
            'not_started': 0,
            'progressing': 0.5,
            'proficient': 1
        };

        goalTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const timeframe = getSelectedGoalType();
                if (timeframe === 'weekly') {
                    goalFocusLabel.textContent = 'This week my goal is to...';
                    goalSuccessLabel.textContent = 'When I can..., I know I\'ve accomplished my goal.';
                    goalFocusInput.placeholder = 'Practice my ASL story three times this week';
                    goalSuccessInput.placeholder = 'Share the story smoothly with my partner';
                } else {
                    goalFocusLabel.textContent = 'Today my goal is to...';
                    goalSuccessLabel.textContent = 'When I can..., I know I\'ve accomplished my goal.';
                    goalFocusInput.placeholder = 'Practice fingerspelling for 10 minutes';
                    goalSuccessInput.placeholder = 'Fingerspell the alphabet smoothly without pausing';
                }
            });
        });

        goalForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearGoalMessage();

            const framework = document.getElementById('goal-framework').value;
            const goalType = getSelectedGoalType();
            const goalFocus = goalFocusInput.value.trim();
            const goalSuccess = goalSuccessInput.value.trim();

            if (!goalFocus || !goalSuccess) {
                showGoalMessage('Please fill out both goal fields before saving.', false);
                return;
            }

            try {
                const response = await fetch('create_goal.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        framework,
                        goal_type: goalType,
                        goal_focus: goalFocus,
                        success_criteria: goalSuccess
                    })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Unable to save your goal right now.');
                }

                goalData.unshift(data.goal);
                goalFocusInput.value = '';
                goalSuccessInput.value = '';
                renderGoals();
                showGoalMessage('Goal saved successfully!', true);
            } catch (error) {
                showGoalMessage(error.message, false);
            }
        });

        function getSelectedGoalType() {
            const selected = goalTypeRadios.find(radio => radio.checked);
            return selected ? selected.value : 'daily';
        }

        function renderGoals() {
            goalList.innerHTML = '';

            if (!Array.isArray(goalData) || goalData.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.className = 'goal-empty-state';
                emptyState.innerHTML = '<h3>No goals yet</h3><p>Create your first goal to start tracking your progress.</p>';
                goalList.appendChild(emptyState);
                updateProgressBar();
                return;
            }

            goalData.forEach(goal => {
                const card = document.createElement('article');
                card.className = 'goal-card';
                card.dataset.goalId = goal.id;

                const header = document.createElement('div');
                header.className = 'goal-card-header';

                const headerText = document.createElement('div');
                headerText.className = 'goal-card-header-text';

                const badge = document.createElement('span');
                badge.className = 'goal-type-badge';
                badge.textContent = goal.goal_type === 'weekly' ? 'Weekly Goal' : 'Daily Goal';

                const title = document.createElement('h3');
                title.textContent = formatFramework(goal.framework);

                headerText.appendChild(badge);
                headerText.appendChild(title);

                const deleteButton = document.createElement('button');
                deleteButton.className = 'goal-delete-button';
                deleteButton.type = 'button';
                deleteButton.textContent = 'Delete Goal';
                deleteButton.addEventListener('click', () => handleDeleteGoal(goal.id));

                header.appendChild(headerText);
                header.appendChild(deleteButton);
                card.appendChild(header);

                const body = document.createElement('div');
                body.className = 'goal-card-body';

                const focus = document.createElement('p');
                focus.className = 'goal-focus';
                const focusText = (goal.goal_focus || '').trim();
                focus.textContent = (goal.goal_type === 'weekly' ? 'This week my goal is to ' : 'Today my goal is to ') + focusText;

                const success = document.createElement('p');
                success.className = 'goal-success';
                const successText = (goal.success_criteria || '').trim();
                if (successText) {
                    const needsEnding = /[.!?]$/.test(successText) ? '' : '.';
                    success.textContent = `I'll know I've accomplished it when I can ${successText}${needsEnding}`;
                } else {
                    success.textContent = "Set how you will measure this goal so you know when it's complete.";
                }

                const statusContainer = document.createElement('div');
                statusContainer.className = 'goal-status-buttons';

                const normalizedStatus = Object.prototype.hasOwnProperty.call(statusWeights, goal.status) ? goal.status : 'not_started';
                if (normalizedStatus !== goal.status) {
                    goal.status = normalizedStatus;
                }

                const statuses = [
                    { key: 'not_started', label: 'Not Started' },
                    { key: 'progressing', label: 'Progressing' },
                    { key: 'proficient', label: 'Proficient' }
                ];

                statuses.forEach(({ key, label }) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = `goal-status-button ${key.replace('_', '-')}`;
                    if (normalizedStatus === key) {
                        button.classList.add('active');
                    }
                    button.textContent = label;
                    button.addEventListener('click', () => handleStatusChange(goal.id, key));
                    statusContainer.appendChild(button);
                });

                body.appendChild(focus);
                body.appendChild(success);
                body.appendChild(statusContainer);
                card.appendChild(body);

                goalList.appendChild(card);
            });

            updateProgressBar();
        }

        async function handleStatusChange(goalId, status) {
            const goal = goalData.find(item => Number(item.id) === Number(goalId));
            if (!goal || goal.status === status) {
                return;
            }

            try {
                const response = await fetch('update_goal_status.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ goal_id: goalId, status })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Unable to update that goal right now.');
                }

                goal.status = status;
                renderGoals();
                showGoalMessage('Goal status updated.', true);
            } catch (error) {
                showGoalMessage(error.message, false);
            }
        }

        async function handleDeleteGoal(goalId) {
            if (!confirm('Delete this goal? This cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch('delete_goal.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ goal_id: goalId })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Unable to delete that goal right now.');
                }

                const goalIndex = goalData.findIndex(item => Number(item.id) === Number(goalId));
                if (goalIndex !== -1) {
                    goalData.splice(goalIndex, 1);
                }
                renderGoals();
                showGoalMessage('Goal deleted.', true);
            } catch (error) {
                showGoalMessage(error.message, false);
            }
        }

        function updateProgressBar() {
            const totalGoals = Array.isArray(goalData) ? goalData.length : 0;
            if (totalGoals === 0) {
                goalProgressFill.style.width = '0%';
                goalProgressText.textContent = '0%';
                setProgressColor(0);
                return;
            }

            let earned = 0;
            goalData.forEach(goal => {
                earned += statusWeights[goal.status] ?? 0;
            });

            const percentage = Math.round((earned / totalGoals) * 100);
            goalProgressFill.style.width = `${percentage}%`;
            goalProgressText.textContent = `${percentage}%`;
            setProgressColor(percentage);
        }

        function setProgressColor(percentage) {
            goalProgressFill.classList.remove('progress-0-50', 'progress-51-75', 'progress-76-100');
            if (percentage <= 50) {
                goalProgressFill.classList.add('progress-0-50');
            } else if (percentage <= 75) {
                goalProgressFill.classList.add('progress-51-75');
            } else {
                goalProgressFill.classList.add('progress-76-100');
            }
        }

        function formatFramework(framework) {
            if (!framework) {
                return 'Personal Goal';
            }
            return framework.charAt(0).toUpperCase() + framework.slice(1) + ' Goal';
        }

        function showGoalMessage(message, isSuccess) {
            goalMessage.textContent = message;
            goalMessage.classList.toggle('goal-message-success', Boolean(isSuccess));
            goalMessage.classList.toggle('goal-message-error', !isSuccess);
        }

        function clearGoalMessage() {
            goalMessage.textContent = '';
            goalMessage.classList.remove('goal-message-success', 'goal-message-error');
        }

        renderGoals();
    </script>
</body>
</html>
