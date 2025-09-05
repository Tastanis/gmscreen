<?php
session_start();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>ASL Hub - Login</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="login-container">
        <div class="login-card">
            <div class="login-header">
                <h1>ASL Hub</h1>
                <p class="login-subtitle">Welcome to your ASL Learning Portal</p>
            </div>
            
            <?php
            if (isset($_SESSION['message'])) {
                echo '<div class="message ' . $_SESSION['message_type'] . '">' . $_SESSION['message'] . '</div>';
                unset($_SESSION['message']);
                unset($_SESSION['message_type']);
            }
            ?>
            
            <!-- Existing User Login -->
            <div class="form-section">
                <h2>Student & Teacher Login</h2>
                <form action="login.php" method="POST">
                    <div class="form-group">
                        <label for="first_name">First Name</label>
                        <input type="text" id="first_name" name="first_name" class="form-input" placeholder="Enter your first name" required>
                    </div>
                    <div class="form-group">
                        <label for="last_name">Last Name</label>
                        <input type="text" id="last_name" name="last_name" class="form-input" placeholder="Enter your last name" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" name="password" class="form-input" placeholder="Enter your password" required>
                    </div>
                    <button type="submit" class="form-button">Login</button>
                    <button type="button" class="form-button forgot-password-btn" onclick="toggleForgotPassword()">Forgot Password/Username?</button>
                </form>
            </div>
            
            <!-- Forgot Password Section -->
            <div class="form-section" id="forgot-password-section" style="display: none;">
                <h2>Forgot Password</h2>
                <form action="forgot_password.php" method="POST">
                    <div class="form-group">
                        <label for="email">School Email Address</label>
                        <input type="email" id="email" name="email" class="form-input" placeholder="Enter your school email" required>
                    </div>
                    <button type="submit" class="form-button">Send Reset Email</button>
                    <button type="button" class="form-button" onclick="toggleForgotPassword()">Back to Login</button>
                </form>
            </div>
            
            <!-- New Account Registration -->
            <div class="form-section" id="register-section">
                <h2>Create New Account</h2>
                <form action="register.php" method="POST">
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
                        <input type="password" id="reg_password" name="password" class="form-input" placeholder="Create a password" required>
                    </div>
                    <div class="form-group">
                        <label for="reg_password_confirm">Confirm Password</label>
                        <input type="password" id="reg_password_confirm" name="password_confirm" class="form-input" placeholder="Confirm your password" required>
                    </div>
                    <button type="submit" class="form-button">Create Account</button>
                </form>
            </div>
            
            <div class="text-center" style="margin-top: 20px;">
                <a href="../" class="back-btn">← Back to Main Portal</a>
            </div>
        </div>
    </div>
    
    <script>
        function toggleForgotPassword() {
            const forgotSection = document.getElementById('forgot-password-section');
            const registerSection = document.getElementById('register-section');
            
            if (forgotSection.style.display === 'none') {
                forgotSection.style.display = 'block';
                registerSection.style.display = 'none';
            } else {
                forgotSection.style.display = 'none';
                registerSection.style.display = 'block';
            }
        }
    </script>
</body>
</html>