<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('VTT_SCENES_API_INCLUDE_ONLY')) {
    define('VTT_SCENES_API_INCLUDE_ONLY', true);
}
if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    define('VTT_STATE_API_INCLUDE_ONLY', true);
}

require_once __DIR__ . '/../dnd/vtt/api/scenes.php';

final class SceneDeletionIntegrationTest extends TestCase
{
    private string $scenesPath;
    private string $boardStatePath;

    /** @var array<string,string|null> */
    private array $originalFiles = [];

    /** @var array<int,string> */
    private array $originalBackups = [];

    protected function setUp(): void
    {
        $storageDir = __DIR__ . '/../dnd/vtt/storage';
        $this->scenesPath = $storageDir . '/scenes.json';
        $this->boardStatePath = $storageDir . '/board-state.json';
        foreach ([$this->scenesPath, $this->boardStatePath] as $path) {
            $this->originalFiles[$path] = is_file($path)
                ? (string) file_get_contents($path)
                : null;
        }

        $existingBackups = glob($storageDir . '/backups/{scenes,board-state}-*.json', GLOB_BRACE);
        $this->originalBackups = is_array($existingBackups) ? $existingBackups : [];
    }

    protected function tearDown(): void
    {
        foreach ($this->originalFiles as $path => $contents) {
            if ($contents === null) {
                if (is_file($path)) {
                    @unlink($path);
                }
            } else {
                file_put_contents($path, $contents);
            }
        }

        $storageDir = __DIR__ . '/../dnd/vtt/storage';
        $currentBackups = glob($storageDir . '/backups/{scenes,board-state}-*.json', GLOB_BRACE);
        if (is_array($currentBackups)) {
            foreach ($currentBackups as $backup) {
                if (!in_array($backup, $this->originalBackups, true)) {
                    @unlink($backup);
                }
            }
        }
    }

    public function testSceneDeletionUpdatesCatalogAndCanonicalPlacementsWithoutWritingLegacyState(): void
    {
        $this->assertTrue(saveVttJson('scenes.json', [
            'folders' => [],
            'scenes' => [
                ['id' => 'delete-me', 'name' => 'Old encounter'],
                ['id' => 'keep-me', 'name' => 'Current encounter'],
            ],
        ]));
        $this->assertTrue(saveVttJson('board-state.json', [
            '_version' => 41,
            'activeSceneId' => 'delete-me',
            'mapUrl' => '/maps/old.webp',
            'playerActiveSceneId' => 'delete-me',
            'playerMapUrl' => '/maps/old.webp',
            'playerThumbnailUrl' => '/maps/old-thumb.webp',
            'placements' => [
                'delete-me' => [['id' => 'old-token']],
                'keep-me' => [['id' => 'current-token']],
            ],
            'templates' => [
                'delete-me' => [['id' => 'old-template']],
                'keep-me' => [['id' => 'current-template']],
            ],
            'drawings' => [
                'delete-me' => [['id' => 'old-drawing']],
                'keep-me' => [['id' => 'current-drawing']],
            ],
            'sceneState' => [
                'delete-me' => [
                    'claimedTokens' => ['old-token' => 'player one'],
                    'userLevelState' => ['player one' => ['levelId' => 'upper']],
                    'combat' => ['active' => true, 'round' => 12],
                ],
                'keep-me' => ['combat' => ['active' => true, 'round' => 1]],
            ],
            'pings' => [
                ['id' => 'old-ping', 'sceneId' => 'delete-me'],
                ['id' => 'current-ping', 'sceneId' => 'keep-me'],
            ],
            'futureServerField' => ['preserve' => true],
        ]));

        $legacyBefore = file_get_contents($this->boardStatePath);
        $store = vttSyncV2Store();
        $store->acceptPlacementBatch([
            'type'=>'placement.batch', 'operationId'=>'scene-delete-seed-' . bin2hex(random_bytes(8)),
            'baseRevision'=>$store->getSnapshot()['revision'], 'payload'=>['actions'=>[
                ['kind'=>'add','sceneId'=>'delete-me','placementId'=>'old-token','placement'=>['id'=>'old-token','column'=>0,'row'=>0]],
                ['kind'=>'add','sceneId'=>'keep-me','placementId'=>'current-token','placement'=>['id'=>'current-token','column'=>0,'row'=>0]],
            ]],
        ], 'GM', true);
        $beforeRevision = $store->getSnapshot()['revision'];
        $version = deleteScene('delete-me', false);
        $this->assertSame($beforeRevision + 1, $version);
        $scenes = loadVttJson('scenes.json');
        $this->assertSame(['keep-me'], array_column($scenes['scenes'], 'id'));
        $placements = $store->getSnapshot()['state']['placements'];
        $this->assertArrayNotHasKey('delete-me', $placements);
        $this->assertArrayHasKey('current-token', $placements['keep-me']);
        $this->assertSame($legacyBefore, file_get_contents($this->boardStatePath));
    }
}
