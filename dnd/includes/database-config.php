<?php
// Left here on purpose: this file held the settings, password included, of a database storage for the hex map that was never the one in use; nothing reads it since Build 510. A deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
