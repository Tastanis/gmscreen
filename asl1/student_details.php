<?php
session_start();
require_once 'config.php';

// Check if user is logged in and is a teacher
if (!isset($_SESSION['user_id']) || !isset($_SESSION['is_teacher']) || !$_SESSION['is_teacher']) {
    header('Location: index.php');
    exit;
}

$student_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$message = '';
$message_type = '';

// Handle form submission for updating student details
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'update') {
    $first_name = trim($_POST['first_name']);
    $last_name = trim($_POST['last_name']);
    $email = trim($_POST['email']);
    $new_password = trim($_POST['new_password']);
    
    try {
        // Update basic information
        $stmt = $pdo->prepare("UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ? AND is_teacher = FALSE");
        $stmt->execute([$first_name, $last_name, $email, $student_id]);
        
        // Update password if provided
        if (!empty($new_password)) {
            if (strlen($new_password) < 6) {
                $message = 'Password must be at least 6 characters long.';
                $message_type = 'error';
            } else {
                $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);
                $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ? AND is_teacher = FALSE");
                $stmt->execute([$hashed_password, $student_id]);
                $message = 'Student details updated successfully, including password.';
                $message_type = 'success';
            }
        } else {
            $message = 'Student details updated successfully.';
            $message_type = 'success';
        }
    } catch(PDOException $e) {
        $message = 'Error updating student details.';
        $message_type = 'error';
    }
}

