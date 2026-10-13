<?php
// Left here on purpose: the old hex map's database storage was never the one in use (the 3D map reads and writes through ../hex-data-handler.php); Brandon, October 13, 2026: "Let's get rid of the old hex map and the old inventory page. Make sure they're fully dead." A deploy copies over old files but never deletes them, so this one replaces the old one and answers nothing. Its saved data and pictures on the host are not touched.
http_response_code(404);
exit;
