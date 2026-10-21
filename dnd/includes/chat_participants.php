<?php
// Who is in the chat: the GM and the players who are on (includes/players.php). A player turned off drops out of
// whisper targets and Ask-a-Test; what they wrote before stays in the chat.
require_once __DIR__ . '/players.php';
return ['GM' => 'GM'] + players_names(true);
