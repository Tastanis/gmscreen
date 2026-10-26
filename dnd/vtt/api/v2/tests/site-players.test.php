<?php
declare(strict_types=1);
// Brandon, October 2026: a fifth player, and the GM turning players on and off ("I'm going to be turning Sharon off
// and the new character on"). The site's one player list (includes/players.php) and the login page (index.php), run
// from a copy in an empty folder: an off player cannot log in, a remembered login is not let back in, an open
// session ends at the next request, and the list never loses a player's fixed id. No real password is used here.
function playersCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$dnd = realpath(__DIR__ . '/../../../..');
$root = sys_get_temp_dir() . '/site-players-' . bin2hex(random_bytes(6));
mkdir($root . '/includes', 0777, true);
mkdir($root . '/data', 0777, true);
mkdir($root . '/sessions', 0777, true);
copy($dnd . '/includes/players.php', $root . '/includes/players.php');
copy($dnd . '/index.php', $root . '/index.php');
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
// One request to the login page: what the session holds afterwards, and the page's message.
$login = static function (array $post = [], array $cookie = [], array $session = []) use ($root): array {
    $script = $root . '/ask-' . bin2hex(random_bytes(4)) . '.php';
    file_put_contents($script, '<?php session_save_path(' . var_export($root . '/sessions', true) . '); session_start(); $_SESSION = ' . var_export($session, true)
        . '; $_POST = ' . var_export($post, true) . '; $_COOKIE = ' . var_export($cookie, true) . '; $_SERVER["REQUEST_METHOD"] = "POST";'
        . ' register_shutdown_function(function () { echo "\n@@" . json_encode(["session" => $_SESSION, "error" => $GLOBALS["error_message"] ?? ""]); });'
        . ' require ' . var_export($root . '/index.php', true) . ';');
    $out = []; exec(escapeshellarg(PHP_BINARY) . ' -d display_errors=0 ' . escapeshellarg($script) . ' 2>&1', $out);
    @unlink($script);
    $text = implode("\n", $out);
    $at = strrpos($text, '@@');
    return $at === false ? ['raw' => substr($text, 0, 300)] : json_decode(substr($text, $at + 2), true);
};

try {
    require $root . '/includes/players.php';
    // No list yet: the four originals, all on, as before.
    playersCheck(players_ids() === ['cal', 'sharon', 'indigo', 'zepha', 'frunk'] && players_ids(true) === ['cal', 'sharon', 'indigo', 'zepha'], 'With no list the four originals are the players, plus Frunk turned off (October 2026).');
    playersCheck(player_may_play('GM') && player_may_play('sharon') && !player_may_play('nobody'), 'The GM always plays; an unknown user does not.');

    // A new player: a fixed id, unnamed, off.
    $list = players_all();
    $list[] = ['id' => players_next_id(), 'name' => '', 'login' => '', 'active' => false, 'color' => '#123456'];
    players_save($list);
    $new = player_by_id('player6');
    playersCheck($new !== null && $new['name'] === 'New player' && !$new['active'] && $new['login'] === '', 'A new player is player6 (after Frunk), "New player", off, with no login: ' . json_encode($new));
    playersCheck(players_ids(true) === ['cal', 'sharon', 'indigo', 'zepha'], 'An off player is not among the players shown.');

    // Named later, given a login and a password, turned on; Sharon off. The ids never change.
    $list = players_all();
    foreach ($list as &$player) {
        if ($player['id'] === 'player6') { $player['name'] = 'Mira'; $player['login'] = 'mira'; $player['active'] = true; $player['passwordHash'] = password_hash('test-only-pass', PASSWORD_DEFAULT); }
        if ($player['id'] === 'sharon') { $player['active'] = false; }
    }
    unset($player);
    players_save($list);
    playersCheck(players_ids() === ['cal', 'sharon', 'indigo', 'zepha', 'frunk', 'player6'], 'Every player keeps their place and id, on or off.');
    playersCheck(players_ids(true) === ['cal', 'indigo', 'zepha', 'player6'], 'Sharon off, Mira on.');
    playersCheck(!str_contains(json_encode(players_public()), 'passwordHash') && !str_contains(players_script(), '$2y$'), 'A password hash never reaches a page.');
    $refused = false;
    try { $dup = players_all(); $dup[0]['login'] = 'mira'; players_save($dup); } catch (InvalidArgumentException $e) { $refused = true; }
    playersCheck($refused && player_by_id('cal')['login'] === 'cal', 'Two players cannot share a login, and a refused save changes nothing.');

    // The login page.
    $mira = $login(['username' => 'Mira', 'password' => 'test-only-pass']);
    playersCheck(($mira['session']['user'] ?? '') === 'player6' && ($mira['session']['logged_in'] ?? false) === true, 'Mira logs in with her own password, as player6: ' . json_encode($mira));
    $wrong = $login(['username' => 'mira', 'password' => 'not-it']);
    playersCheck(empty($wrong['session']['logged_in']), 'A wrong password is refused.');
    $off = $login(['username' => 'sharon', 'password' => 'anything']);
    playersCheck(empty($off['session']['logged_in']) && $off['error'] === 'That player is turned off for now.', 'Sharon, off, cannot log in: ' . json_encode($off));
    // Her remembered login (a token the site itself signed) is not let back in either.
    $expires = time() + 3600;
    $token = 'sharon|' . $expires . '|' . hash_hmac('sha256', 'sharon|' . $expires, 'dnd-portal-remember-key-2024');
    $remembered = $login([], ['dnd_remember' => $token]);
    playersCheck(empty($remembered['session']['logged_in']), 'A remembered login of an off player does not log her in: ' . json_encode($remembered));
    $calToken = 'cal|' . $expires . '|' . hash_hmac('sha256', 'cal|' . $expires, 'dnd-portal-remember-key-2024');
    $cal = $login([], ['dnd_remember' => $calToken]);
    playersCheck(($cal['session']['user'] ?? '') === 'cal', 'A remembered login of a player who is on still works.');
    // An open session of hers ends at her next request.
    $open = $login([], [], ['logged_in' => true, 'user' => 'sharon']);
    playersCheck(empty($open['session']['logged_in']), 'Her open session is ended: ' . json_encode($open));
    // Turned on again: back in.
    $list = players_all();
    foreach ($list as &$player) if ($player['id'] === 'sharon') $player['active'] = true;
    unset($player);
    players_save($list);
    $back = $login([], ['dnd_remember' => $token]);
    playersCheck(($back['session']['user'] ?? '') === 'sharon', 'Turned on again, her remembered login works.');

    // An unreadable list never empties the site.
    file_put_contents($root . '/data/players.json', '{not json');
    playersCheck(array_column(players_all(true), 'id') === ['cal', 'sharon', 'indigo', 'zepha', 'frunk'], 'A broken list falls back to the four (plus Frunk, off).');
} finally {
    $remove($root);
}
echo "site players: a fixed id per player, off means no login and no open session, the list never loses a player\n";
