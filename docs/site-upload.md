# Uploading maps and creatures to the site without signing in

Two commands, run on your PC by you or by any of the chats, that put a map package or creature
files on the live site. They use a secret key in place of a login.

## The risk, plainly

This is a standing way to add or replace maps and creatures on the live site without signing
in. **It is as safe as the key file.** Anyone who has the file `key.txt` from your PC can do what
these two commands do. They cannot read your scenes, characters or accounts with it, sign in as
anyone, or delete anything; but they could add scenes and creatures, and replace a map or a
creature that has the same name.

What keeps it safe:

- The key is long and random and is made on your PC. It is never shown, never typed, never sent
  to a chat, and never put in the repository.
- The server keeps only a fingerprint of the key, in one file **outside** `public_html`.
- With that file missing, the upload does not exist: the site answers "not found", the same as
  for a page that is not there. **Deleting that one file switches the whole thing off.**
- It works over HTTPS only. Eight wrong keys in fifteen minutes and it refuses everyone until
  the fifteen minutes are up.
- It does three things and no others: file a map's pictures, import a map package, import
  creature files. The only things it tells a caller are the short result, the names of your scene
  folders and monster tabs, and the server's size limits.

## One-time setup (you do this once; about five minutes)

1. **Deploy this build** as usual: cPanel, Git Version Control, Update from Remote, Deploy HEAD
   Commit.

2. **Make the key.** On your PC, in the `gmscreen` folder, run:

   ```powershell
   node dnd/tools/site-upload.mjs setup
   ```

   It prints two file names and nothing secret:

   ```
   A new key was made. It is not shown, and you never need to see it.
     On this PC, keep:      C:\Users\tasta\.gmscreen-site-upload\key.txt
     Put on the server:     C:\Users\tasta\.gmscreen-site-upload\dnd-site-upload.php
   ```

3. **Put the second file on the server.** In cPanel **File Manager**, go to the account home
   `/home/rylabsuueil3` (the folder that *contains* `public_html`; do not go into `public_html`).
   Upload `dnd-site-upload.php` there. Right-click it, **Change Permissions**, set `0600`.

   Only that file goes up. `key.txt` stays on your PC and is never uploaded anywhere.

