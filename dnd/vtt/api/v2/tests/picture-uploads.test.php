<?php
declare(strict_types=1);
// Every other place the site takes a picture (Build 507). The Monster Creator's hole (Build 506, its own test)
// turned out to be the house style: the handlers kept the ending of the uploader's own file name, took the
// browser's word that the file was a picture, put ids from the request into the path as they came, and some
// deleted or copied whatever path was written in a record's "picture" field. Several of the Director's uploads
// took any login.
//
// These run the real handlers behind PHP's own command-line server, on a copy of the site's PHP files in an
// empty folder, with real uploads. What must hold everywhere: nothing is ever stored but a picture under a
// picture's ending, in the handler's own folder; no file of the site is ever deleted or copied by a request.
function uploadCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$dnd = realpath(__DIR__ . '/../../../..');
require_once $dnd . '/includes/picture-store.php';

// ---- the shared piece ------------------------------------------------------------------------------
foreach (['../../index', 'a/b', 'a\\b', 'a.php', '', 'a b', str_repeat('a', 101), null, ['x'], "a\n"] as $bad) {
    uploadCheck(PictureStore::namePart($bad) === null, 'A piece of a file name is letters, digits, "_" and "-" only: ' . json_encode($bad));
}
uploadCheck(PictureStore::namePart('staff_17_ab-c') === 'staff_17_ab-c' && PictureStore::namePart(12) === '12', 'and a plain one passes as it is');
uploadCheck(PictureStore::plainPart('../../staff_1.php') === 'staff_1php' && PictureStore::plainPart('../..') === null && PictureStore::plainPart(['x']) === null, 'An old id is stripped to what a file name may hold');

$base = sys_get_temp_dir() . '/vtt-picture-uploads-' . bin2hex(random_bytes(6));
$site = $base . '/dnd';
mkdir($base . '/sessions', 0777, true);
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
// The site's PHP files only: no data, no pictures.
$copy = static function (string $from, string $to) use (&$copy): void {
    foreach (scandir($from) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..' || $entry === 'node_modules' || $entry === 'vendor') continue;
        $path = $from . '/' . $entry;
        if (is_dir($path)) { $copy($path, $to . '/' . $entry); continue; }
        if (!str_ends_with($entry, '.php')) continue;
        if (!is_dir($to)) mkdir($to, 0777, true);
        copy($path, $to . '/' . $entry);
    }
};
$everyFile = static function (string $folder) use (&$everyFile): array {
    $found = [];
    foreach (is_dir($folder) ? (scandir($folder) ?: []) : [] as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $path = $folder . '/' . $entry;
        $found = is_dir($path) ? array_merge($found, $everyFile($path)) : array_merge($found, [$path]);
    }
    return $found;
};
$picturesIn = static fn (string $folder): array => array_values(array_filter(array_diff(is_dir("$site/$folder") ? (scandir("$site/$folder") ?: []) : [], ['.', '..', '.htaccess']), static fn ($name) => is_file("$site/$folder/$name")));

$gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');     // a one-pixel GIF: a true picture
$trap = $gif . '<?php echo "run"; ?>';                                           // still a GIF, with a script after it
$server = null;
try {
    foreach (['includes', 'strixhaven', 'character_sheet'] as $part) $copy("$dnd/$part", "$site/$part");
    copy("$dnd/version.php", "$site/version.php");
    mkdir("$site/data", 0777, true);
    copy("$dnd/data/version.json", "$site/data/version.json");

    // What the pages have on record: each "picture" field below is one a request could have written.
    $write = static function (string $path, array $data) use ($site): void { if (!is_dir(dirname("$site/$path"))) mkdir(dirname("$site/$path"), 0777, true); file_put_contents("$site/$path", json_encode($data)); };
    $write('strixhaven/staff/staff.json', ['staff' => [['staff_id' => 'staff_1', 'name' => 'One', 'images' => ['data-utils.php']], ['staff_id' => 'staff_2', 'name' => 'Two', 'images' => ['index.php']]], 'metadata' => []]);
    $write('strixhaven/students/students.json', ['students' => [['student_id' => 'student_1', 'name' => 'One', 'images' => ['data-utils.php']], ['student_id' => 'student_2', 'name' => 'Two', 'images' => ['index.php']]], 'metadata' => []]);
    $write('strixhaven/othernpcs/othernpcs.json', ['npcs' => [['npc_id' => 'npc_1', 'name' => 'One', 'images' => ['data-utils.php']], ['npc_id' => 'npc_2', 'name' => 'Two', 'images' => ['index.php']]], 'metadata' => []]);
    $write('strixhaven/locations/locations.json', ['locations' => [['location_id' => 'location_1', 'name' => 'One', 'images' => ['image-upload.php']], ['location_id' => 'location_2', 'name' => 'Two', 'images' => ['index.php']]], 'metadata' => []]);
    $write('strixhaven/data/inventory.json', ['cal' => ['items' => [
        ['id' => 'item_1', 'name' => 'A', 'image' => '../save_inventory.php'],
        ['id' => 'item_2', 'name' => 'B', 'image' => '../../includes/picture-store.php'],
        ['id' => 'item_3', 'name' => 'C', 'image' => ''],
    ]], 'shared' => ['items' => []], 'gm' => ['items' => []]]);
    $write('data/character_inventory.json', ['cal' => ['items' => [
        ['id' => 'item_a', 'name' => 'A', 'image' => '/dnd/images/logo.png'],
        ['id' => 'item_b', 'name' => 'B', 'image' => ''],
        ['id' => 'item_c', 'name' => 'C', 'image' => '/dnd/images/../character_sheet/inventory_handler.php'],
        ['id' => 'item_d', 'name' => 'D', 'image' => '/dnd/images/item_1750373239414_26ihytngo_1750712776.png'],
    ]]]);
    mkdir("$site/images", 0777, true);
    file_put_contents("$site/images/logo.png", $gif);                             // one of the site's own pictures
    file_put_contents("$site/images/item_1750373239414_26ihytngo_1750712776.png", $gif);   // an item's, as they were named before

    // Signs a request in as whoever its header names. Written here, for this test, and nowhere in the site.
    file_put_contents("$base/router.php", '<?php session_save_path(' . var_export("$base/sessions", true) . '); $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } return false;');
    $phpBefore = array_values(array_filter($everyFile($site), static fn ($path) => str_ends_with($path, '.php')));
    $hashBefore = array_map('md5_file', $phpBefore);

    $probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
    $extensions = is_file(dirname(PHP_BINARY) . '/ext/php_gd.dll') ? ['-d', 'extension_dir=' . dirname(PHP_BINARY) . '/ext', '-d', 'extension=gd', '-d', 'extension=fileinfo', '-d', 'extension=mbstring'] : [];
    $server = proc_open([PHP_BINARY, ...$extensions, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $site, "$base/router.php"], [['pipe', 'r'], ['file', "$base/server.log", 'a'], ['file', "$base/server.log", 'a']], $pipes);
    // One request: the fields, and one file when $file is [field, name, bytes]. Returns [status, decoded answer].
    $ask = static function (?string $user, string $path, array $fields, ?array $file = null) use ($port): array {
        $edge = 'edge' . bin2hex(random_bytes(6)); $body = '';
        foreach ($fields as $name => $value) $body .= "--$edge\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
        if ($file !== null) $body .= "--$edge\r\nContent-Disposition: form-data; name=\"{$file[0]}\"; filename=\"{$file[1]}\"\r\nContent-Type: image/png\r\n\r\n{$file[2]}\r\n";
        $context = stream_context_create(['http' => ['method' => 'POST', 'ignore_errors' => true, 'timeout' => 30, 'follow_location' => 0,
            'header' => trim(($user !== null ? "X-Test-User: $user\r\n" : '') . "Content-Type: multipart/form-data; boundary=$edge"), 'content' => $body . "--$edge--\r\n"]]);
        $answer = file_get_contents("http://127.0.0.1:$port/$path", false, $context);
        preg_match('/ (\d{3}) /', $http_response_header[0] ?? '', $status);
        clearstatcache();                       // the server is another process: what this one remembers of a file is stale
        return [(int) ($status[1] ?? 0), json_decode((string) $answer, true), (string) $answer];
    };
    for ($i = 0; $i < 80 && @file_get_contents("http://127.0.0.1:$port/version.php") === false && empty($http_response_header); $i++) usleep(100000);

    // ---- every upload, the same four questions -----------------------------------------------------
    // [what, the handler, its fields, the file's field, its folder, who besides the Director may use it]
    $uploads = [
        ['a picture in a student\'s notes', 'strixhaven/students/image-upload.php', [], 'image', 'strixhaven/students/uploads/images', null],
        ['a picture in a staff member\'s notes', 'strixhaven/staff/image-upload.php', [], 'image', 'strixhaven/staff/uploads/images', null],
        ['a picture in a location\'s notes', 'strixhaven/locations/image-upload.php', [], 'image', 'strixhaven/locations/uploads/images', null],
        ['a picture in the Director\'s notes', 'strixhaven/gm/image-upload.php', [], 'image', 'strixhaven/gm/uploads/images', null],
        ['a template\'s picture', 'strixhaven/templates/upload-image.php', ['template_id' => '../../t'], 'image', 'strixhaven/templates/images', null],
        ['a staff member\'s portrait', 'strixhaven/staff/index.php', ['action' => 'upload_portrait', 'staff_id' => 'staff_1'], 'portrait', 'strixhaven/staff/portraits', null],
        ['a student\'s portrait', 'strixhaven/students/index.php', ['action' => 'upload_portrait', 'student_id' => 'student_1'], 'portrait', 'strixhaven/students/portraits', null],
        ['another NPC\'s portrait', 'strixhaven/othernpcs/index.php', ['action' => 'upload_portrait', 'npc_id' => 'npc_1'], 'portrait', 'strixhaven/othernpcs/portraits', null],
        ['a location\'s picture', 'strixhaven/locations/index.php', ['action' => 'upload_image', 'location_id' => 'location_1'], 'image', 'strixhaven/locations/images', null],
        ['a hex\'s picture', 'strixhaven/map/hex-data-handler.php', ['action' => 'upload_image', 'q' => '1', 'r' => '-2', 'section' => 'player'], 'image', 'strixhaven/map/hex-images', 'cal'],
        ['an item\'s picture on the old inventory page', 'strixhaven/inventory/upload_item_image.php', ['action' => 'upload_image', 'item_id' => 'item_3'], 'image', 'strixhaven/inventory/images', 'cal'],
        ['a hireling\'s picture', 'character_sheet/upload_hireling_image.php', ['character' => 'cal', 'hireling_id' => 'h 1/../x'], 'image', 'character_sheet/data/hireling_images', 'cal'],
        ['an item\'s picture on the sheet', 'character_sheet/inventory_handler.php', ['action' => 'upload_image', 'item_id' => 'item_b'], 'image', 'images', 'cal'],
    ];
    foreach ($uploads as [$what, $handler, $fields, $field, $folder, $player]) {
        $before = $picturesIn($folder);
        // Nobody.
        $ask(null, $handler, $fields, [$field, 'portrait.gif', $gif]);
        uploadCheck($picturesIn($folder) === $before, "Without a login nothing is stored: $what");
        // A player, where the page is the Director's.
        if ($player === null) {
            [$status, $answer] = $ask('cal', $handler, $fields, [$field, 'portrait.gif', $gif]);
            uploadCheck(($answer['success'] ?? null) !== true && $picturesIn($folder) === $before, "A player's login cannot upload $what: " . json_encode([$status, $answer]));
        }
        $as = $player ?? 'GM';
        // What is not a picture at all, called one.
        [$status, $answer, $raw] = $ask($as, $handler, $fields, [$field, 'portrait.gif', '<?php echo "run"; ?>']);
        uploadCheck(($answer['success'] ?? null) === false && $picturesIn($folder) === $before, "What is not a picture is not stored: $what: " . substr($raw, 0, 300));
        // THE HOLE: a file called x.php that begins as a picture and goes on as a script.
        [$status, $answer, $raw] = $ask($as, $handler, $fields, [$field, 'x.php', $trap]);
        $new = array_values(array_diff($picturesIn($folder), $before));
        uploadCheck(($answer['success'] ?? null) === true && count($new) === 1 && preg_match('/^[A-Za-z0-9_-]+\.gif$/D', $new[0]) === 1,
            "A picture that came as x.php is stored as a .gif under the site's own name: $what: " . json_encode([$status, $new]) . substr($raw, 0, 300));
        foreach (['x.phtml', 'x.gif.php', '../../x.php'] as $name) $ask($as, $handler, $fields, [$field, $name, $trap]);
        uploadCheck(array_filter($picturesIn($folder), static fn ($name) => $name !== 'logo.png' && !str_starts_with($name, 'item_1750373239414_') && preg_match('/^[A-Za-z0-9_-]+(_thumb)?\.(gif|webp)$/D', $name) !== 1) === [], "whatever it was called: $what: " . json_encode($picturesIn($folder)));
        // (Uploads that follow each other inside a second must not delete one another.)
        uploadCheck(count($picturesIn($folder)) > count($before), "and a picture is there at the end of it: $what: " . json_encode($picturesIn($folder)));
        // The folder runs nothing.
        uploadCheck((string) @file_get_contents("$site/$folder/.htaccess") === PictureStore::rules(), "Its folder is given the rule file: $what");
    }
    uploadCheck(preg_match('/^t_\d+_[0-9a-f]{16}\.gif$/D', $picturesIn('strixhaven/templates/images')[0]) === 1, 'A template id with "../" in it names a file in the templates folder: ' . json_encode($picturesIn('strixhaven/templates/images')));
    uploadCheck(preg_match('/^cal_h1x_\d+\.gif$/D', $picturesIn('character_sheet/data/hireling_images')[0]) === 1 && count($picturesIn('character_sheet/data/hireling_images')) <= 2, 'and a hireling id the same; a hireling\'s older pictures are replaced: ' . json_encode($picturesIn('character_sheet/data/hireling_images')));

    // ---- ids and sections that go into a path ----------------------------------------------------
    $before = $picturesIn('strixhaven/inventory/images');
    [$status, $answer] = $ask('cal', 'strixhaven/inventory/upload_item_image.php', ['action' => 'upload_image', 'item_id' => '../../item_3'], ['image', 'p.gif', $gif]);
    uploadCheck(($answer['success'] ?? null) === false && $picturesIn('strixhaven/inventory/images') === $before, 'An item id with a folder in it stores nothing: ' . json_encode($answer));
    $before = $picturesIn('strixhaven/map/hex-images');
    foreach (['gm' => 'cal', '../../x' => 'cal', '../x' => 'GM', '' => 'GM'] as $section => $as) {
        [$status, $answer] = $ask($as, 'strixhaven/map/hex-data-handler.php', ['action' => 'upload_image', 'q' => '1', 'r' => '-2', 'section' => (string) $section], ['image', 'p.gif', $gif]);
        uploadCheck(($answer['success'] ?? null) === false && $picturesIn('strixhaven/map/hex-images') === $before, "A hex's picture goes to the players' side or the GM's, and a player's only to the players': " . json_encode([$section, $as, $answer]));
    }
    [$status, $answer] = $ask('cal', 'character_sheet/upload_hireling_image.php', ['character' => 'sharon', 'hireling_id' => 'h1'], ['image', 'p.gif', $gif]);
    uploadCheck(($answer['success'] ?? null) === false, 'A player still uploads a hireling\'s picture for their own sheet only');

    // ---- deleting and copying: only a picture, only in the handler's own folder ----------------------
    // The record pages: a record whose "pictures" are the site's own files.
    foreach ([['staff', 'staff_id', 'staff', 'delete_staff', 'data-utils.php'], ['students', 'student_id', 'student', 'delete_student', 'data-utils.php'], ['othernpcs', 'npc_id', 'npc', 'delete_npc', 'data-utils.php'], ['locations', 'location_id', 'location', 'delete_location', 'image-upload.php']] as [$page, $idField, $word, $deleteRecord, $victim]) {
        [$status, $answer] = $ask('GM', "strixhaven/$page/index.php", ['action' => 'delete_image', $idField => "{$word}_1", 'image_path' => $victim]);
        uploadCheck(is_file("$site/strixhaven/$page/$victim"), "Taking a \"picture\" off a record deletes no file of the site: $page: " . json_encode($answer));
        [$status, $answer] = $ask('GM', "strixhaven/$page/index.php", ['action' => $deleteRecord, $idField => "{$word}_2"]);
        uploadCheck(($answer['success'] ?? null) === true && is_file("$site/strixhaven/$page/index.php"), "nor does deleting the record: $page: " . json_encode($answer));
        // A real one goes, with its thumbnail.
        $folder = $page === 'locations' ? 'images' : 'portraits';
        $real = array_values(array_filter($picturesIn("strixhaven/$page/$folder"), static fn ($name) => str_ends_with($name, '.gif')));
        [$status, $answer] = $ask('GM', "strixhaven/$page/index.php", ['action' => 'delete_image', $idField => "{$word}_1", 'image_path' => "$folder/{$real[0]}"]);
        uploadCheck(($answer['success'] ?? null) === true && !is_file("$site/strixhaven/$page/$folder/{$real[0]}"), "The Director deletes a real picture: $page: " . json_encode($answer));
        if ($page !== 'locations' && function_exists('imagewebp')) uploadCheck(!is_file("$site/strixhaven/$page/thumbnails/" . pathinfo($real[0], PATHINFO_FILENAME) . '_thumb.webp'), "and its thumbnail: $page");
    }

    // The old inventory page: an item whose "picture" is one of the site's files. Sharing it used to COPY that
    // file into the pictures folder, where anyone could fetch it, and then delete the original.
    [$status, $answer] = $ask('cal', 'strixhaven/inventory/save_inventory.php', ['action' => 'share_item', 'from_tab' => 'cal', 'to_tab' => 'shared', 'index' => '1']);
    uploadCheck(is_file("$site/includes/picture-store.php") && count($picturesIn('strixhaven/inventory/images')) === 1, 'Sharing an item copies and deletes nothing but its own picture: ' . json_encode([$answer, $picturesIn('strixhaven/inventory/images')]));
    [$status, $answer] = $ask('cal', 'strixhaven/inventory/save_inventory.php', ['action' => 'delete_item', 'tab' => 'cal', 'index' => '0']);
    uploadCheck(($answer['success'] ?? null) === true && is_file("$site/strixhaven/inventory/save_inventory.php"), 'Deleting an item deletes no file of the site: ' . json_encode($answer));
    // What is left in cal's tab is item_3, with the true picture stored above: it travels with the item.
    $own = $picturesIn('strixhaven/inventory/images');
    [$status, $answer] = $ask('cal', 'strixhaven/inventory/save_inventory.php', ['action' => 'share_item', 'from_tab' => 'cal', 'to_tab' => 'shared', 'index' => '0']);
    $now = $picturesIn('strixhaven/inventory/images');
    uploadCheck(($answer['success'] ?? null) === true && count($now) === 1 && $now !== $own && str_ends_with($now[0], '.gif'), 'An item\'s own picture still goes with it when it is shared: ' . json_encode([$answer, $own, $now]));

    // The sheet's inventory: its folder holds the site's own pictures too.
    [$status, $answer] = $ask('cal', 'character_sheet/inventory_handler.php', ['action' => 'delete_item', 'tab' => 'cal', 'item_id' => 'item_a']);
    uploadCheck(($answer['success'] ?? null) === true && is_file("$site/images/logo.png"), 'Deleting an item whose "picture" is one of the site\'s own leaves it: ' . json_encode($answer));
    [$status, $answer] = $ask('cal', 'character_sheet/inventory_handler.php', ['action' => 'delete_item', 'tab' => 'cal', 'item_id' => 'item_c']);
    uploadCheck(($answer['success'] ?? null) === true && is_file("$site/character_sheet/inventory_handler.php"), 'or a file of the site: ' . json_encode($answer));
    $own = array_values(array_filter($picturesIn('images'), static fn ($name) => preg_match('/^item_b_[0-9a-f]{24}\.gif$/D', $name) === 1));
    [$status, $answer] = $ask('cal', 'character_sheet/inventory_handler.php', ['action' => 'delete_item', 'tab' => 'cal', 'item_id' => 'item_b']);
    uploadCheck(count($own) === 1 && ($answer['success'] ?? null) === true && !is_file("$site/images/{$own[0]}"), 'An item\'s own stored picture goes with the item: ' . json_encode([$own, $answer]));
    [$status, $answer] = $ask('cal', 'character_sheet/inventory_handler.php', ['action' => 'delete_item', 'tab' => 'cal', 'item_id' => 'item_d']);
    uploadCheck(($answer['success'] ?? null) === true && !is_file("$site/images/item_1750373239414_26ihytngo_1750712776.png"), 'and so does one stored under the older kind of name: ' . json_encode($answer));

    // The hex map: a picture the GM shared sits in the players' list under the same file name.
    [$status, $answer] = $ask('GM', 'strixhaven/map/hex-data-handler.php', ['action' => 'upload_image', 'q' => '4', 'r' => '4', 'section' => 'gm'], ['image', 'p.gif', $gif]);
    $gmFile = (string) ($answer['filename'] ?? '');
    uploadCheck($gmFile !== '' && is_file("$site/strixhaven/map/hex-images/$gmFile"), 'The GM stores a picture on the GM\'s side of a hex: ' . json_encode($answer));
    [$status, $answer] = $ask('GM', 'strixhaven/map/hex-data-handler.php', ['action' => 'share_gm_images', 'q' => '4', 'r' => '4']);
    uploadCheck(($answer['shared'] ?? null) === [$gmFile], 'and shares it: ' . json_encode($answer));
    [$status, $answer] = $ask('cal', 'strixhaven/map/hex-data-handler.php', ['action' => 'delete_image', 'q' => '4', 'r' => '4', 'section' => 'player', 'filename' => $gmFile]);
    uploadCheck(is_file("$site/strixhaven/map/hex-images/$gmFile"), 'A player taking it off the players\' list does not delete the GM\'s file: ' . json_encode($answer));
    [$status, $answer] = $ask('cal', 'strixhaven/map/hex-data-handler.php', ['action' => 'delete_image', 'q' => '4', 'r' => '4', 'section' => '../gm', 'filename' => $gmFile]);
    uploadCheck(($answer['success'] ?? null) === false && is_file("$site/strixhaven/map/hex-images/$gmFile"), 'nor by naming a side that is neither: ' . json_encode($answer));
    [$status, $answer] = $ask('GM', 'strixhaven/map/hex-data-handler.php', ['action' => 'delete_image', 'q' => '4', 'r' => '4', 'section' => 'gm', 'filename' => $gmFile]);
    uploadCheck(!is_file("$site/strixhaven/map/hex-images/$gmFile"), 'The GM deletes it: ' . json_encode($answer));

    // ---- and across the whole site ------------------------------------------------------------------
    $phpAfter = array_values(array_filter($everyFile($site), static fn ($path) => str_ends_with($path, '.php')));
    uploadCheck($phpAfter === $phpBefore && array_map('md5_file', $phpAfter) === $hashBefore, 'After all of it the site has the PHP files it began with, unchanged, and no other: ' . json_encode(array_merge(array_diff($phpAfter, $phpBefore), array_diff($phpBefore, $phpAfter))));
    $strays = array_values(array_filter($everyFile($site), static fn ($path) => preg_match('/\.(php|json|lock|log|gif|png|webp|htaccess)$|\/error_log$/D', $path) !== 1));
    uploadCheck($strays === [], 'and nothing of any other kind was written anywhere: ' . json_encode($strays));
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    usleep(200000);
    $remove($base);
}

