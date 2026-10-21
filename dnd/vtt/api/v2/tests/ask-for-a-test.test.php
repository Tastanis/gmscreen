<?php
declare(strict_types=1);
// Ask heroes for a test (Build 514). The Director picks heroes and, if he wishes, characteristics; each player
// picks the rest; the roll is made on the server from the hero's own sheet; the result goes back to the Director
// in a pop-up and as a chat line that only he and the roller are sent.
//
// The first half checks the sums and the words on their own. The second runs the real chat handler behind PHP's
// own command-line server, on a copy of the few files it needs in an empty folder (no Pusher settings among them,
// so nothing is sent anywhere).
function testCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$dnd = realpath(__DIR__ . '/../../../..');
require_once $dnd . '/includes/ask-test.php';

// ---- the sums and the words ----------------------------------------------------------------------------
foreach ([[2, 1], [11, 1], [12, 2], [16, 2], [17, 3], [30, 3], [-3, 1]] as [$total, $tier]) {
    testCheck(AskTest::tier($total) === $tier, "A total of $total is tier $tier");
}
foreach ([['', 0], ['2', 2], [3, 3], ['+1', 1], ['-2', -2], ["\u{2212}1", -1], [' 4 ', 4], ['two', 0], [null, 0], [['x'], 0], ['1.5', 0]] as [$held, $whole]) {
    testCheck(AskTest::whole($held) === $whole, 'What a sheet holds read as a whole number: ' . json_encode($held));
}
// Indigo's sheet as it stands today, with the things a sheet can hold that must not count.
$sheets = ['indigo' => ['hero' => ['stats' => ['might' => '-1', 'agility' => '1', 'reason' => 3, 'intuition' => '1', 'presence' => '3']],
    'sidebar' => ['skills' => ['Read Person' => ['level' => 'Trained', 'bonus' => '1'], 'Hide' => ['level' => 'Trained', 'bonus' => ''], 'Magic' => ['level' => 'Trained'],
        'Swim' => ['level' => 'Untrained', 'bonus' => '3'], 'Juggling' => ['level' => 'Trained', 'bonus' => '9']]]],
    'cal' => ['hero' => ['stats' => ['might' => 2, 'agility' => '', 'intuition' => '-1']]]];
$indigo = AskTest::sheetOf($sheets, 'indigo');
testCheck($indigo['stats'] === ['might' => -1, 'agility' => 1, 'reason' => 3, 'intuition' => 1, 'presence' => 3], 'The five characteristics are read from the sheet');
testCheck($indigo['skills'] === ['Hide' => 0, 'Magic' => 0, 'Read Person' => 1], 'The hero\'s skills, each with its own extra bonus; one marked untrained and one that is not a skill are left out');
$cal = AskTest::sheetOf($sheets, 'cal');
testCheck($cal['stats'] === ['might' => 2, 'agility' => 0, 'reason' => 0, 'intuition' => -1, 'presence' => 0] && $cal['skills'] === [], 'A blank or missing characteristic is 0; no skills is no skills');
testCheck(AskTest::sheetOf($sheets, 'zepha') === ['stats' => ['might' => 0, 'agility' => 0, 'reason' => 0, 'intuition' => 0, 'presence' => 0], 'skills' => []], 'A hero with no sheet rolls from zeros');
testCheck(AskTest::characteristics(['Intuition', 'agility', 'luck', 'agility', 7]) === ['agility', 'intuition'], 'What the Director lit is tidied: known ones, once each, in the sheet\'s order');
testCheck(AskTest::characteristics('agility') === [] && AskTest::characteristics(null) === [], 'and anything that is not a list is none lit');

$several = AskTest::create(['cal', 'indigo'], ['agility', 'intuition'], false, 1000);
$one = AskTest::create(['indigo'], ['presence'], true, 1000);
$any = AskTest::create(['indigo'], [], false, 1000);
testCheck($several['rows'] === ['cal' => ['status' => 'waiting'], 'indigo' => ['status' => 'waiting']] && AskTest::asks($several) === 'Agility or Intuition' && AskTest::asks($one) === 'Presence' && AskTest::asks($any) === 'any characteristic', 'A new test waits on each hero asked, and says what it asks for');

