<?php
declare(strict_types=1);

// Turn undo (Brandon, October 2026). POST { action, sceneId, operationId, payload }:
//   "step"   — undo the running turn's newest action (Ctrl+Z), anyone in the game;
//   "turn"   — undo every action of the running turn (Ctrl+Shift+Z);
//   "count"  — how many actions the running turn has to undo;
//   "record" — a hero sheet counter change made during the turn (the sheet is not part of the board's log).
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../../lib/SyncV2PusherTransport.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        vttSyncV2Respond(405, ['success' => false, 'error' => 'POST required.']);
    }
    $auth = vttSyncV2RequireAuthenticated();
    $request = vttSyncV2ReadJson();
    $action = (string) ($request['action'] ?? '');
    $actor = (string) ($auth['user'] ?? '');
    $isGm = (bool) ($auth['isGM'] ?? false);
    $store = vttSyncV2Store();

    if ($action === 'count') {
        vttSyncV2Respond(200, ['success' => true, 'result' => $store->undoTurnCount($request)]);
    }
    if ($action === 'record') {
        vttSyncV2Respond(200, ['success' => true, 'result' => $store->recordSheetUndoStep($request, $actor)]);
    }
    if ($action !== 'step' && $action !== 'turn') {
        vttSyncV2Respond(422, ['success' => false, 'error' => 'Unknown undo action.']);
    }

    $result = $store->undoTurnSteps($request, $actor, $action === 'turn');
    if (($result['status'] ?? '') === 'conflict') {
        vttSyncV2Respond(409, ['success' => false, 'error' => 'The board changed while undoing. Try again.']);
    }
    $socketId = isset($request['socketId']) && is_string($request['socketId']) && trim($request['socketId']) !== '' ? trim($request['socketId']) : null;
    $events = [];
    foreach ($result['events'] as $event) {
        if (!is_array($event)) continue;
        SyncV2PusherTransport::publishAudiences($event, vttSyncV2ProjectEventForUser($event, ['isGM' => false]), $socketId);
        $events[] = vttSyncV2ProjectEventForUser($event, $auth);
    }

    // A player is not told what a hidden token was or became.
    $undo = $result['undo'];
    if (!$isGm) {
        $placements = $store->getSnapshot()['state']['placements'][$undo['sceneId']] ?? [];
        $veil = static function (array $step) use ($placements): array {
            if ($step['kind'] !== 'placement') return $step;
            $placement = $placements[$step['entityId']] ?? null;
            if (is_array($placement) && !vttSyncV2PlacementHidden($placement)) return $step;
            return [...$step, 'hidden' => true, 'before' => [], 'after' => []];
        };
        $undo['steps'] = array_map($veil, $undo['steps']);
        $undo['skipped'] = array_map($veil, $undo['skipped']);
    }
    vttSyncV2Respond(200, ['success' => true, 'events' => $events, 'undo' => $undo]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
