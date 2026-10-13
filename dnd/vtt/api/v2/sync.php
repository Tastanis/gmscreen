<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

try {
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
        vttSyncV2Respond(405, [
            'success' => false,
            'error' => 'Method not allowed.',
        ]);
    }
    $auth = vttSyncV2DomainEnabled('token_movement')
        ? vttSyncV2RequireAuthenticated()
        : vttSyncV2RequireShadowGm();
    vttSyncV2Store()->touchPresence(
        (string) ($auth['user'] ?? ''),
        (bool) ($auth['isGM'] ?? false)
    );

    $after = filter_var(
        $_GET['after'] ?? 0,
        FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 0]]
    );
    if ($after === false) {
        vttSyncV2Respond(422, [
            'success' => false,
            'error' => 'after must be a non-negative integer.',
        ]);
    }

    // When the answer is a whole snapshot (the page is too far behind for events), a page that asks with
    // ?designs= is sent one scene's design in it, as snapshot.php does. Events are sent as they always were.
    $designs = vttSyncV2DesignsAsked();
    $recovery = vttSyncV2ProjectRecoveryForUser(
        vttSyncV2Store()->replayAfter((int) $after),
        $auth
    );
    if (($recovery['mode'] ?? '') === 'snapshot' && is_array($recovery['snapshot'] ?? null)) {
        $recovery['snapshot'] = vttSyncV2ScopeDesigns($recovery['snapshot'], $designs);
    }

    vttSyncV2Respond(200, [
        'success' => true,
        'mode' => vttSyncV2DomainEnabled('token_movement') ? 'live' : 'shadow',
        'recovery' => $recovery,
    ]);
} catch (Throwable $error) {
    vttSyncV2HandleFailure($error);
}