// The mock's own two examples.
$row = AskTest::roll($several, $cal, ['characteristic' => 'intuition', 'skill' => '', 'edge' => 0, 'extra' => 0], [4, 5], 1001);
testCheck($row['total'] === 8 && $row['modifier'] === -1 && $row['tier'] === 1 && $row['dice'] === [4, 5], 'Cal: Intuition -1, no skill, a 9 on the dice is 8');
testCheck(AskTest::words($row) === "Intuition, no skill. 9 \u{2212} 1 = 8, tier 1", 'and it is said as in the picture: ' . AskTest::words($row));
$row = AskTest::roll($one, $indigo, ['characteristic' => 'presence', 'skill' => 'Read Person', 'edge' => 0, 'extra' => 0], [7, 5], 1001);
testCheck($row['total'] === 18 && $row['modifier'] === 6 && $row['tier'] === 3 && $row['hasSkill'] === true, 'Indigo: Presence 3, Read Person 2 and its own 1, a 12 on the dice is 18');
testCheck(AskTest::words($row) === 'Presence, Read Person. 12 + 6 = 18, tier 3', AskTest::words($row));

// Nothing is forced.
$row = AskTest::roll($several, $indigo, ['characteristic' => '', 'skill' => '', 'edge' => 0, 'extra' => 0], [10, 1], 1001);
testCheck($row['total'] === 11 && $row['modifier'] === 0 && AskTest::words($row) === 'No characteristic, no skill. 11 + 0 = 11, tier 1', 'No characteristic and no skill is a plain 2d10, whatever the Director lit');
$row = AskTest::roll($any, $indigo, ['characteristic' => 'reason', 'skill' => 'Swim', 'edge' => 1, 'extra' => '-1'], [5, 5], 1001);
testCheck($row['modifier'] === 3 + 0 + 2 - 1 && $row['hasSkill'] === false, 'None lit: any of the five. A skill that is not the hero\'s can be named and adds nothing. An edge is +2; the typed extra is added');
testCheck(AskTest::words($row) === "Reason, Swim, edge, extra \u{2212}1. 10 + 4 = 14, tier 2", AskTest::words($row));
$row = AskTest::roll($any, $indigo, ['characteristic' => 'might', 'skill' => 'Hide', 'edge' => -1, 'extra' => '+2'], [1, 1], 1001);
testCheck($row['modifier'] === -1 + 2 - 2 + 2 && $row['total'] === 3, 'A bane is -2; a skill of the hero\'s with no bonus of its own adds 2');
testCheck(AskTest::roll($any, $indigo, ['edge' => 7, 'extra' => 999], [1, 1], 1001)['modifier'] === 2 + AskTest::EXTRA_LIMIT, 'An edge counts once, and a typed extra is held to 20 either way');
foreach ([['characteristic' => 'might'], ['characteristic' => 'luck'], ['skill' => 'Juggling']] as $bad) {
    $refused = false;
    try { AskTest::roll($several, $indigo, $bad, [1, 1], 1001); } catch (InvalidArgumentException $e) { $refused = true; }
    testCheck($refused, 'A characteristic the test does not offer, or a skill that is not one, is refused: ' . json_encode($bad));
}

// Who is shown what.
$several['rows']['cal'] = AskTest::roll($several, $cal, ['characteristic' => 'agility'], [3, 3], 1001);
$shown = AskTest::visibleTo([$several, $one], 'GM', true, 1100);
testCheck(count($shown) === 2 && array_keys($shown[0]['rows']) === ['cal', 'indigo'] && $shown[0]['rows']['cal']['words'] === 'Agility, no skill. 6 + 0 = 6, tier 1' && $shown[0]['open'] === true && $shown[0]['age'] === 100, 'The Director is shown every row of every test');
$shown = AskTest::visibleTo([$several, $one], 'indigo', false, 1100);
testCheck(count($shown) === 2 && array_keys($shown[0]['rows']) === ['indigo'] && $shown[1]['private'] === true, 'A hero is shown only their own row, never another hero\'s roll');
testCheck(AskTest::visibleTo([$several, $one], 'sharon', false, 1100) === [], 'and nothing at all of a test that does not ask them');
testCheck(AskTest::visibleTo([$several], 'GM', true, 1000 + AskTest::WAIT_SECONDS + 1)[0]['open'] === false, 'A test left waiting stops being offered after half an hour');

