<?php
// Database configuration
$servername = "localhost";
$username = "asl_admin";                    // Your database user
$password = "2150881stave.nw";       // Replace with the password you created for asl_admin
$dbname = "asl_users";                     // Your database name

try {
    $pdo = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}
?>