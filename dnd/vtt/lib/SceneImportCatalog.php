<?php
declare(strict_types=1);

final class SceneImportCatalog
{
    /** Caller holds the shared catalog lock across load, recovery and save. */
    public static function recover(SyncV2Store $store, array $catalog, callable $persist): array
    {
        $pending = $store->pendingSceneImports();
        if ($pending === []) return $catalog;
        $items = $catalog['items'] ?? [];
        $byId = [];
        foreach ($items as $scene) $byId[$scene['id']] = $scene;
        $changed = false;
        foreach ($pending as $receipt) {
            $scene = $receipt['scene']; $id = $scene['id'];
            if (isset($byId[$id])) {
                if (($byId[$id]['_importOperationId'] ?? null) !== $receipt['operationId']) {
                    throw new RuntimeException('An imported scene ID conflicts with an existing catalog entry.');
                }
                // Catalog save may have succeeded before the process stopped.
                // Preserve subsequent GM edits instead of replaying old metadata.
                continue;
            }
            $items[] = $scene; $byId[$id] = $scene; $changed = true;
        }
        $catalog['items'] = $items;
        if ($changed) $persist($catalog);
        foreach ($pending as $receipt) $store->acknowledgeSceneImportCatalog($receipt['operationId']);
        return $catalog;
    }
}
