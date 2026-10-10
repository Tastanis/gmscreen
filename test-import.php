<?php
// Left here on purpose: an old file of this name logged any visitor in as the GM, and a deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
