<?php
require_once __DIR__ . '/../chat_handler.php';

function assertSameValue($expected, $actual, $label)
{
    if ($expected !== $actual) {
        fwrite(STDERR, $label . "\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
}

$known = parseKnownProjectRollStatuses(json_encode([
    'roll-1' => 'pending',
    'roll-2' => 'ACCEPTED',
    'bad' => 'unknown',
]));

assertSameValue([
    'roll-1' => 'pending',
    'roll-2' => 'accepted',
], $known, 'Known project-roll statuses should be normalized and invalid values ignored.');

$resolvedMessage = [
    'id' => 'roll-1',
    'type' => 'project_roll',
    'timestamp' => '2026-08-25T12:00:00-07:00',
    'payload' => ['status' => 'accepted'],
];

assertSameValue(true, hasProjectRollStatusChanged($resolvedMessage, $known), 'A pending client copy must detect an accepted server copy.');
assertSameValue(false, hasProjectRollStatusChanged($resolvedMessage, ['roll-1' => 'accepted']), 'Matching resolved statuses must not be treated as changed.');
assertSameValue(false, hasProjectRollStatusChanged([
    'id' => 'text-1',
    'type' => 'text',
], ['text-1' => 'pending']), 'Ordinary chat messages must not use project-roll status synchronization.');

assertSameValue('accepted', resolveProjectRollStatusTransition('pending', 'accepted'), 'A pending roll should accept the first decision.');
assertSameValue('accepted', resolveProjectRollStatusTransition('accepted', 'denied'), 'A stale tab must not reverse an accepted roll.');
assertSameValue('denied', resolveProjectRollStatusTransition('denied', 'accepted'), 'A stale tab must not reverse a denied roll.');

fwrite(STDOUT, "chat project-roll sync tests passed\n");
