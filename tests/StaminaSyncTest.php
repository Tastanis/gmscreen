<?php

declare(strict_types=1);

use PHPUnit\Framework\TestCase;

if (!defined('HANDLER_INCLUDE_ONLY')) {
    define('HANDLER_INCLUDE_ONLY', true);
}

if (session_status() === PHP_SESSION_NONE) {
    $_SESSION = [];
}
$_SESSION['user'] = 'GM';

require_once __DIR__ . '/../dnd/character_sheet/handler.php';

/**
 * Regression tests for the stamina sync pipeline between VTT and character sheets.
 *
 * Covers:
 *  - normalize_vitals() handling of current and legacy field formats
 *  - mergeCharacterDefaults() preserving vitals through save/load cycles
 *  - loadCharacterSheetData() / saveCharacterSheetData() round-trip for stamina
 *  - sync-stamina action field mapping (staminaMax, currentStamina)
 */
final class StaminaSyncTest extends TestCase
{
    private string $tmpDir;
    private string $tmpFile;

    protected function setUp(): void
    {
        $this->tmpDir = sys_get_temp_dir() . '/stamina_sync_test_' . bin2hex(random_bytes(4));
        mkdir($this->tmpDir, 0755, true);
        $this->tmpFile = $this->tmpDir . '/character_sheets.json';
    }

    protected function tearDown(): void
    {
        if (file_exists($this->tmpFile)) {
            @unlink($this->tmpFile);
        }
        if (is_dir($this->tmpDir)) {
            @rmdir($this->tmpDir);
        }
    }

    // ----------------------------------------------------------------
    // normalize_vitals
    // ----------------------------------------------------------------

    public function testNormalizeVitalsPreservesCurrentFormat(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $input = [
            'size' => '1M',
            'speed' => '5',
            'stability' => '0',
            'disengage' => '1',
            'save' => '12+',
            'staminaMax' => 42,
            'recoveriesMax' => 8,
            'currentStamina' => 35,
            'currentRecoveries' => 6,
            'recoveryValue' => '10',
        ];

        $result = normalize_vitals($input, $defaults);

        $this->assertSame(42, $result['staminaMax']);
        $this->assertSame(8, $result['recoveriesMax']);
        $this->assertSame(35, $result['currentStamina']);
        $this->assertSame(6, $result['currentRecoveries']);
        $this->assertSame('1M', $result['size']);
        $this->assertSame('5', $result['speed']);
        $this->assertSame('10', $result['recoveryValue']);
    }

    public function testNormalizeVitalsMigratesLegacyStaminaField(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $input = [
            'stamina' => 50,
            'recoveries' => 10,
        ];

        $result = normalize_vitals($input, $defaults);

        $this->assertSame(50, $result['staminaMax'], 'Legacy stamina should become staminaMax');
        $this->assertSame(50, $result['currentStamina'], 'Legacy stamina should become currentStamina');
        $this->assertSame(10, $result['recoveriesMax'], 'Legacy recoveries should become recoveriesMax');
        $this->assertSame(10, $result['currentRecoveries'], 'Legacy recoveries should become currentRecoveries');
    }

    public function testNormalizeVitalsNewFieldsOverrideLegacy(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $input = [
            'stamina' => 100,
            'recoveries' => 20,
            'staminaMax' => 55,
            'currentStamina' => 40,
            'recoveriesMax' => 8,
            'currentRecoveries' => 5,
        ];

        $result = normalize_vitals($input, $defaults);

        $this->assertSame(55, $result['staminaMax'], 'Explicit staminaMax should override legacy stamina');
        $this->assertSame(40, $result['currentStamina'], 'Explicit currentStamina should override legacy');
        $this->assertSame(8, $result['recoveriesMax']);
        $this->assertSame(5, $result['currentRecoveries']);
    }

    public function testNormalizeVitalsHandlesEmptyInput(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $result = normalize_vitals([], $defaults);

        $this->assertSame(0, $result['staminaMax']);
        $this->assertSame(0, $result['currentStamina']);
        $this->assertSame(0, $result['recoveriesMax']);
        $this->assertSame(0, $result['currentRecoveries']);
    }

