<?php
session_start();
require_once __DIR__ . '/../dnd/includes/no-cache.php';
session_destroy();
header('Location: index.php');
exit;
?>