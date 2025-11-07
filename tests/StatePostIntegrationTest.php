<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('VTT_STATE_API_INCLUDE_ONLY')) {
    define('VTT_STATE_API_INCLUDE_ONLY', true);
}

require_once __DIR__ . '/../dnd/vtt/api/state.php';

final class StatePostIntegrationTest extends TestCase
{
    private string $boardStatePath;

    /** @var string|null */
    private $originalBoardState;

    /** @var array<int,string> */
    private array $originalBackups = [];

    protected function setUp(): void
    {
        $this->boardStatePath = __DIR__ . '/../dnd/vtt/storage/board-state.json';
        $this->originalBoardState = is_file($this->boardStatePath)
            ? (string) file_get_contents($this->boardStatePath)
            : null;

        $backupPattern = __DIR__ . '/../dnd/vtt/storage/backups/board-state-*.json';
        $existingBackups = glob($backupPattern);
        $this->originalBackups = is_array($existingBackups) ? $existingBackups : [];
    }

    protected function tearDown(): void
    {
        if ($this->originalBoardState === null) {
            if (file_exists($this->boardStatePath)) {
                @unlink($this->boardStatePath);
            }
        } else {
            file_put_contents($this->boardStatePath, $this->originalBoardState);
        }

        $backupPattern = __DIR__ . '/../dnd/vtt/storage/backups/board-state-*.json';
        $currentBackups = glob($backupPattern);
        if (is_array($currentBackups)) {
            foreach ($currentBackups as $backup) {
                if (!in_array($backup, $this->originalBackups, true)) {
                    @unlink($backup);
                }
            }
        }
    }

    public function testPlayerMovementUpdatesGmTokenAndPersistsToBoardState(): void
    {
        $initialState = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'gm-token',
                        'name' => 'Goblin',
                        'metadata' => ['authorRole' => 'gm'],
                        'flags' => ['gmAuthored' => true],
                        'position' => ['x' => 2, 'y' => 3],
                        'hp' => 12,
                    ],
                ],
            ],
        ];

        $this->assertTrue(saveVttJson('board-state.json', $initialState));

        $playerPayload = [
            'placements' => [
                'scene-1' => [
                    [
                        'id' => 'gm-token',
                        'position' => ['x' => 8, 'y' => 5],
                        'hp' => 9,
                    ],
                ],
            ],
        ];

        $updates = sanitizeBoardStateUpdates($playerPayload);
        $existingState = loadVttJson('board-state.json');
        $nextState = normalizeBoardState($existingState);

        $placementUpdates = $updates['placements'] ?? [];
        foreach ($placementUpdates as $sceneId => $placements) {
            $currentPlacements = isset($nextState['placements'][$sceneId]) && is_array($nextState['placements'][$sceneId])
                ? $nextState['placements'][$sceneId]
                : [];
            $nextState['placements'][$sceneId] = mergeSceneEntriesPreservingGmAuthored(
                $currentPlacements,
                $placements
            );
        }

        $this->assertTrue(saveVttJson('board-state.json', $nextState));

        $stored = loadVttJson('board-state.json');
        $this->assertSame(8, $stored['placements']['scene-1'][0]['position']['x']);
        $this->assertSame(5, $stored['placements']['scene-1'][0]['position']['y']);
        $this->assertSame(9, $stored['placements']['scene-1'][0]['hp']);
        $this->assertSame('gm', $stored['placements']['scene-1'][0]['metadata']['authorRole']);
        $this->assertTrue($stored['placements']['scene-1'][0]['flags']['gmAuthored']);

        $playerView = filterPlacementsForPlayerView($stored);
        $this->assertArrayHasKey('scene-1', $playerView['placements']);
        $this->assertCount(1, $playerView['placements']['scene-1']);
        $this->assertSame(8, $playerView['placements']['scene-1'][0]['position']['x']);
        $this->assertSame(5, $playerView['placements']['scene-1'][0]['position']['y']);
    }
}
