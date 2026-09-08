<?php
declare(strict_types=1);
require_once __DIR__ . '/../../../lib/SyncV2Store.php';
$path = sys_get_temp_dir() . '/vtt-template-test-' . bin2hex(random_bytes(8)) . '.sqlite';
$store = new SyncV2Store($path);
$sequence = 0;
function templateCommand(string $type, string $id, string $actor, array $template = []): array {
    global $store, $sequence;
    $snapshot = $store->getSnapshot();
    return $store->acceptBoardDomainCommand([
        'type' => $type, 'operationId' => 'template-test-' . ++$sequence,
        'baseRevision' => $snapshot['revision'], 'sceneId' => 'test', 'entityId' => $id,
        'entityRevision' => $snapshot['state']['templates']['test'][$id]['_entityRevision'] ?? 0,
        'payload' => $type === 'template.upsert' ? ['template' => $template] : [],
    ], $actor, $actor === 'GM');
}
function expectTemplateRejection(string $type, string $id, string $actor, array $entry): void {
    global $store;
    $revision = $store->getSnapshot()['revision'];
    $rejected = false;
    try { templateCommand($type, $id, $actor, $entry); }
    catch (InvalidArgumentException $error) { $rejected = true; }
    if (!$rejected || $revision !== $store->getSnapshot()['revision']) throw new RuntimeException('Unauthorized template edit was accepted.');
}
try {
    $entry = ['type'=>'circle', 'radius'=>2, 'center'=>['column'=>4,'row'=>4], 'authorId'=>'sharon'];
    $created = templateCommand('template.upsert', 'mine', 'cal', $entry);
    if ($created['event']['payload']['template']['authorId'] !== 'cal') throw new RuntimeException('Spoofed owner.');
    expectTemplateRejection('template.upsert', 'mine', 'sharon', $entry);
    expectTemplateRejection('template.remove', 'mine', 'sharon', []);
    templateCommand('template.upsert', 'mine', 'cal', [...$entry, 'radius'=>3]);
    templateCommand('template.remove', 'mine', 'cal');
    templateCommand('template.upsert', 'persistent', 'cal', [...$entry, 'persistent'=>true]);
    expectTemplateRejection('template.upsert', 'persistent', 'cal', [...$entry, 'persistent'=>false]);
    expectTemplateRejection('template.remove', 'persistent', 'cal', []);
    templateCommand('template.remove', 'persistent', 'GM');
    $store->migrateLegacyBoardDomains(['templates'=>['test'=>[['id'=>'legacy','type'=>'circle']]]]);
    expectTemplateRejection('template.remove', 'legacy', 'cal', []);
    templateCommand('template.remove', 'legacy', 'GM');
    echo "Template authority passed.\n";
} finally {
    unset($store);
    foreach (['', '-wal', '-shm'] as $suffix) if (is_file($path . $suffix)) unlink($path . $suffix);
}