// ---- the real handler ------------------------------------------------------------------------------------
$base = sys_get_temp_dir() . '/vtt-ask-test-' . bin2hex(random_bytes(6));
$site = $base . '/dnd';
$remove = static function (string $folder) use (&$remove): void {
    foreach (scandir($folder) ?: [] as $entry) { if ($entry === '.' || $entry === '..') continue; $path = $folder . '/' . $entry; is_dir($path) ? $remove($path) : @unlink($path); }
    @rmdir($folder);
};
$server = null;
try {
    foreach (['sessions', 'dnd/includes', 'dnd/vtt/lib', 'dnd/data', 'dnd/character_sheet/data'] as $folder) mkdir("$base/$folder", 0777, true);
    copy("$dnd/chat_handler.php", "$site/chat_handler.php");
    foreach (['chat_pusher.php', 'chat_participants.php', 'ask-test.php', 'players.php'] as $file) copy("$dnd/includes/$file", "$site/includes/$file");
    copy("$dnd/vtt/lib/PusherClient.php", "$site/vtt/lib/PusherClient.php");
    file_put_contents("$site/character_sheet/data/character_sheets.json", json_encode($sheets));
    // Signs a request in as whoever its header names. Written here, for this test, and nowhere in the site.
    file_put_contents("$base/router.php", '<?php session_save_path(' . var_export("$base/sessions", true) . '); $as = $_SERVER["HTTP_X_TEST_USER"] ?? ""; if ($as !== "") { session_start(); $_SESSION["logged_in"] = true; $_SESSION["user"] = $as; session_write_close(); } return false;');

    $probe = stream_socket_server('tcp://127.0.0.1:0'); $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1); fclose($probe);
    $server = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $site, "$base/router.php"], [['pipe', 'r'], ['file', "$base/server.log", 'a'], ['file', "$base/server.log", 'a']], $pipes);
    $ask = static function (?string $user, string $action, array $fields = []) use ($port): array {
        $context = stream_context_create(['http' => ['method' => 'POST', 'ignore_errors' => true, 'timeout' => 30,
            'header' => trim(($user !== null ? "X-Test-User: $user\r\n" : '') . 'Content-Type: application/x-www-form-urlencoded'), 'content' => http_build_query(['action' => $action] + $fields)]]);
        $answer = json_decode((string) @file_get_contents("http://127.0.0.1:$port/chat_handler.php", false, $context), true);
        return is_array($answer) ? $answer : [];
    };
    for ($i = 0; $i < 80 && $ask(null, 'chat_fetch') === []; $i++) usleep(100000);
    $lines = static fn (string $user): array => array_map(static fn ($m) => ($m['type'] ?? '') . '|' . ($m['user'] ?? '') . '|' . ($m['message'] ?? ''), $ask($user, 'chat_fetch')['messages'] ?? []);
    $tests = static fn (string $user): array => $ask($user, 'chat_test_state')['tests'] ?? ['none'];

    // Who may do what.
    testCheck(($ask(null, 'chat_test_state')['success'] ?? null) === false && ($ask(null, 'chat_test_ask', ['heroes' => '["cal"]'])['success'] ?? null) === false, 'Nobody signed in is told nothing and asks nothing');
    testCheck(($ask('cal', 'chat_test_ask', ['heroes' => '["sharon"]'])['error'] ?? '') === 'Only the Director asks for a test.', 'A player cannot ask for a test');
    testCheck(($ask('GM', 'chat_test_ask', ['heroes' => '[]'])['error'] ?? '') === 'Pick a hero.' && ($ask('GM', 'chat_test_ask', ['heroes' => '["GM","nobody"]'])['error'] ?? '') === 'Pick a hero.', 'Asking needs a hero, and only a hero');
    testCheck($tests('GM') === [] && !is_file("$site/data/ask_tests.json"), 'and none of that left a test behind');
    $mark = $ask('GM', 'chat_fetch')['tests'] ?? null;
    testCheck($mark === '0', 'The chat\'s own answer carries the tests\' mark');

    // The Director asks Cal and Indigo: Agility or Intuition. No characteristic at all is as good an ask.
    $asked = $ask('GM', 'chat_test_ask', ['heroes' => '["indigo","cal"]', 'characteristics' => '["intuition","agility"]', 'private' => '0']);
    testCheck(($asked['success'] ?? false) === true && is_string($asked['id'] ?? null), 'The Director asks: ' . json_encode($asked));
    $id = $asked['id'];
    testCheck(array_keys($asked['tests'][0]['rows']) === ['cal', 'indigo'] && $asked['tests'][0]['asks'] === 'Agility or Intuition', 'for the heroes he picked, and what he lit');
    $newMark = $ask('GM', 'chat_fetch')['tests'] ?? null;
    testCheck(is_string($newMark) && $newMark !== $mark, 'The mark changes, so every page learns of the test the next time its chat looks');
    testCheck(($ask('cal', 'chat_test_state', ['stamp' => $newMark])['unchanged'] ?? false) === true, 'and a page that already has that mark is told so in a word');
    testCheck(array_keys($tests('cal')[0]['rows']) === ['cal'] && $tests('sharon') === [], 'Cal is shown his own row; Sharon, who was not asked, nothing');
    testCheck($lines('GM') === [] && $lines('cal') === [], 'Asking the table writes nothing in chat: the pop-ups say it');

    // What a player's pop-up is filled from.
    $sheet = $ask('indigo', 'chat_test_sheet');
    testCheck(($sheet['stats'] ?? null) === $indigo['stats'] && ($sheet['skills'] ?? null) === $indigo['skills'] && array_keys($sheet['groups'] ?? []) === ['Crafting', 'Exploration', 'Interpersonal', 'Intrigue', 'Lore'], 'A hero is given their own numbers and the five skill groups');
    testCheck(($ask('GM', 'chat_test_sheet')['success'] ?? null) === false, 'The Director has no sheet to roll from');

    // Rolls.
    testCheck(($ask('sharon', 'chat_test_roll', ['test' => $id])['error'] ?? '') === 'That test is not asking you.', 'A hero who was not asked cannot roll it');
    testCheck(($ask('GM', 'chat_test_roll', ['test' => $id])['success'] ?? null) === false, 'nor can the Director roll for them');
    testCheck(($ask('cal', 'chat_test_roll', ['test' => $id, 'characteristic' => 'might'])['error'] ?? '') === 'That characteristic is not one this test offers.' && $tests('cal')[0]['rows']['cal']['status'] === 'waiting', 'A characteristic he did not light is refused, and the hero is still waiting');
    testCheck(($ask('cal', 'chat_test_roll', ['test' => 'test_nothere'])['error'] ?? '') === 'That test is no longer there.', 'A test that is not there says so');
    // The page cannot name its own dice or its own total.
    $rolled = $ask('cal', 'chat_test_roll', ['test' => $id, 'characteristic' => 'intuition', 'skill' => '', 'edge' => '0', 'extra' => '0', 'dice' => '[10,10]', 'total' => '99', 'modifier' => '50']);
    $row = $rolled['row'] ?? [];
    testCheck(($rolled['success'] ?? false) === true && count($row['dice'] ?? []) === 2 && min($row['dice']) >= 1 && max($row['dice']) <= 10, 'Cal rolls: two d10, rolled by the site: ' . json_encode($rolled));
    testCheck($row['modifier'] === -1 && $row['total'] === $row['dice'][0] + $row['dice'][1] - 1 && $row['tier'] === AskTest::tier($row['total']), 'The total is the dice and his Intuition from his sheet, whatever the page sent');
    testCheck(($ask('cal', 'chat_test_roll', ['test' => $id, 'characteristic' => 'agility'])['error'] ?? '') === 'You have already rolled this test.', 'A test is rolled once');
    $line = 'text|cal|Test: ' . AskTest::words($row);
    testCheck($lines('GM') === [$line] && $lines('cal') === [$line], 'The result is a line in chat for the Director and the roller: ' . json_encode($lines('GM')));
    testCheck($lines('indigo') === [] && $lines('sharon') === [] && $lines('zepha') === [], 'and for nobody else at the table');
    testCheck($tests('GM')[0]['rows']['cal']['total'] === $row['total'] && $tests('GM')[0]['rows']['indigo']['status'] === 'waiting', 'The Director\'s list has Cal\'s roll, and Indigo still waiting');
    testCheck($tests('indigo')[0]['rows'] === ['indigo' => ['status' => 'waiting']], 'Indigo is not shown Cal\'s roll');

    // Privately, from the whisper window.
    testCheck(($ask('GM', 'chat_test_ask', ['heroes' => '["indigo","cal"]', 'private' => '1'])['error'] ?? '') === 'A private test is for one hero.', 'A private test is for one hero');
    $private = $ask('GM', 'chat_test_ask', ['heroes' => '["indigo"]', 'characteristics' => '["presence"]', 'private' => '1']);
    testCheck(($private['success'] ?? false) === true, 'The Director asks Indigo privately');
    testCheck($lines('GM') === [$line, 'whisper|GM|Test: Presence'] && $lines('indigo') === ['whisper|GM|Test: Presence'] && $lines('cal') === [$line], 'It is said in her whispers, to her alone');
    $rolled = $ask('indigo', 'chat_test_roll', ['test' => $private['id'], 'characteristic' => 'presence', 'skill' => 'Read Person', 'edge' => '1', 'extra' => "\u{2212}1"]);
    $hers = $rolled['row'] ?? [];
    testCheck(($rolled['success'] ?? false) === true && $hers['modifier'] === 3 + 2 + 1 + 2 - 1 && $hers['total'] === $hers['dice'][0] + $hers['dice'][1] + 7, 'She rolls Presence with Read Person (2, and its own 1), an edge and a typed -1: ' . json_encode($rolled));
    $back = 'whisper|indigo|Test: ' . AskTest::words($hers);
    testCheck($lines('GM') === [$line, 'whisper|GM|Test: Presence', $back] && $lines('indigo') === ['whisper|GM|Test: Presence', $back], 'The result goes back to him in the whispers');
    testCheck($lines('cal') === [$line] && $lines('sharon') === [], 'and nobody else is sent either line');
    testCheck(count($tests('cal')) === 1, 'Cal is not shown that a private test was asked at all');
    // Indigo answers the first test too, with nothing picked.
    $plain = $ask('indigo', 'chat_test_roll', ['test' => $id])['row'] ?? [];
    testCheck(($plain['modifier'] ?? null) === 0 && $plain['characteristic'] === '' && $plain['skill'] === '', 'A player may pick nothing: a plain 2d10');

    // A line "for these people only" cannot be made up through the chat itself.
    $forged = $ask('sharon', 'chat_send', ['message' => 'Test: Might. 20 + 9 = 29, tier 3', 'only' => '["sharon"]', 'type' => 'text'])['message'] ?? [];
    testCheck(isset($forged['id']) && !isset($forged['only']) && in_array('text|sharon|Test: Might. 20 + 9 = 29, tier 3', $lines('zepha'), true), 'A message sent through chat never carries "only": the whole table is sent it, as with any message');

    // Two messages in one second. With whole-second times the second was never sent to a page that had fetched
    // in between (which is what a table of heroes rolling together does).
    $first = $ask('zepha', 'chat_send', ['message' => 'one'])['message'] ?? [];
    $seen = $ask('GM', 'chat_fetch', ['since' => $first['timestamp'] ?? '']);
    $second = $ask('zepha', 'chat_send', ['message' => 'two'])['message'] ?? [];
    $third = $ask('zepha', 'chat_send', ['message' => 'three'])['message'] ?? [];
    testCheck(($seen['messages'] ?? null) === [] && ($seen['latest'] ?? '') === $first['timestamp'], 'A page that has the last message is sent nothing more');
    testCheck(preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/', $first['timestamp'] ?? '') === 1, 'A message\'s time is written to the millisecond: ' . ($first['timestamp'] ?? ''));
    testCheck(chatTime($first) < chatTime($second) && chatTime($second) < chatTime($third), 'and each is later than the one before, however fast they come');
    $after = array_map(static fn ($m) => $m['message'], $ask('GM', 'chat_fetch', ['since' => $first['timestamp']])['messages'] ?? []);
    testCheck($after === ['two', 'three'],'so the page is sent exactly the two that came after: ' . json_encode($after));
    // An old message, written before this build with a whole-second time, still orders rightly.
    $old = json_decode((string) file_get_contents("$site/data/chat_messages.json"), true);
    $old[] = ['id' => 'msg_old', 'timestamp' => date('c', time() + 2), 'user' => 'GM', 'message' => 'old style', 'type' => 'text'];
    file_put_contents("$site/data/chat_messages.json", json_encode($old));
    $next = $ask('zepha', 'chat_send', ['message' => 'after the old one'])['message'] ?? [];
    testCheck(chatTime($next) > chatTime(end($old)), 'A new message is later than an old-style one that is a moment ahead of the clock');
    $after = array_map(static fn ($m) => $m['message'], $ask('GM', 'chat_fetch', ['since' => end($old)['timestamp']])['messages'] ?? []);
    testCheck($after === ['after the old one'], 'and a page whose last time is an old-style one is sent what came after it');

    // The tests are kept apart from the chat, so clearing the chat or a full chat does not lose who has rolled.
    testCheck(($ask('GM', 'chat_clear')['success'] ?? false) === true && count($tests('GM')) === 2 && $lines('GM') === [], 'Clearing the chat clears the lines, not the Director\'s list');
    testCheck(json_decode((string) file_get_contents("$site/data/ask_tests.json"), true)[0]['id'] === $id, 'The tests are in their own file');
} finally {
    if (is_resource($server)) { proc_terminate($server); proc_close($server); }
    usleep(200000);
    $remove($base);
}
function chatTime(array $message): float { return (float) (new DateTimeImmutable($message['timestamp'] ?? ''))->format('U.v'); }
echo "ask-for-a-test tests passed\n";
