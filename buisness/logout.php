<?php
require_once __DIR__ . '/auth.php';
buisness_logout();
header('Location: index.php');
exit;
