<?php
// Left here on purpose: the old inventory page was replaced by the character sheet's inventory tab (dnd/character_sheet/inventory_handler.php); Brandon, October 13, 2026: "Let's get rid of the old hex map and the old inventory page. Make sure they're fully dead." A deploy copies over old files but never deletes them, so this one replaces the old one and answers nothing. Its saved data and pictures on the host are not touched.
http_response_code(404);
exit;
