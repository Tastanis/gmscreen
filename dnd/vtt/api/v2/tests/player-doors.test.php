<?php
declare(strict_types=1);
// Brandon, October 12, 2026: players open ordinary doors by clicking them; secret doors are still only revealed
// by the Director. The rule the server keeps: a player may open or close a door (not a window, not a broken one)
// that one of the heroes stands within a square of, on the door's own floor. A locked door says it is locked and
// does not move. A secret door answers as a piece of wall that is not there, open or shut. The Director is asked
// none of this. Whether the hero can see the door is the page's part: it offers only the doors his sight shows.
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
function doorCheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

// One wall along column 10 with five pieces in it, rows 2 to 12, and one door up on a floor at height 6.
$piece = static fn (string $id, float $y, array $extra = []) => ['id'=>$id, 'a'=>"$id-a", 'b'=>"$id-b", 'baseMode'=>'fixed', 'base'=>0.0, 'height'=>3.0, 'sight'=>'block', 'movement'=>'block', ...$extra];
$ends = static fn (string $id, float $y) => [['id'=>"$id-a", 'x'=>10, 'y'=>$y], ['id'=>"$id-b", 'x'=>10, 'y'=>$y + 1]];
$walls = ['version'=>1, 'nodes'=>[...$ends('door', 5), ...$ends('locked', 7), ...$ends('secret', 9), ...$ends('window', 11), ...$ends('wall', 3), ...$ends('upstairs', 5.0), ...$ends('broken', 13)], 'segments'=>[
    $piece('door', 5, ['interaction'=>'door', 'open'=>false]),
    $piece('locked', 7, ['interaction'=>'door', 'open'=>false, 'locked'=>true]),
    $piece('secret', 9, ['interaction'=>'door', 'open'=>false, 'secret'=>true]),
    $piece('window', 11, ['interaction'=>'window', 'open'=>false, 'sight'=>'pass']),
    $piece('wall', 3),
    $piece('upstairs', 5, ['interaction'=>'door', 'open'=>false, 'base'=>6.0]),
    $piece('broken', 13, ['interaction'=>'door', 'open'=>false, 'material'=>'wood', 'broken'=>true]),
], 'roofs'=>[]];
$token = static fn (string $id, int $column, int $row, string $team) => ['id'=>$id, 'name'=>$id, 'column'=>$column, 'row'=>$row, 'width'=>1, 'height'=>1, 'team'=>$team];

