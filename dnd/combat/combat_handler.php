<?php
// Left here on purpose: an old file of this name (the old combat page's handler, long out of the code) read and saved that page's data and took picture uploads the old way. A deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
