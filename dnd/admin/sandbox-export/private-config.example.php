<?php
// Save as /home/YOUR_CPANEL_USER/dnd-sandbox-export.php, outside public_html.
// This example is deliberately disabled. Never put a plaintext token here.
return [
    'token_sha256' => '',
    // Confirm whether the DEPLOYED HexDataManager uses JSON or MySQL.
    // 'json' permits sandbox preparation; 'mysql'/'unreviewed' blocks it.
    'hex_storage' => 'unreviewed',
    // Optional reviewed D&D-only storage outside the main folder. Never add ASL.
    // These are directory mounts; do not overlap existing dnd paths.
    'extra_dnd_roots' => [],
    'allow_loopback_http' => false,
];
