<?php
// Left here on purpose: an old file of this name asked for no login and showed any visitor the map page's start-up, with the players' view of the board in it and every PHP error. A deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
