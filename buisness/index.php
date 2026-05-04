<?php
require_once __DIR__ . '/auth.php';

// Already logged in -> jump straight to projects
if (buisness_is_logged_in()) {
    header('Location: projects.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $u = $_POST['username'] ?? '';
    $p = $_POST['password'] ?? '';
    if (buisness_attempt_login($u, $p)) {
        header('Location: projects.php');
        exit;
    }
    $error = 'Invalid username or password.';
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sign in - Business</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/business.css">
</head>
<body class="no-chrome">

<div class="page loginWrap">
  <div class="loginInner">
    <div class="loginMark">B</div>
    <div>
      <h1 class="loginTitle">Welcome back.</h1>
      <p class="loginSub">Sign in to manage your business projects.</p>
    </div>
    <form class="loginCard" method="post" action="index.php" autocomplete="off">
      <div class="field">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" placeholder="Username" autofocus required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="Password" required />
      </div>
      <?php if ($error !== ''): ?>
        <div class="loginError"><?php echo htmlspecialchars($error); ?></div>
      <?php endif; ?>
      <button type="submit" class="pillBtn dark">Continue</button>
      <div class="loginFoot">
        <a>Forgot password?</a>
        <a>Create account</a>
      </div>
    </form>
    <p class="legalTiny">By continuing you agree to our <a>Terms of Service</a> and <a>Privacy Policy</a>.</p>
  </div>
</div>

</body>
</html>
