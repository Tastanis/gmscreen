<?php
// The GM's player page (Brandon, October 2026): turn players on and off, name a new player, set their login and
// password, pick their colour. The list itself is includes/players.php. Turning a player off keeps everything of
// theirs; they cannot log in and drop out of the site's player lists until they are turned on again.
session_start();
require_once __DIR__ . '/includes/players.php'; players_gate(); // a player turned off is logged out

if (empty($_SESSION['logged_in']) || ($_SESSION['user'] ?? '') !== 'GM') {
    header('Location: index.php');
    exit;
}

$message = '';
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $current = [];
        foreach (players_all(true) as $player) {
            $current[$player['id']] = $player;
        }
        $action = $_POST['action'] ?? '';
        if ($action === 'add') {
            // A new player starts off and unnamed; their fixed id never changes, whatever they are named later.
            $list = array_values($current);
            $list[] = ['id' => players_next_id(), 'name' => 'New player', 'login' => '', 'active' => false, 'color' => '#a77fd5'];
            players_save($list);
            $message = 'A new player was added. Name them, give them a login and a password, then turn them on.';
        } elseif ($action === 'remove') {
            // Only a player never named, never given a login or password and never on: they own nothing yet.
            $id = (string) ($_POST['id'] ?? '');
            $player = $current[$id] ?? null;
            if (!$player || !players_unused($player)) {
                throw new InvalidArgumentException('Only a new player who was never named, given a login or turned on can be removed. Turn a player off instead.');
            }
            unset($current[$id]);
            players_save(array_values($current));
            $message = 'removed';
        } elseif ($action === 'save') {
            $rows = is_array($_POST['players'] ?? null) ? $_POST['players'] : [];
            $list = [];
            foreach ($current as $id => $player) {
                $row = is_array($rows[$id] ?? null) ? $rows[$id] : [];
                $next = $player;
                $next['name'] = trim((string) ($row['name'] ?? $player['name']));
                $next['login'] = strtolower(trim((string) ($row['login'] ?? $player['login'])));
                $next['color'] = (string) ($row['color'] ?? $player['color']);
                $next['active'] = !empty($row['active']);
                $password = (string) ($row['password'] ?? '');
                if ($password !== '') {
                    if (strlen($password) < 4) {
                        throw new InvalidArgumentException('A password needs at least 4 characters (' . $next['name'] . ').');
                    }
                    $next['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
                }
                if ($next['active'] && $next['login'] === '') {
                    throw new InvalidArgumentException($next['name'] . ' needs a login before they can be turned on.');
                }
                if ($next['active'] && !isset($next['passwordHash']) && !in_array($id, ['cal', 'sharon', 'indigo', 'zepha'], true)) {
                    throw new InvalidArgumentException($next['name'] . ' needs a password before they can be turned on.');
                }
                $list[] = $next;
            }
            players_save($list);
            $message = 'Saved.';
        }
        // Done: the page is loaded again, so refreshing it never sends the change a second time (a second player).
        if ($message !== '') {
            header('Location: players.php?done=' . ($action === 'add' ? 'added' : ($action === 'remove' ? 'removed' : 'saved')), true, 303);
            exit;
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
$message = ['added' => 'A new player was added. Name them, give them a login and a password, then turn them on.', 'saved' => 'Saved.', 'removed' => 'The unused new player was removed.'][$_GET['done'] ?? ''] ?? $message;
/** A player who owns nothing yet: never named, no login, no password, never on (only such a player can be removed). */
function players_unused(array $player): bool
{
    return $player['name'] === 'New player' && $player['login'] === '' && !$player['active'] && !isset($player['passwordHash'])
        && !in_array($player['id'], ['cal', 'sharon', 'indigo', 'zepha'], true);
}
$players = players_all(true);
$h = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Players</title>
    <link rel="stylesheet" href="css/theme.css">
    <style>
        body { margin: 0; background: var(--surface); color: var(--text); font: 15px/1.45 Georgia, serif; }
        main { max-width: 860px; margin: 0 auto; padding: 24px 16px; }
        h1 { margin: 0 0 4px; font-size: 26px; }
        .hint { color: var(--text-muted); margin: 0 0 18px; }
        .note { padding: 10px 12px; border-radius: 6px; margin-bottom: 14px; }
        .note.ok { background: var(--success-soft); border: 1px solid var(--success); }
        .note.bad { background: var(--danger-soft); border: 1px solid var(--danger); }
        .player { display: grid; grid-template-columns: 90px 1fr 1fr 1fr 60px; gap: 8px 12px; align-items: end; background: var(--surface-raised);
            border: 1px solid var(--border); border-left: 6px solid var(--player-color); border-radius: 8px; padding: 12px; margin-bottom: 10px; }
        .player.off { opacity: .7; border-style: dashed; border-left-style: solid; }
        label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--text-muted); }
        input[type=text], input[type=password] { font: inherit; padding: 6px 8px; border: 1px solid var(--border); border-radius: 5px; background: #fff; color: var(--text); }
        input[type=color] { width: 100%; height: 34px; border: 1px solid var(--border); border-radius: 5px; background: #fff; }
        .switch { align-items: flex-start; }
        .switch input { width: 20px; height: 20px; }
        .state { font-weight: bold; font-size: 13px; color: var(--success); }
        .off .state { color: var(--danger); }
        .id { font-size: 11px; color: var(--text-faint); grid-column: 1 / -1; margin-top: -4px; }
        .bar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
        button, .back { font: inherit; padding: 8px 16px; border-radius: 6px; border: 1px solid var(--accent-strong); background: var(--accent); color: #fff; cursor: pointer; text-decoration: none; }
        button.link { padding: 0; border: 0; background: none; color: var(--danger); text-decoration: underline; font-size: 11px; }
        button.secondary, .back { background: var(--surface-strong); color: var(--text); border-color: var(--border-strong); }
        @media (max-width: 640px) { .player { grid-template-columns: 1fr 1fr; } }
    </style>
</head>
<body>
<main>
    <h1>Players</h1>
    <p class="hint">Turning a player off keeps everything of theirs (sheet, inventory, schedule, relationships, tokens). They cannot log in, and they leave the chat, the schedule, the tabs and the VTT lists until you turn them on again. A password box left empty keeps the password they have.</p>
    <?php if ($message): ?><div class="note ok"><?php echo $h($message); ?></div><?php endif; ?>
    <?php if ($error): ?><div class="note bad"><?php echo $h($error); ?></div><?php endif; ?>
    <form method="post" autocomplete="off">
        <input type="hidden" name="action" value="save">
        <?php foreach ($players as $player): $id = $player['id']; ?>
        <div class="player<?php echo $player['active'] ? '' : ' off'; ?>" style="--player-color: <?php echo $h($player['color']); ?>">
            <label class="switch">On
                <input type="checkbox" name="players[<?php echo $h($id); ?>][active]" value="1" <?php echo $player['active'] ? 'checked' : ''; ?>>
                <span class="state"><?php echo $player['active'] ? 'On' : 'Off'; ?></span>
            </label>
            <label>Name<input type="text" name="players[<?php echo $h($id); ?>][name]" value="<?php echo $h($player['name']); ?>" maxlength="40"></label>
            <label>Login<input type="text" name="players[<?php echo $h($id); ?>][login]" value="<?php echo $h($player['login']); ?>" maxlength="32" autocapitalize="off" spellcheck="false"></label>
            <label>New password<input type="password" name="players[<?php echo $h($id); ?>][password]" value="" autocomplete="new-password" placeholder="<?php echo isset($player['passwordHash']) || in_array($id, ['cal', 'sharon', 'indigo', 'zepha'], true) ? 'unchanged' : 'none yet'; ?>"></label>
            <label>Colour<input type="color" name="players[<?php echo $h($id); ?>][color]" value="<?php echo $h($player['color']); ?>"></label>
            <div class="id">Saved under: <?php echo $h($id); ?><?php if (players_unused($player)): ?>
                · <button type="submit" form="remove-player" name="id" value="<?php echo $h($id); ?>" class="link">Remove this unused new player</button><?php endif; ?></div>
        </div>
        <?php endforeach; ?>
        <div class="bar">
            <button type="submit" id="save-players">Save</button>
            <a class="back" href="dashboard.php">Back to the dashboard</a>
        </div>
    </form>
    <form method="post" id="remove-player"><input type="hidden" name="action" value="remove"></form>
    <form method="post" class="bar">
        <input type="hidden" name="action" value="add">
        <button type="submit" class="secondary">Add a player</button>
    </form>
</main>
</body>
</html>
