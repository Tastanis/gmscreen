<?php
session_start();

// Destroy all session data
session_destroy();

// Clear session cookie
if (isset($_COOKIE[session_name()])) {
    setcookie(session_name(), '', time()-3600, '/');
}

// Clear remember-me cookie
if (isset($_COOKIE['dnd_remember'])) {
    setcookie('dnd_remember', '', time()-3600, '/');
}

// Redirect to login page
header('Location: index.php');
exit;
?>