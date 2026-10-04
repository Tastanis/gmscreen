<?php
// The flat hex map has been retired. Its address now leads to the 3D map, which reads and writes
// the same notes, images, pings and player paths through the files kept in this folder.
header('Location: ../map3d/index.php', true, 302);
exit;
