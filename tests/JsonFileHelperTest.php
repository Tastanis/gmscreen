<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../dnd/strixhaven/includes/json-file-helper.php';

final class JsonFileHelperTest extends TestCase
{
    private string $tempDir;
    private string $dataPath;

    protected function setUp(): void
    {
        $this->tempDir = sys_get_temp_dir() . '/json-file-helper-' . bin2hex(random_bytes(8));
        $this->dataPath = $this->tempDir . '/data.json';

        mkdir($this->tempDir, 0775, true);
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

    public function testBeforeSaveCallbackCanMutateDataByReference(): void
    {
        set_error_handler(static function (int $severity, string $message): bool {
            throw new ErrorException($message, 0, $severity);
        });

        try {
            $result = modifyJsonFileWithLock(
                $this->dataPath,
                static function (array &$data): array {
                    $data['relationships'] = ['sharon_points' => 2];
                    return ['result' => true];
                },
                [
                    'default' => [],
                    'before_save' => static function (array &$data): void {
                        $data['metadata'] = ['total_relationships' => count($data['relationships'])];
                    },
                ]
            );
        } finally {
            restore_error_handler();
        }

        $this->assertTrue($result['success']);
        $saved = json_decode((string) file_get_contents($this->dataPath), true);
        $this->assertSame(['sharon_points' => 2], $saved['relationships']);
        $this->assertSame(1, $saved['metadata']['total_relationships']);
    }
}
