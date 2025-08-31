<?php
session_start();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL 1 Hub - Login</title>
    <link rel="stylesheet" href="css/asl-style.css">
    <style>
        /* Modal styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.3s;
        }
        
        .modal.show {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .modal-content {
            background: rgba(255, 255, 255, 0.98);
            border-radius: 15px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }
        
        .modal-header h2 {
            color: #2d3748;
            margin: 0;
        }
        
        .close-btn {
            background: none;
            border: none;
            font-size: 28px;
            color: #718096;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.3s;
        }
        
        .close-btn:hover {
            color: #2d3748;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from {
                transform: translateY(50px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        
        .create-account-btn {
            background: linear-gradient(135deg, #38a169 0%, #2f855a 100%);
            margin-top: 15px;
        }
        
        .create-account-btn:hover {
            background: linear-gradient(135deg, #2f855a 0%, #276749 100%);
        }
        
        .login-card {
            max-width: 400px;
        }
        
        .form-section {
            background: transparent;
            border: none;
            padding: 0;
        }
        
        .level-indicator {
            background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
            display: inline-block;
            margin-bottom: 20px;
        }
        
        .password-match-indicator {
            font-size: 0.85rem;
            margin-top: 5px;
            transition: all 0.3s;
        }
        
        .password-match-indicator.match {
            color: #38a169;
        }
        
        .password-match-indicator.no-match {
            color: #e53e3e;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <div class="login-header">
                <h1>ASL 1 Hub</h1>
                <div class="level-indicator">Level 1</div>
                <p class="login-subtitle">Welcome to your ASL 1 Learning Portal</p>
            </div>
            
            <?php
            if (isset($_SESSION['message'])) {
                echo '<div class="message ' . $_SESSION['message_type'] . '">' . $_SESSION['message'] . '</div>';
                unset($_SESSION['message']);
                unset($_SESSION['message_type']);
            }
            ?>
            
            <!-- Simplified Login Form -->
            <div class="form-section">
                <h2>Student & Teacher Login</h2>
                <form action="login.php" method="POST">
                    <div class="form-group">
                        <label for="first_name">First Name</label>
                        <input type="text" id="first_name" name="first_name" class="form-input" placeholder="Enter your first name" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" class="form-input" placeholder="Enter your password" required>
                    </div>
                    <button type="submit" class="form-button">Login</button>
                    <button type="button" class="form-button create-account-btn" onclick="openModal()">Create New Account</button>
                </form>
            </div>
            
            <div class="text-center" style="margin-top: 20px;">
                <a href="../" class="back-btn">← Back to Main Portal</a>
            </div>
        </div>
    </div>
    
    <!-- Registration Modal -->
    <div id="registrationModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create New ASL 1 Account</h2>
                <button class="close-btn" onclick="closeModal()">&times;</button>
            </div>
            
            <form action="register.php" method="POST" id="registrationForm">
                <input type="hidden" name="level" value="1">
                <div class="form-group">
                    <label for="preset_password">Class Password</label>
                    <input type="password" id="preset_password" name="preset_password" class="form-input" placeholder="Enter class password" required>
                </div>
                <div class="form-group">
                    <label for="reg_first_name">First Name</label>
                    <input type="text" id="reg_first_name" name="first_name" class="form-input" placeholder="Enter your first name" required>
                </div>
                <div class="form-group">
                    <label for="reg_last_name">Last Name</label>
                    <input type="text" id="reg_last_name" name="last_name" class="form-input" placeholder="Enter your last name" required>
                </div>
                <div class="form-group">
                    <label for="reg_email">School Email</label>
                    <input type="email" id="reg_email" name="email" class="form-input" placeholder="Enter your school email" required>
                </div>
                <div class="form-group">
                    <label for="reg_password">Password</label>
                    <input type="password" id="reg_password" name="password" class="form-input" placeholder="Create a password (min 6 characters)" required oninput="checkPasswordMatch()">
                </div>
                <div class="form-group">
                    <label for="reg_password_confirm">Confirm Password</label>
                    <input type="password" id="reg_password_confirm" name="password_confirm" class="form-input" placeholder="Confirm your password" required oninput="checkPasswordMatch()">
                    <div id="passwordMatchIndicator" class="password-match-indicator"></div>
                </div>
                <button type="submit" class="form-button">Create Account</button>
            </form>
        </div>
    </div>
    
    <script>
        function openModal() {
            document.getElementById('registrationModal').classList.add('show');
            document.body.style.overflow = 'hidden';
        }
        
        function closeModal() {
            document.getElementById('registrationModal').classList.remove('show');
            document.body.style.overflow = 'auto';
            // Reset form
            document.getElementById('registrationForm').reset();
            document.getElementById('passwordMatchIndicator').textContent = '';
        }
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('registrationModal');
            if (event.target === modal) {
                closeModal();
            }
        }
        
        // Check password match
        function checkPasswordMatch() {
            const password = document.getElementById('reg_password').value;
            const confirmPassword = document.getElementById('reg_password_confirm').value;
            const indicator = document.getElementById('passwordMatchIndicator');
            
            if (confirmPassword === '') {
                indicator.textContent = '';
                indicator.className = 'password-match-indicator';
            } else if (password === confirmPassword) {
                indicator.textContent = '✓ Passwords match';
                indicator.className = 'password-match-indicator match';
            } else {
                indicator.textContent = '✗ Passwords do not match';
                indicator.className = 'password-match-indicator no-match';
            }
        }
        
        // Form validation
        document.getElementById('registrationForm').addEventListener('submit', function(e) {
            const password = document.getElementById('reg_password').value;
            const confirmPassword = document.getElementById('reg_password_confirm').value;
            
            if (password !== confirmPassword) {
                e.preventDefault();
                alert('Passwords do not match!');
                return false;
            }
            
            if (password.length < 6) {
                e.preventDefault();
                alert('Password must be at least 6 characters long!');
                return false;
            }
        });
    </script>
</body>
</html>