4. **Check it.** Back on your PC:

   ```powershell
   node dnd/tools/site-upload.mjs status
   ```

   The first live run should print something like this (your folders and tabs, and your
   server's real limits):

   ```
   The upload is switched on at https://bharmsasl.com, and the key is accepted.
   Scene folders: Lorehold, Prismari, Witherbloom.
   Monster creator tabs: Campus (General, Bosses); Orchard (Foes).
   Largest single picture the server takes: 64.0 MB (upload_max_filesize 64M, post_max_size 64M).
   Largest map design in one request: 32.0 MB. Memory 256M, time 120 seconds.
   ```

   The limits line is the server's own answer. A map's pictures are sent one at a time, so the
   number that matters is the largest single picture, not the size of the whole package. If a
   picture is over the limit the tool stops before sending anything and says so; the limit is
   raised in cPanel under **MultiPHP INI Editor** (`upload_max_filesize` and `post_max_size`).

   If it prints "The site says there is no upload here", either the build is not deployed yet or
   the file from step 3 is not in the account home. If it prints "The site refused the key", the
   file on the server is not the one made with the key on this PC: run setup again with
   `--new-key` and upload the new file.

## Uploading a map

```powershell
node dnd/tools/site-upload.mjs map "C:\Users\tasta\Desktop\dungeon alchemist\Gravity Orchard - Prismari.vttmap" --folder Prismari
```

"Upload this map into the folder Prismari and replace the old one":

```powershell
node dnd/tools/site-upload.mjs map "C:\Users\tasta\Desktop\dungeon alchemist\Gravity Orchard - Prismari.vttmap" --folder Prismari --replace
```

| Option | What it does |
|---|---|
| `--folder NAME` | Puts the scene in that folder of the Scenes list. Capitals do not matter. Without it, a new scene goes in no folder, as an import from the Scenes screen does. |
| `--create-folder` | Makes the folder if there is none of that name. Without it, a folder that does not exist is refused and the folders there are listed, so a typing slip does not make a stray folder. |
| `--replace` | Updates the scene of the same name in place. Without it, a map whose scene already exists is refused, so there are never two copies. |
| `--name NAME` | Gives the scene another name than the one in the package. |

It goes through the same checks and the same import as the Scenes screen. A package the Scenes
screen would refuse is refused here, with the same reason, and leaves nothing behind. It answers
in plain words:

```
Will replace "The Gravity Orchard" in the folder Prismari.
Uploading image 1 of 2…
Uploading image 2 of 2…
Replaced the scene "The Gravity Orchard" in the folder Prismari.
It has 6 floors, 456 walls (188 breakable), 19 plates, 23 ramps and 85 zones.
Kept as they were: 7 tokens, 1 drawing, 0 templates, what each player has explored, and 4 broken walls.
```

### What replacing keeps, and what it changes

Replaced by the new package: the map's pictures, floors, grid, heights, walls, plates, ramps
and zones.

Kept exactly as they were:

- **Every token**, where it stands. A floor keeps its identity from one version of a map to the
  next, so a token on the upper floor is still on the upper floor.
- Drawings and templates, and a fight in progress.
- **What each player has explored**, as long as the ground picture, the grid and the ground
  heights are the same as before. A new version that only changes walls, plates, ramps, zones or
  the pictures of upper floors does not make anyone forget where they have been. If the ground
  picture itself, the grid or the heights changed, explored ground starts again on that scene,
  and the report says so in place of "what each player has explored".
- **Broken walls.** A wall that was broken and is still in the new map stays broken.
- The scene's place in its folder, unless you name another folder.
- Who is on the scene. If it is the scene on the table, open browsers are sent the new map.

Things to know:

- A token on a floor the new map no longer has is put on the ground floor, in its square, and
  the report says so.
- Tokens that come inside the package are **not** added when replacing, because the scene's own
  tokens are the ones in use. The report says how many were left out.
- A picture that is the same as one uploaded before keeps its address and is not filed twice.
  A picture that changed is filed as a new one, and the old one stays in the site's upload
  folder; nothing is deleted.
- A scene is matched by its name. If two scenes have the same name, the tool refuses to guess
  and asks you to rename or delete one.

## Uploading creatures

One file, or a folder of `.json` files:

```powershell
node dnd/tools/site-upload.mjs creature "C:\creatures\orchard-tender.json" --tab "Gravity Orchard" --create-tab
node dnd/tools/site-upload.mjs creature "C:\creatures\orchard" --replace
```

| Option | What it does |
|---|---|
| `--tab NAME` | The monster creator tab a **new** creature goes in. Without it: a tab called "Imported". |
| `--subtab NAME` | The sub-tab. Without it: "General". |
| `--create-tab` | Makes the named tab if there is none. Without it, a tab that does not exist is refused. |
| `--replace` | Puts the creature in place of the one with the same name. Without it, a creature whose name is already there is refused. |
| `--force` | Uploads a file even though the automation checker found problems. |

Each file is read on your PC by the monster creator's own import, unchanged, and held to the
strict automation checker: no warnings, and no field the app does not know. A file that fails
is not sent, and each problem is listed. The rest of a folder still goes.

```
orchard-tender.json: replaced "Orchard Tender" (9 abilities), in Gravity Orchard / Foes.
driftstone.json: created "Driftstone" (7 abilities), in Imported / General.
old-draft.json: NOT uploaded. The automation checker found 1 problem (add --force to upload anyway):
    Codified Edict: automation.cards[0].effects[0]: unsupported field(s): text
2 uploaded, 1 not.
```

A replaced creature keeps its place in the tabs and its portrait. **Portraits are not uploaded
by this tool**: a creature file names a picture's address but does not carry the picture, and
the monster creator uploads portraits in a step of its own. Add or change a portrait in the
monster creator as before.

**Reload the monster creator after an upload.** If the monster creator is open in a browser
while creatures are uploaded, its next Save writes the whole list as that browser has it and
would undo the upload. A backup of the list is made before every write, as with the monster
creator's own Save.

## Switching it off, and making a new key

- **Off:** in cPanel File Manager, delete `/home/rylabsuueil3/dnd-site-upload.php`. From that
  moment the site answers "not found" to everyone, whatever key they hold.
- **New key** (if the PC is lost, or you are simply unsure): run
  `node dnd/tools/site-upload.mjs setup --new-key`, and upload the new `dnd-site-upload.php`
  over the old one. The old key stops working the moment the file is replaced.

## For whoever maintains this

- Endpoint: `dnd/admin/site-upload/index.php`, with its rules in `lib.php`. Tool:
  `dnd/tools/site-upload.mjs`. Tests: `dnd/vtt/api/v2/tests/site-upload.test.php` and
  `dnd/vtt/assets/js/ui/__tests__/site-upload-tool.test.mjs`.
- Nothing is a second copy of the app's own code. Pictures go through `MapImageStore` (the
  Scenes screen's upload), packages through `SyncV2Store::installScenePackage` and the scene
  list in `api/scenes.php`, the bundle check and picture upload through `scene-map-bundle.mjs`,
  creatures through `monster-builder.js` and the automation harness, and the monster file
  through `includes/monster-store.php` (the monster creator's Save).
- Replacing in place is `SyncV2Store::replaceSceneDesign`. Browsers are sent the whole-scene
  event a checkpoint restore uses.
- The key travels in the `X-GMScreen-Upload-Key` header, never in an address. The tool refuses
  redirects and anything but HTTPS. `--loopback` allows `http://127.0.0.1` for the test sandbox
  only, and only if that sandbox's own configuration file says `'allow_loopback_http' => true`.
- The uploaded package itself is never written to disk. A map's pictures are decoded and
  written out again by PHP under random names in `dnd/vtt/storage/uploads`, where the board
  loads them from, exactly as an upload from the Scenes screen is.
