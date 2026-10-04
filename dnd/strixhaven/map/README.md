# Strixhaven map data

The flat hex map that lived here has been retired. The map is now `dnd/strixhaven/map3d/`
(the "Map" button on the Strixhaven bar), and `index.php` here only redirects to it.

What remains in this folder is the map's server side, which the 3D map uses:

- `hex-data-handler.php` - each hex's notes and images (GM section and players' section), image reveal, edit locks
- `api/ping-api.php` - pings and the GM's "pull everyone to my view" ping
- `api/player-path-api.php` - the players' route, destinations and terrain difficulty
- `api/hex-api.php`, `setup.php` - the older database-backed variant, unused by the 3D map
- `hex-data/`, `hex-images/`, `data/` - the saved notes, uploaded images and path/ping state (live host only; ignored by Git)

Do not delete this folder: the notes and images live here.