$database = sys_get_temp_dir() . '/vtt-doors-' . bin2hex(random_bytes(6)) . '.sqlite';
$store = new SyncV2Store($database);
try {
    $store->migrateLegacyPlacements(['placements'=>['scene'=>[$token('cal', 9, 5, 'ally'), $token('ogre', 9, 11, 'enemy'), $token('hidden-hero', 9, 9, 'ally') + ['hidden'=>true]]]]);
    $snap = $store->getSnapshot();
    $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'doors-env-walls','sceneId'=>'scene','baseRevision'=>$snap['revision'],
        'entityRevision'=>(int) ($snap['state']['sceneConfig']['scene']['_revision'] ?? 0),'payload'=>['field'=>'walls','expectedRevision'=>0,'value'=>$walls]], 'gm', true);
    $n = 0;
    $use = static function (string $door, bool $open, string $actor = 'cal') use ($store, &$n) {
        $snap = $store->getSnapshot(); $config = $snap['state']['sceneConfig']['scene'];
        return $store->acceptBoardDomainCommand(['type'=>'environment.portal.set','operationId'=>'doors-use-' . (++$n),'sceneId'=>'scene','baseRevision'=>$snap['revision'],'entityRevision'=>(int) $config['_revision'],
            'payload'=>['segmentId'=>$door,'open'=>$open,'expectedRevision'=>$config['environment']['walls']['revision']]], $actor, $actor === 'gm');
    };
    $refused = static function (callable $try): ?string { try { $try(); return null; } catch (InvalidArgumentException $error) { return $error->getMessage(); } };
    $isOpen = static function (string $door) use ($store): bool { foreach ($store->getSnapshot()['state']['sceneConfig']['scene']['environment']['walls']['value']['segments'] as $edge) if ($edge['id'] === $door) return ($edge['open'] ?? false) === true; return false; };
    $moveHero = static function (int $column, int $row) use ($store) {
        $snap = $store->getSnapshot(); $t = $snap['state']['placements']['scene']['cal'];
        $store->acceptTokenMove(['type'=>'token.move','operationId'=>'doors-move-' . $column . '-' . $row,'sceneId'=>'scene','entityId'=>'cal','baseRevision'=>$snap['revision'],'entityRevision'=>$t['_entityRevision'] ?? 0,
            'payload'=>['column'=>$column, 'row'=>$row, 'movementKind'=>'teleport', 'path'=>[], 'teleportChoice'=>['height'=>0, 'range'=>null]]], 'gm', true);
    };

    // The hero stands at 9,5, his square against the door on the line x=10, rows 5 to 6.
    $result = $use('door', true);
    doorCheck($result['status'] === 'accepted' && $isOpen('door'), 'A player opens the door his hero stands at');
    doorCheck(($result['event']['type'] ?? null) === 'environment.portalChanged', 'and every page is told: ' . json_encode($result['event']['type'] ?? null));
    doorCheck($use('door', false)['status'] === 'accepted' && !$isOpen('door'), 'and closes it again');
    // One square off still reaches (9,4 touches the door's end; 8,5 is a square away); two does not.
    $moveHero(8, 5); doorCheck($use('door', true)['status'] === 'accepted', 'From one square away he still reaches it');
    $use('door', false);
    $moveHero(7, 5); doorCheck($refused(fn () => $use('door', true)) === 'Stand next to the door to use it.' && !$isOpen('door'), 'From two squares away he does not');
    $moveHero(30, 30); doorCheck($refused(fn () => $use('door', true)) === 'Stand next to the door to use it.', 'nor from across the map');
    // What stands at a door must be a hero the players move: a monster beside the window does not count, nor a hidden hero.
    $moveHero(9, 7);
    doorCheck($refused(fn () => $use('locked', true)) === 'That door is locked.' && !$isOpen('locked'), 'A locked door says it is locked and does not move');
    $moveHero(9, 11);
    doorCheck($refused(fn () => $use('window', true)) === 'Only the GM can change that.', 'A window is the Director\'s');
    $moveHero(9, 13);
    doorCheck($refused(fn () => $use('broken', true)) === 'Only the GM can change that.', 'A broken door is not worked');
    // A secret door answers exactly as a piece that is not there, with a hero right at it.
    $moveHero(9, 9);
    $nothing = $refused(fn () => $use('no-such-piece', true));
    doorCheck($nothing === 'Portal does not exist.' && $refused(fn () => $use('secret', true)) === $nothing && !$isOpen('secret'), 'A secret door answers as a piece that is not there');
    $use('secret', true, 'gm');
    doorCheck($isOpen('secret') && $refused(fn () => $use('secret', false)) === $nothing && $isOpen('secret'), 'and the same once the Director has opened it: a player cannot shut it away again');
    // A door on a floor above is not reached from the ground under it.
    $moveHero(9, 5);
    doorCheck($refused(fn () => $use('upstairs', true)) === 'Stand next to the door to use it.', 'A door six squares up is not reached from the ground');
    // A plain wall piece is not a door to anybody.
    doorCheck($refused(fn () => $use('wall', true)) === 'Only the GM can change that.', 'A wall is not a door');
    // The Director is asked none of it.
    $moveHero(30, 30);
    doorCheck($use('door', true, 'gm')['status'] === 'accepted' && $use('window', true, 'gm')['status'] === 'accepted' && $use('upstairs', true, 'gm')['status'] === 'accepted', 'The Director works any door or window from anywhere');
    doorCheck(str_contains((string) $refused(fn () => $use('locked', true, 'gm')), 'locked'), 'though a locked one he must unlock first, as before');
    // The rest of the map's design is still his alone.
    $snap = $store->getSnapshot();
    doorCheck($refused(fn () => $store->acceptBoardDomainCommand(['type'=>'environment.set','operationId'=>'doors-player-walls','sceneId'=>'scene','baseRevision'=>$snap['revision'],
        'entityRevision'=>(int) $snap['state']['sceneConfig']['scene']['_revision'],'payload'=>['field'=>'walls','expectedRevision'=>$snap['state']['sceneConfig']['scene']['environment']['walls']['revision'],'value'=>$walls]], 'cal', false)) === 'Map design is GM-only.', 'A player still cannot change the walls themselves');
    unset($store);
} finally { @unlink($database); }
echo "player doors: an ordinary door at a hero's side opens to a player's click; locked, secret, far and upstairs do not\n";
