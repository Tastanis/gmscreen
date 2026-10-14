<?php
// Left here on purpose: an old file of this name (the dashboard's inventory, taken out of the code in June 2026) asked for no login at all and stored an uploaded file under the ending of the name it came with, for anyone on the internet. A deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
