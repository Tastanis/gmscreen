<?php
session_start();

// Define users and passwords
$users = array(
    'frunk' => 'frunk',
    'sharon' => 'sharon',
    'indigo' => 'indigo',
    'zepha' => 'zepha',
    'harms' => 'GM'  // password 'harms' maps to user 'GM'
);

// Secret key for signing remember-me cookies (HMAC)
define('REMEMBER_SECRET', 'dnd-portal-remember-key-2024');
define('REMEMBER_COOKIE', 'dnd_remember');
define('REMEMBER_DAYS', 30);

/**
 * Create a signed remember-me cookie value.
 */
function createRememberToken($user) {
    $expires = time() + (REMEMBER_DAYS * 86400);
    $payload = $user . '|' . $expires;
    $signature = hash_hmac('sha256', $payload, REMEMBER_SECRET);
    return $payload . '|' . $signature;
}

/**
 * Validate a remember-me cookie and return the user, or false.
 */
function validateRememberToken($token) {
    $parts = explode('|', $token);
    if (count($parts) !== 3) return false;

    list($user, $expires, $signature) = $parts;

    // Check expiration
    if (time() > (int)$expires) return false;

    // Verify signature
    $expected = hash_hmac('sha256', $user . '|' . $expires, REMEMBER_SECRET);
    if (!hash_equals($expected, $signature)) return false;

    return $user;
}

$error_message = '';

// Handle login form submission
if (isset($_POST['password']) && $_POST['password'] != '') {
    $password = trim($_POST['password']);

    if (isset($users[$password])) {
        $_SESSION['user'] = $users[$password];
        $_SESSION['logged_in'] = true;

        // Set remember-me cookie if checkbox was checked
        if (!empty($_POST['remember'])) {
            $token = createRememberToken($users[$password]);
            setcookie(REMEMBER_COOKIE, $token, time() + (REMEMBER_DAYS * 86400), '/');
        }

        header('Location: dashboard.php');
        exit;
    } else {
        $error_message = 'Invalid password';
    }
}

// Auto-login from remember-me cookie
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    if (isset($_COOKIE[REMEMBER_COOKIE])) {
        $user = validateRememberToken($_COOKIE[REMEMBER_COOKIE]);
        if ($user !== false) {
            $_SESSION['user'] = $user;
            $_SESSION['logged_in'] = true;
            header('Location: dashboard.php');
            exit;
        } else {
            // Invalid/expired token — clear it
            setcookie(REMEMBER_COOKIE, '', time() - 3600, '/');
        }
    }
}

// If already logged in, redirect to dashboard
if (isset($_SESSION['logged_in']) && $_SESSION['logged_in'] === true) {
    header('Location: dashboard.php');
    exit;
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D&D Character Portal - Login</title>
    <style>
        /* Login-specific styles to override main CSS */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .login-container {
            background: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-width: 400px;
            width: 100%;
        }

        .login-container h1 {
            text-align: center;
            margin-bottom: 30px;
            color: #2c3e50;
            font-size: 1.8em;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #34495e;
        }

        .form-group input[type="password"] {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #ecf0f1;
            border-radius: 8px;
            font-size: 1em;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
            background: rgba(255, 255, 255, 0.9);
        }

        .form-group input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .error {
            color: #e74c3c;
            background: rgba(231, 76, 60, 0.1);
            padding: 10px;
            border-radius: 5px;
            margin: 15px 0;
            border: 1px solid rgba(231, 76, 60, 0.2);
            text-align: center;
        }

        button {
            width: 100%;
            background: #667eea;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
            font-weight: 500;
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }

        button:hover {
            background: #5a67d8;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        button:active {
            transform: translateY(0);
        }

        .remember-group {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            gap: 8px;
        }

        .remember-group input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #667eea;
            cursor: pointer;
        }

        .remember-group label {
            font-size: 0.9em;
            color: #555;
            cursor: pointer;
            user-select: none;
        }

        /* Responsive design */
        @media (max-width: 480px) {
            .login-container {
                padding: 30px 20px;
                margin: 10px;
            }
            
            .login-container h1 {
                font-size: 1.5em;
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>D&D Character Portal</h1>
        <form method="POST">
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            <div class="remember-group">
                <input type="checkbox" id="remember" name="remember" value="1">
                <label for="remember">Stay signed in</label>
            </div>
            <?php if ($error_message): ?>
                <div class="error"><?= htmlspecialchars($error_message) ?></div>
            <?php endif; ?>
            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>