// ---- the folders, as they are deployed ---------------------------------------------------------------
// The rule file is in the repository for every upload folder, so a folder has it from the deploy on, not
// only from its next upload. One text, kept in includes/picture-store.php.
foreach (['images', 'chat_uploads', 'strixhaven/students/uploads/images', 'strixhaven/staff/uploads/images', 'strixhaven/locations/uploads/images', 'strixhaven/gm/uploads/images',
    'strixhaven/staff/portraits', 'strixhaven/students/portraits', 'strixhaven/othernpcs/portraits', 'strixhaven/locations/images', 'strixhaven/inventory/images', 'strixhaven/templates/images',
    'strixhaven/map/hex-images', 'character_sheet/data/hireling_images'] as $folder) {
    uploadCheck(str_replace("\r", '', (string) @file_get_contents("$dnd/$folder/.htaccess")) === PictureStore::rules(), "The upload folder $folder carries the rule file");
}
$house = array_slice(explode("\n", str_replace("\r", '', trim((string) file_get_contents("$dnd/portraits/.htaccess")))), 1);
uploadCheck(array_slice(explode("\n", trim(PictureStore::rules())), 2) === $house, 'written exactly as the portraits folder\'s, which the host accepts');
// The old hex API needs a database and nothing calls it; held to the same store by reading it.
$old = (string) file_get_contents("$dnd/strixhaven/map/api/hex-api.php");
uploadCheck(str_contains($old, 'PictureStore::store(') && str_contains($old, 'PictureStore::namePart($hexId') && !str_contains($old, "pathinfo(\$file['name']"), 'The old hex API stores through the same piece');

echo "picture uploads: 13 handlers store only a picture, under the site's own name, in a folder that runs nothing; none deletes or copies a file of the site\n";