// Get student details
try {
    $stmt = $pdo->prepare("
        SELECT 
            u.id,
            u.first_name,
            u.last_name,
            u.email,
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
                (SELECT SUM(points_proficient) FROM skills), 0
            ) as total_possible_points
        FROM users u
        LEFT JOIN user_skills us ON u.id = us.user_id
        LEFT JOIN skills s ON us.skill_id = s.id
        WHERE u.id = ? AND u.is_teacher = FALSE
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.level
    ");
    $stmt->execute([$student_id]);
    $student = $stmt->fetch();
    
    if (!$student) {
        header('Location: teacher_dashboard.php');
        exit;
    }
    
    // Get student's skills progress
    $stmt = $pdo->prepare("
        SELECT 
            s.skill_name,
            s.skill_description,
            s.unit,
            COALESCE(us.status, 'not_started') as status,
            s.points_not_started,
            s.points_progressing,
            s.points_proficient
        FROM skills s
        LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = ?
        ORDER BY s.order_index
    ");
    $stmt->execute([$student_id]);
    $skills = $stmt->fetchAll();
    
    // Note: In a production environment, you should NEVER store or display passwords in plain text
    // This is only for educational purposes and specific requirement
    // We'll retrieve the actual password for display (educational/demo purposes only)
    // Since passwords are hashed, we can't retrieve the original password
    // We'll show a placeholder message instead
    $password_display = "Password is encrypted and cannot be displayed";
    
} catch(PDOException $e) {
    header('Location: teacher_dashboard.php');
    exit;
}

$progress_percentage = $student['total_possible_points'] > 0 ? 
    round(($student['earned_points'] / $student['total_possible_points']) * 100) : 0;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Student Details - <?php echo htmlspecialchars($student['first_name'] . ' ' . $student['last_name']); ?></title>
    <link rel="stylesheet" href="css/asl-style.css">
    <style>
        .student-details-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .back-link {
            display: inline-block;
            margin-bottom: 20px;
            color: #4299e1;
            text-decoration: none;
            font-weight: 500;
        }
        
        .back-link:hover {
            text-decoration: underline;
        }
        
        .details-header {
            background: rgba(247, 250, 252, 0.8);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            border: 2px solid #e2e8f0;
        }
        
        .student-name-header {
            font-size: 2rem;
            color: #2d3748;
            margin-bottom: 10px;
        }
        
        .student-meta {
            color: #718096;
            margin-bottom: 20px;
        }
        
        .progress-overview {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-top: 20px;
        }
        
        .progress-bar-container {
            flex: 1;
            background: #e2e8f0;
            border-radius: 8px;
            height: 20px;
            overflow: hidden;
        }
        
        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            transition: width 0.3s ease;
        }
        
        .progress-text {
            font-weight: 600;
            color: #2d3748;
        }
        
        .details-section {
            background: rgba(247, 250, 252, 0.8);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            border: 2px solid #e2e8f0;
        }
        
        .section-title {
            font-size: 1.5rem;
            color: #2d3748;
            margin-bottom: 20px;
        }
        
        .edit-form {
            display: grid;
            gap: 20px;
        }
        
        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            color: #4a5568;
            font-weight: 500;
        }
        
        .form-input {
            width: 100%;
            padding: 10px 15px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        
        .form-input:focus {
            outline: none;
            border-color: #4299e1;
        }
        
        .password-info {
            background: #fef5e7;
            border: 1px solid #f39c12;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .password-info-title {
            color: #e67e22;
            font-weight: 600;
            margin-bottom: 5px;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .skills-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }
        
        .skill-card {
            background: white;
            border-radius: 8px;
            padding: 15px;
            border: 1px solid #e2e8f0;
        }
        
        .skill-name {
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 5px;
        }
        
        .skill-description {
            font-size: 0.9rem;
            color: #718096;
            margin-bottom: 10px;
        }
        
        .skill-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 600;
        }
        
        .status-not_started {
            background: #feb2b2;
            color: #742a2a;
        }
        
        .status-progressing {
            background: #faf089;
            color: #744210;
        }
        
        .status-proficient {
            background: #c6f6d5;
            color: #22543d;
        }
        
        .message {
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-weight: 500;
        }
        
        .message.success {
            background: #c6f6d5;
            color: #22543d;
            border: 1px solid #48bb78;
        }
        
        .message.error {
            background: #feb2b2;
            color: #742a2a;
            border: 1px solid #f56565;
        }
        
        .form-button {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
            color: white;
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #3182ce 0%, #2c5aa0 100%);
        }
        
        .btn-secondary {
            background: #e2e8f0;
            color: #4a5568;
        }
        
        .btn-secondary:hover {
            background: #cbd5e0;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Student Details</h1>
            <div class="user-info">
                <span>Logged in as: <?php echo htmlspecialchars($_SESSION['user_first_name'] . ' ' . $_SESSION['user_last_name']); ?></span>
                <a href="logout.php" class="logout-btn">Logout</a>
            </div>
        </header>
        
        <div class="student-details-container">
            <a href="teacher_dashboard.php" class="back-link">← Back to Dashboard</a>
            
            <?php if ($message): ?>
                <div class="message <?php echo $message_type; ?>">
                    <?php echo htmlspecialchars($message); ?>
                </div>
            <?php endif; ?>
            
            <div class="details-header">
                <h2 class="student-name-header"><?php echo htmlspecialchars($student['first_name'] . ' ' . $student['last_name']); ?></h2>
                <div class="student-meta">
                    <p>Email: <?php echo htmlspecialchars($student['email']); ?></p>
                    <p>ASL Level: <?php echo $student['level']; ?></p>
                </div>
                <div class="progress-overview">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: <?php echo $progress_percentage; ?>%"></div>
                    </div>
                    <div class="progress-text">
                        <?php echo $progress_percentage; ?>% Complete (<?php echo $student['earned_points']; ?>/<?php echo $student['total_possible_points']; ?> points)
                    </div>
                </div>
            </div>
            
            <div class="details-section">
                <h3 class="section-title">Edit Student Information</h3>
                
                <div class="password-info">
                    <div class="password-info-title">Password Information</div>
                    <div>For security reasons, the current password cannot be displayed. You can set a new password below if needed.</div>
                </div>
                
                <form method="POST" class="edit-form">
                    <input type="hidden" name="action" value="update">
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="first_name">First Name</label>
                            <input type="text" id="first_name" name="first_name" class="form-input" 
                                   value="<?php echo htmlspecialchars($student['first_name']); ?>" required>
                        </div>
                        <div class="form-group">
                            <label for="last_name">Last Name</label>
                            <input type="text" id="last_name" name="last_name" class="form-input" 
                                   value="<?php echo htmlspecialchars($student['last_name']); ?>" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" class="form-input" 
                               value="<?php echo htmlspecialchars($student['email']); ?>" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="new_password">New Password (leave blank to keep current password)</label>
                        <input type="text" id="new_password" name="new_password" class="form-input" 
                               placeholder="Enter new password (min 6 characters)">
                        <small style="color: #718096; margin-top: 5px; display: block;">
                            Note: If you set a new password, make sure to inform the student of their new password.
                        </small>
                    </div>
                    
                    <div class="button-group">
                        <button type="submit" class="form-button btn-primary">Update Student Details</button>
                        <a href="teacher_dashboard.php" class="form-button btn-secondary" style="text-decoration: none; display: inline-block; text-align: center;">Cancel</a>
                    </div>
                </form>
            </div>
            
            <div class="details-section">
                <h3 class="section-title">Skills Progress</h3>
                <div class="skills-grid">
                    <?php foreach ($skills as $skill): ?>
                        <div class="skill-card">
                            <div class="skill-name"><?php echo htmlspecialchars($skill['skill_name']); ?></div>
                            <?php if ($skill['skill_description']): ?>
                                <div class="skill-description"><?php echo htmlspecialchars($skill['skill_description']); ?></div>
                            <?php endif; ?>
                            <?php if ($skill['unit']): ?>
                                <div style="font-size: 0.85rem; color: #4299e1; margin-bottom: 10px;">
                                    Unit: <?php echo htmlspecialchars($skill['unit']); ?>
                                </div>
                            <?php endif; ?>
                            <span class="skill-status status-<?php echo $skill['status']; ?>">
                                <?php echo ucfirst(str_replace('_', ' ', $skill['status'])); ?>
                            </span>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </div>
</body>
</html>