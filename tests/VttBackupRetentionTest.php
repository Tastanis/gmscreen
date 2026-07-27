<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/vtt/bootstrap.php';

final class VttBackupRetentionTest extends TestCase
{
    private string $tempDir;
    private string $sourcePath;

    protected function setUp(): void
    {
        $this->tempDir = sys_get_temp_dir() . '/vtt-backup-retention-' . bin2hex(random_bytes(8));
        $this->sourcePath = $this->tempDir . '/board-state.json';

        mkdir($this->tempDir, 0775, true);
        file_put_contents($this->sourcePath, '{"version":1}');
    }

    protected function tearDown(): void
    {
        if (!is_dir($this->tempDir)) {
            return;
        }

        $entries = scandir($this->tempDir);
        if (is_array($entries)) {
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }
                @unlink($this->tempDir . '/' . $entry);
            }
        }

        @rmdir($this->tempDir);
    }

    public function testBackupCreationIsSpacedByThirtyMinutes(): void
    {
        $start = 1_800_000_000;

        maintainVttJsonBackup('board-state.json', $this->sourcePath, $this->tempDir, $start);
        maintainVttJsonBackup('board-state.json', $this->sourcePath, $this->tempDir, $start + 60);

        $this->assertCount(1, listVttJsonBackups($this->tempDir, 'board-state'));

        maintainVttJsonBackup(
            'board-state.json',
            $this->sourcePath,
            $this->tempDir,
            $start + VTT_BACKUP_MIN_INTERVAL_SECONDS
        );

        $this->assertCount(2, listVttJsonBackups($this->tempDir, 'board-state'));
    }

    public function testPruningKeepsOnlyNewestMatchingBackups(): void
    {
        $start = 1_800_000_000;

        for ($index = 0; $index < 6; $index++) {
            $timestamp = $start + $index;
            $path = $this->tempDir . '/board-state-' . date('Ymd_His', $timestamp) . '.json';
            file_put_contents($path, (string) $index);
            touch($path, $timestamp);
        }

        $unrelated = $this->tempDir . '/tokens-' . date('Ymd_His', $start) . '.json';
        file_put_contents($unrelated, 'tokens');

        pruneVttJsonBackups($this->tempDir, 'board-state', 3);

        $remaining = listVttJsonBackups($this->tempDir, 'board-state');
        $this->assertCount(3, $remaining);
        $this->assertSame('5', file_get_contents($remaining[0]));
        $this->assertSame('3', file_get_contents($remaining[2]));
        $this->assertFileExists($unrelated);
    }

    public function testDefaultRetentionNeverExceedsPerFileLimit(): void
    {
        $start = 1_800_000_000;

        for ($index = 0; $index < VTT_BACKUP_MAX_FILES_PER_DATA_FILE + 5; $index++) {
            $timestamp = $start + $index;
            $path = $this->tempDir . '/board-state-' . date('Ymd_His', $timestamp) . '.json';
            file_put_contents($path, (string) $index);
            touch($path, $timestamp);
        }

        maintainVttJsonBackup(
            'board-state.json',
            $this->sourcePath,
            $this->tempDir,
            $start + 100
        );

        $remaining = listVttJsonBackups($this->tempDir, 'board-state');
        $this->assertCount(VTT_BACKUP_MAX_FILES_PER_DATA_FILE, $remaining);
        $this->assertSame(
            (string) (VTT_BACKUP_MAX_FILES_PER_DATA_FILE + 4),
            file_get_contents($remaining[0])
        );
    }
}
