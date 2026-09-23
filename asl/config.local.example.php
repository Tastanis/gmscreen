<?php
/**
 * Copy this file to config.local.php and fill in real values.
 * config.local.php is git-ignored — credentials never go into the repo.
 *
 * IMPORTANT: the old database password was committed to git history in
 * asl1/config.php. Create a NEW password for asl_admin in your hosting
 * control panel and use it here.
 */
return [
    // Optional absolute directory outside the website/checkout:
    // 'backup_dir' => '/home/YOUR_ACCOUNT/asl-private-backups',
    'host' => 'localhost',
    'dbname' => 'asl_users',
    'user' => 'asl_admin',
    'password' => 'CHANGE-ME',
];
