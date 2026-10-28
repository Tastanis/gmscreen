<?php
declare(strict_types=1);
// Every Monster Creator monster is a token in the token library (Brandon, October 27, 2026; lib/MonsterTokens.php):
// in a folder for its tab, with its picture, footprint, stamina and the enemy side; what the Director sets on such a
// token (size, side, stamina, picture) wins and is kept per monster; a monster with no stamina or picture still works.
function testCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

require_once __DIR__ . '/../../../lib/MonsterTokens.php';

$catalog = [
    'm1' => ['id' => 'm1', 'name' => 'Orchard Tender', 'footprint' => '2x2', 'stamina' => 40, 'imageUrl' => '/img/tender.png', 'sourceFolderParts' => ['Gravity Orchard', 'Foes']],
    'm2' => ['id' => 'm2', 'name' => 'Ash wisp', 'size' => '1S', 'stamina' => 0, 'imageUrl' => null, 'sourceFolderParts' => []],
];
$own = ['folders' => [['id' => 'tfd_pc', 'name' => "PC's"]], 'items' => [['id' => 'tok_cal', 'name' => 'Cal', 'folderId' => 'tfd_pc']]];

$merged = MonsterTokens::merge($own, [], $catalog);
testCheck($merged['items'][0]['id'] === 'tok_cal' && $merged['folders'][0]['id'] === 'tfd_pc', 'The Director\'s own folders and tokens come first, unchanged');
$byId = array_column($merged['items'], null, 'id');
$tender = $byId['mon_m1'];
testCheck($tender['monsterId'] === 'm1' && $tender['source'] === 'monster-creator', 'A monster\'s token is linked to it');
testCheck($tender['size'] === '2x2' && $tender['hp'] === 40 && $tender['team'] === 'enemy' && $tender['imageUrl'] === '/img/tender.png', 'Its footprint, stamina, the enemy side and its picture');
$folders = array_column($merged['folders'], 'name', 'id');
testCheck(($folders[$tender['folderId']] ?? '') === 'Monster Creator · Gravity Orchard / Foes', 'In a folder named after its tab and sub-tab');
$wisp = $byId['mon_m2'];
testCheck(!array_key_exists('hp', $wisp), 'No stamina set: blank, not 0');
testCheck(strncmp($wisp['imageUrl'], 'data:image/svg+xml;base64,', 26) === 0, 'No picture: a round badge with its initials');
testCheck(($folders[$wisp['folderId']] ?? '') === 'Monster Creator · Other monsters', 'Not on a tab: under Other monsters');
testCheck($wisp['size'] === '1x1', 'Size 1S is one square');

$edited = array_column(MonsterTokens::merge($own, ['m1' => ['size' => '3x3', 'team' => 'ally', 'hp' => 55, 'imageUrl' => '/tok/framed.png']], $catalog)['items'], null, 'id')['mon_m1'];
testCheck($edited['size'] === '3x3' && $edited['team'] === 'ally' && $edited['hp'] === 55, 'The Director\'s size, side and stamina win');
testCheck($edited['imageUrl'] === '/tok/framed.png' && $edited['sourceImageUrl'] === '/img/tender.png', 'His framed picture is used; the monster\'s own is kept to go back to');
testCheck(MonsterTokens::isMonsterToken('mon_m1') && !MonsterTokens::isMonsterToken('tok_cal') && MonsterTokens::monsterIdOf('mon_m1') === 'm1', 'Monster token ids');

echo "PASS monster tokens: linked, sized, foldered, blank stamina, initials badge, the Director's changes win\n";
