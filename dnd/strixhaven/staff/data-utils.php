<?php
require_once __DIR__ . '/../includes/json-file-helper.php';

function getStaffDataFilePath() {
    return __DIR__ . '/staff.json';
}

function getStaffLockFilePath() {
    return __DIR__ . '/staff.lock';
}

function getDefaultStaffDataset() {
    return [
        'staff' => [],
        'metadata' => [
            'last_updated' => date('Y-m-d H:i:s'),
            'total_staff' => 0,
        ],
    ];
}

function getBlankStaffRecord() {
    return [
        'staff_id' => 'staff_' . time() . '_' . uniqid(),
        'name' => 'New Staff Member',
        'title' => '',
        'college' => '',
        'role' => '',
        'pronouns' => '',
        'image_path' => '',
        'images' => [],
        'favorites' => [],
        'character_info' => [
            'origin' => '',
            'motivation' => '',
            'secrets' => '',
            'relationships' => '',
        ],
        'gm_only' => [
            'plot_hooks' => '',
            'secrets' => '',
            'notes' => '',
        ],
    ];
}

function updateStaffMetadata(array &$data) {
    if (!isset($data['metadata']) || !is_array($data['metadata'])) {
        $data['metadata'] = [];
    }
    $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
    $data['metadata']['total_staff'] = isset($data['staff']) && is_array($data['staff'])
        ? count($data['staff'])
        : 0;
}

function loadStaffData() {
    return loadJsonFileWithBackup(getStaffDataFilePath(), [
        'default' => function () {
            return getDefaultStaffDataset();
        },
        'backup_prefix' => 'staff',
    ]);
}

function modifyStaffData(callable $modifier) {
    return modifyJsonFileWithLock(
        getStaffDataFilePath(),
        function (&$data) use ($modifier) {
            if (!isset($data['staff']) || !is_array($data['staff'])) {
                $data['staff'] = [];
            }
            return $modifier($data);
        },
        [
            'default' => function () {
                return getDefaultStaffDataset();
            },
            'backup_prefix' => 'staff',
            'lock_file' => getStaffLockFilePath(),
            'before_save' => function (&$data) {
                updateStaffMetadata($data);
            },
        ]
    );
}

function saveStaffData(array $newData) {
    $result = modifyJsonFileWithLock(
        getStaffDataFilePath(),
        function (&$data) use ($newData) {
            $data = $newData;
            return ['result' => true];
        },
        [
            'default' => function () {
                return getDefaultStaffDataset();
            },
            'backup_prefix' => 'staff',
            'lock_file' => getStaffLockFilePath(),
            'before_save' => function (&$data) {
                updateStaffMetadata($data);
            },
        ]
    );

    return $result['success'];
}