    public function testNormalizeVitalsHandlesNonArrayInput(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $result = normalize_vitals('not-an-array', $defaults);

        $this->assertSame($defaults['staminaMax'], $result['staminaMax']);
        $this->assertSame($defaults['currentStamina'], $result['currentStamina']);
    }

    // ----------------------------------------------------------------
    // mergeCharacterDefaults – vitals survival
    // ----------------------------------------------------------------

    public function testMergeCharacterDefaultsPreservesVitals(): void
    {
        $defaults = getDefaultCharacterEntry();
        $entry = [
            'hero' => [
                'name' => 'Frunk',
                'vitals' => [
                    'staminaMax' => 60,
                    'currentStamina' => 45,
                    'recoveriesMax' => 10,
                    'currentRecoveries' => 7,
                ],
            ],
        ];

        $result = mergeCharacterDefaults($entry, $defaults);

        $this->assertSame(60, $result['hero']['vitals']['staminaMax']);
        $this->assertSame(45, $result['hero']['vitals']['currentStamina']);
        $this->assertSame(10, $result['hero']['vitals']['recoveriesMax']);
        $this->assertSame(7, $result['hero']['vitals']['currentRecoveries']);
        $this->assertSame('Frunk', $result['hero']['name']);
    }

    public function testMergeCharacterDefaultsIncludesAllVitalKeys(): void
    {
        $defaults = getDefaultCharacterEntry();
        $entry = [
            'hero' => [
                'vitals' => [
                    'staminaMax' => 30,
                    'currentStamina' => 20,
                ],
            ],
        ];

        $result = mergeCharacterDefaults($entry, $defaults);

        $expectedKeys = ['size', 'speed', 'stability', 'disengage', 'save',
            'staminaMax', 'recoveriesMax', 'currentStamina', 'currentRecoveries', 'recoveryValue'];

        foreach ($expectedKeys as $key) {
            $this->assertArrayHasKey($key, $result['hero']['vitals'],
                "Vital key '$key' must be present after merge");
        }
    }

    public function testMergeCharacterDefaultsMigratesLegacyVitals(): void
    {
        $defaults = getDefaultCharacterEntry();
        $entry = [
            'hero' => [
                'vitals' => [
                    'stamina' => 80,
                    'recoveries' => 12,
                ],
            ],
        ];

        $result = mergeCharacterDefaults($entry, $defaults);

        $this->assertSame(80, $result['hero']['vitals']['staminaMax']);
        $this->assertSame(80, $result['hero']['vitals']['currentStamina']);
        $this->assertSame(12, $result['hero']['vitals']['recoveriesMax']);
        $this->assertSame(12, $result['hero']['vitals']['currentRecoveries']);
    }

    // ----------------------------------------------------------------
    // save / load round-trip for stamina values
    // ----------------------------------------------------------------

    public function testSaveAndLoadPreservesStaminaValues(): void
    {
        $characters = ['frunk'];
        $defaults = getDefaultCharacterEntry();
        $data = ['frunk' => $defaults];
        $data['frunk']['hero']['vitals']['staminaMax'] = 50;
        $data['frunk']['hero']['vitals']['currentStamina'] = 35;

        $this->assertTrue(saveCharacterSheetData($this->tmpDir, $this->tmpFile, $data));

        $loaded = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);

