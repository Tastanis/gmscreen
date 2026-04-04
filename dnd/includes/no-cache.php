<?php
/**
 * Prevents server-side and browser caching of PHP pages.
 * Include this at the top of any PHP file (before any output)
 * to ensure the latest version is always served.
 */
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
