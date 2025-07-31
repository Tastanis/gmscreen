<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../../index.php');
    exit;
}

$user = $_SESSION['user'];
$is_gm = ($user === 'GM');

// Include version system
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../../version.php';
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monster Creator - Strixhaven</title>
    <link rel="stylesheet" href="../../css/style.css">
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        
        .coming-soon {
            text-align: center;
            padding: 50px;
            font-size: 1.5em;
            color: #666;
        }
        
        .version-footer {
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.9);
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 12px;
            color: #666;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }
        
        .version-info {
            font-weight: bold;
        }
        
        .version-updated {
            margin-left: 10px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Monster Creator</h1>
        
        <div class="coming-soon">
            <p>Monster Creator is coming soon!</p>
            <p>This feature will allow you to create and manage custom monsters for your Strixhaven campaign.</p>
        </div>
    </div>
    
    <!-- Version display -->
    <div class="version-footer">
        <span class="version-info"><?php echo Version::displayVersion(); ?></span>
        <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
    </div>
</body>
</html>