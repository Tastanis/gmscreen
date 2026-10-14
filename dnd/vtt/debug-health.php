<?php
// Left here on purpose: an old file of this name printed the server's details to whoever sent its key, and the key was written in the file, so it is in the repository's history. A deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
