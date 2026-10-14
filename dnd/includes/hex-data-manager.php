<?php
// Left here on purpose: this file was the database storage for the hex map that was never the one in use (the 3D map keeps its hexes in files); nothing reads it since Build 510. A deploy copies over old files but never deletes them, so this one replaces it. Delete it from the host and from the repository once the old one is gone.
http_response_code(404);
exit;
