<?php
require_once __DIR__ . '/config.php';

// Already logged in? Go to the right dashboard.
$me = aslhub_current_user($pdo);
if ($me) {
    header('Location: ' . (!empty($me['is_teacher']) ? 'teacher/dashboard.php' : 'dashboard.php'));
    exit;
}

$csrf = aslhub_csrf_token();
$teachers = aslhub_valid_teachers();

// Sticky values after a failed signup
$old = $_SESSION['signup_old'] ?? [];
$signupErrors = $_SESSION['signup_errors'] ?? [];
unset($_SESSION['signup_old'], $_SESSION['signup_errors']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - Create Account</title>
    <link rel="stylesheet" href="css/asl-style.css">
    <link rel="stylesheet" href="css/hub.css">
</head>
<body>
    <div class="login-container" style="max-width:560px;">
        <div class="login-card">
            <div class="login-header">
                <h1>Create Your Account</h1>
                <p class="login-subtitle">One quick form and you're in</p>
            </div>

            <?php if ($signupErrors): ?>
                <div class="message error">
                    <?php foreach ($signupErrors as $err): ?>
                        <div><?php echo aslhub_h($err); ?></div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>

            <form action="register.php" method="POST" id="registrationForm" class="form-section">
                <input type="hidden" name="csrf_token" value="<?php echo $csrf; ?>">
                <div class="form-group">
                    <label for="preset_password">Class Signup Code</label>
                    <input type="password" id="preset_password" name="preset_password" class="form-input" placeholder="Ask your teacher for the code" required>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label for="reg_first_name">First Name</label>
                        <input type="text" id="reg_first_name" name="first_name" class="form-input" value="<?php echo aslhub_h($old['first_name'] ?? ''); ?>" required>
                    </div>
                    <div class="form-group">
                        <label for="reg_last_name">Last Name</label>
                        <input type="text" id="reg_last_name" name="last_name" class="form-input" value="<?php echo aslhub_h($old['last_name'] ?? ''); ?>" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="reg_email">School Email</label>
                    <input type="email" id="reg_email" name="email" class="form-input" value="<?php echo aslhub_h($old['email'] ?? ''); ?>" placeholder="you@school.edu" required>
                </div>
                <div class="form-row-3">
                    <div class="form-group">
                        <label for="reg_teacher">Teacher</label>
                        <select id="reg_teacher" name="teacher" class="form-input" required>
                            <option value="" disabled <?php echo empty($old['teacher']) ? 'selected' : ''; ?>>Choose&hellip;</option>
                            <?php foreach ($teachers as $key => $label): ?>
                                <option value="<?php echo $key; ?>" <?php echo (($old['teacher'] ?? '') === $key) ? 'selected' : ''; ?>><?php echo $label; ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="reg_period">Period</label>
                        <select id="reg_period" name="class_period" class="form-input" required>
                            <option value="" disabled <?php echo empty($old['class_period']) ? 'selected' : ''; ?>>Choose&hellip;</option>
                            <?php for ($i = 1; $i <= 6; $i++): ?>
                                <option value="<?php echo $i; ?>" <?php echo ((int)($old['class_period'] ?? 0) === $i) ? 'selected' : ''; ?>>Period <?php echo $i; ?></option>
                            <?php endfor; ?>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="reg_level">ASL Level</label>
                        <select id="reg_level" name="level" class="form-input" required>
                            <option value="" disabled <?php echo empty($old['level']) ? 'selected' : ''; ?>>Choose&hellip;</option>
                            <?php for ($i = 1; $i <= 3; $i++): ?>
                                <option value="<?php echo $i; ?>" <?php echo ((int)($old['level'] ?? 0) === $i) ? 'selected' : ''; ?>>ASL <?php echo $i; ?></option>
                            <?php endfor; ?>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label for="reg_password">Password</label>
                    <input type="password" id="reg_password" name="password" class="form-input" placeholder="At least 6 characters" required oninput="checkPasswordMatch()">
                </div>
                <div class="form-group">
                    <label for="reg_password_confirm">Confirm Password</label>
                    <input type="password" id="reg_password_confirm" name="password_confirm" class="form-input" required oninput="checkPasswordMatch()">
                    <div id="passwordMatchIndicator" class="password-match-indicator"></div>
                </div>
                <button type="submit" class="form-button">Create Account</button>
            </form>

            <div class="text-center" style="margin-top: 20px;">
                <a href="index.php" class="back-btn">&larr; Back to Login</a>
            </div>
        </div>
    </div>

    <script>
        function checkPasswordMatch() {
            const p = document.getElementById('reg_password').value;
            const c = document.getElementById('reg_password_confirm').value;
            const ind = document.getElementById('passwordMatchIndicator');
            if (c === '') { ind.textContent = ''; ind.className = 'password-match-indicator'; }
            else if (p === c) { ind.textContent = '✓ Passwords match'; ind.className = 'password-match-indicator match'; }
            else { ind.textContent = '✗ Passwords do not match'; ind.className = 'password-match-indicator no-match'; }
        }
        document.getElementById('registrationForm').addEventListener('submit', function(e) {
            const p = document.getElementById('reg_password').value;
            const c = document.getElementById('reg_password_confirm').value;
            if (p !== c) { e.preventDefault(); alert('Passwords do not match!'); return false; }
            if (p.length < 6) { e.preventDefault(); alert('Password must be at least 6 characters long!'); return false; }
        });
    </script>
</body>
</html>
