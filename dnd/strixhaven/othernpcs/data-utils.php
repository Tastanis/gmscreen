<?php
require_once __DIR__ . '/../includes/json-file-helper.php';

function getNpcDataFilePath() {
    return __DIR__ . '/othernpcs.json';
}

function getNpcLockFilePath() {
    return __DIR__ . '/othernpcs.lock';
}

function getDefaultNpcDataset() {
    return [
        'npcs' => [],
        'metadata' => [
            'last_updated' => date('Y-m-d H:i:s'),
            'total_npcs' => 0,
        ],
    ];
}

function getBlankNpcRecord() {
    return [
        'npc_id' => 'npc_' . time() . '_' . uniqid(),
        'name' => 'New NPC',
        'images' => [],
        'race' => '',
        'college' => '',
        'favorites' => [],
        'conflict_engine' => [
            'want' => '',
            'want_tag' => '',
            'obstacle' => '',
            'action' => '',
            'consequence' => '',
        ],
        'tension_web' => [],
        'pressure_point' => '',
        'trajectory' => '',
        'directors_notes' => '',
        'details' => [
            'backstory' => '',
            'core_want' => '',
            'core_fear' => '',
            'other' => '',
        ],
    ];
}

function updateNpcMetadata(array &$data) {
    if (!isset($data['metadata']) || !is_array($data['metadata'])) {
        $data['metadata'] = [];
    }
    $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
    $data['metadata']['total_npcs'] = isset($data['npcs']) && is_array($data['npcs'])
        ? count($data['npcs'])
        : 0;
}

function loadNpcData() {
    return loadJsonFileWithBackup(getNpcDataFilePath(), [
        'default' => function () {
            return getDefaultNpcDataset();
        },
        'backup_prefix' => 'othernpcs',
    ]);
}

function modifyNpcData(callable $modifier) {
    return modifyJsonFileWithLock(
        getNpcDataFilePath(),
        function (&$data) use ($modifier) {
            if (!isset($data['npcs']) || !is_array($data['npcs'])) {
                $data['npcs'] = [];
            }
            return $modifier($data);
        },
        [
            'default' => function () {
                return getDefaultNpcDataset();
            },
            'backup_prefix' => 'othernpcs',
            'lock_file' => getNpcLockFilePath(),
            'before_save' => function (&$data) {
                updateNpcMetadata($data);
            },
        ]
    );
}

function saveNpcData(array $newData) {
    $result = modifyJsonFileWithLock(
        getNpcDataFilePath(),
        function (&$data) use ($newData) {
            $data = $newData;
            return ['result' => true];
        },
        [
            'default' => function () {
                return getDefaultNpcDataset();
            },
            'backup_prefix' => 'othernpcs',
            'lock_file' => getNpcLockFilePath(),
            'before_save' => function (&$data) {
                updateNpcMetadata($data);
            },
        ]
    );

    return $result['success'];
}