        $this->assertSame(50, $loaded['frunk']['hero']['vitals']['staminaMax']);
        $this->assertSame(35, $loaded['frunk']['hero']['vitals']['currentStamina']);
    }

    public function testLoadNormalizesCorruptedStaminaValues(): void
    {
        $characters = ['frunk'];
        $corrupted = [
            'frunk' => [
                'hero' => [
                    'vitals' => [
                        'stamina' => 70,
                    ],
                ],
            ],
        ];

        file_put_contents($this->tmpFile, json_encode($corrupted, JSON_PRETTY_PRINT));

        $loaded = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);

        $this->assertSame(70, $loaded['frunk']['hero']['vitals']['staminaMax'],
            'Legacy stamina should be normalized to staminaMax on load');
        $this->assertSame(70, $loaded['frunk']['hero']['vitals']['currentStamina'],
            'Legacy stamina should also populate currentStamina');
    }

    // ----------------------------------------------------------------
    // sync-stamina action field mapping
    // ----------------------------------------------------------------

    public function testSyncStaminaPostUpdatesCharacterSheet(): void
    {
        $characters = ['frunk'];
        $defaults = getDefaultCharacterEntry();
        $initial = ['frunk' => $defaults];
        $initial['frunk']['hero']['name'] = 'Frunk';
        $initial['frunk']['hero']['vitals']['staminaMax'] = 50;
        $initial['frunk']['hero']['vitals']['currentStamina'] = 50;

        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $initial);

        // Simulate the sync-stamina POST action logic from handler.php
        $allSheets = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);
        $sheet = $allSheets['frunk'];

        $staminaMax = 50;
        $currentStamina = 35;

        $sheet['hero']['vitals']['staminaMax'] = $staminaMax;
        $sheet['hero']['vitals']['currentStamina'] = $currentStamina;
        $allSheets['frunk'] = $sheet;

        $this->assertTrue(saveCharacterSheetData($this->tmpDir, $this->tmpFile, $allSheets));

        // Verify by reloading
        $reloaded = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);
        $this->assertSame(50, $reloaded['frunk']['hero']['vitals']['staminaMax']);
        $this->assertSame(35, $reloaded['frunk']['hero']['vitals']['currentStamina']);
    }

    public function testSyncStaminaGetReturnsExpectedFields(): void
    {
        $characters = ['frunk'];
        $defaults = getDefaultCharacterEntry();
        $data = ['frunk' => $defaults];
        $data['frunk']['hero']['name'] = 'Frunk the Bold';
        $data['frunk']['hero']['vitals']['staminaMax'] = 60;
        $data['frunk']['hero']['vitals']['currentStamina'] = 42;

        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $data);

        // Simulate the sync-stamina GET response construction from handler.php
        $allSheets = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);
        $sheet = $allSheets['frunk'];

        $response = [
            'name' => isset($sheet['hero']['name']) && $sheet['hero']['name'] !== ''
                ? $sheet['hero']['name'] : 'frunk',
            'staminaMax' => isset($sheet['hero']['vitals']['staminaMax'])
                ? $sheet['hero']['vitals']['staminaMax'] : 0,
            'currentStamina' => isset($sheet['hero']['vitals']['currentStamina'])
                ? $sheet['hero']['vitals']['currentStamina'] : 0,
        ];

        $this->assertSame('Frunk the Bold', $response['name']);
        $this->assertSame(60, $response['staminaMax']);
        $this->assertSame(42, $response['currentStamina']);
    }

    public function testSyncStaminaFallbackNameIsCharacterKey(): void
    {
        $characters = ['sharon'];
        $defaults = getDefaultCharacterEntry();
        $data = ['sharon' => $defaults];
        // Leave hero name empty
        $data['sharon']['hero']['vitals']['staminaMax'] = 30;
        $data['sharon']['hero']['vitals']['currentStamina'] = 30;

        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $data);
        $allSheets = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);
        $sheet = $allSheets['sharon'];

        $name = isset($sheet['hero']['name']) && $sheet['hero']['name'] !== ''
            ? $sheet['hero']['name'] : 'sharon';

        $this->assertSame('sharon', $name, 'Fallback name should be the character key');
    }

    public function testSyncStaminaOnlyCurrentStaminaUpdated(): void
    {
        $characters = ['frunk'];
        $defaults = getDefaultCharacterEntry();
        $data = ['frunk' => $defaults];
        $data['frunk']['hero']['vitals']['staminaMax'] = 50;
        $data['frunk']['hero']['vitals']['currentStamina'] = 50;

        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $data);

        // Simulate sync where only currentStamina is provided (staminaMax is null)
        $allSheets = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);
        $sheet = $allSheets['frunk'];

        $staminaMax = null;
        $currentStamina = 25;

        if ($staminaMax !== null) {
            $sheet['hero']['vitals']['staminaMax'] = $staminaMax;
        }
        $sheet['hero']['vitals']['currentStamina'] = $currentStamina;
        $allSheets['frunk'] = $sheet;

        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $allSheets);
        $reloaded = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);

        $this->assertSame(50, $reloaded['frunk']['hero']['vitals']['staminaMax'],
            'staminaMax should remain unchanged when not provided');
        $this->assertSame(25, $reloaded['frunk']['hero']['vitals']['currentStamina'],
            'currentStamina should be updated');
    }

    // ----------------------------------------------------------------
    // Multiple characters don't interfere
    // ----------------------------------------------------------------

    public function testSyncStaminaForOneCharacterDoesNotAffectAnother(): void
    {
        $characters = ['frunk', 'sharon'];
        $defaults = getDefaultCharacterEntry();
        $data = [];

        foreach ($characters as $name) {
            $data[$name] = $defaults;
            $data[$name]['hero']['name'] = ucfirst($name);
            $data[$name]['hero']['vitals']['staminaMax'] = 50;
            $data[$name]['hero']['vitals']['currentStamina'] = 50;
        }

        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $data);

        // Update only frunk's stamina
        $allSheets = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);
        $allSheets['frunk']['hero']['vitals']['currentStamina'] = 30;
        saveCharacterSheetData($this->tmpDir, $this->tmpFile, $allSheets);

        $reloaded = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);

        $this->assertSame(30, $reloaded['frunk']['hero']['vitals']['currentStamina']);
        $this->assertSame(50, $reloaded['sharon']['hero']['vitals']['currentStamina'],
            'Sharon\'s stamina should be unaffected by Frunk\'s update');
    }

    // ----------------------------------------------------------------
    // Default character entry structure
    // ----------------------------------------------------------------

    public function testDefaultCharacterEntryHasVitalsStructure(): void
    {
        $defaults = getDefaultCharacterEntry();

        $this->assertArrayHasKey('hero', $defaults);
        $this->assertArrayHasKey('vitals', $defaults['hero']);
        $this->assertArrayHasKey('staminaMax', $defaults['hero']['vitals']);
        $this->assertArrayHasKey('currentStamina', $defaults['hero']['vitals']);
        $this->assertArrayHasKey('recoveriesMax', $defaults['hero']['vitals']);
        $this->assertArrayHasKey('currentRecoveries', $defaults['hero']['vitals']);
        $this->assertSame(0, $defaults['hero']['vitals']['staminaMax']);
        $this->assertSame(0, $defaults['hero']['vitals']['currentStamina']);
    }

    // ----------------------------------------------------------------
    // Edge cases
    // ----------------------------------------------------------------

    public function testNormalizeVitalsHandlesStringStaminaValues(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $input = [
            'staminaMax' => '50',
            'currentStamina' => '35',
        ];

        $result = normalize_vitals($input, $defaults);

        $this->assertSame('50', $result['staminaMax']);
        $this->assertSame('35', $result['currentStamina']);
    }

    public function testNormalizeVitalsHandlesZeroStamina(): void
    {
        $defaults = getDefaultCharacterEntry()['hero']['vitals'];
        $input = [
            'staminaMax' => 50,
            'currentStamina' => 0,
        ];

        $result = normalize_vitals($input, $defaults);

        $this->assertSame(50, $result['staminaMax']);
        $this->assertSame(0, $result['currentStamina'],
            'Zero stamina should be preserved, not replaced by default');
    }

    public function testLoadCreatesDefaultFileIfMissing(): void
    {
        $characters = ['frunk'];
        $loaded = loadCharacterSheetData($this->tmpDir, $this->tmpFile, $characters);

        $this->assertArrayHasKey('frunk', $loaded);
        $this->assertArrayHasKey('hero', $loaded['frunk']);
        $this->assertArrayHasKey('vitals', $loaded['frunk']['hero']);
        $this->assertSame(0, $loaded['frunk']['hero']['vitals']['staminaMax']);
        $this->assertSame(0, $loaded['frunk']['hero']['vitals']['currentStamina']);
        $this->assertFileExists($this->tmpFile);
    }
}
