<?php
require_once __DIR__ . '/../includes/json-file-helper.php';

function getStudentDataFilePath() {
    return __DIR__ . '/students.json';
}

function getStudentLockFilePath() {
    return __DIR__ . '/students.lock';
}

function getDefaultStudentDataset() {
    return [
        'students' => [],
        'metadata' => [
            'last_updated' => date('Y-m-d H:i:s'),
            'total_students' => 0,
        ],
    ];
}

function getBlankStudentRecord() {
    return [
        'student_id' => 'student_' . time() . '_' . uniqid(),
        'name' => 'New Student',
        'images' => [],
        'grade_level' => '1st Year',
        'college' => '',
        'clubs' => [],
        'job' => '',
        'race' => '',
        'age' => '',
        'skills' => [],
        'edge' => '',
        'bane' => '',
        'favorites' => [],
        'relationships' => [
            'frunk_points' => '',
            'frunk_notes' => '',
            'zepha_points' => '',
            'zepha_notes' => '',
            'sharon_points' => '',
            'sharon_notes' => '',
            'indigo_points' => '',
            'indigo_notes' => '',
        ],
        'character_info' => [
            'origin' => '',
            'desire' => '',
            'fear' => '',
            'connection' => '',
            'impact' => '',
            'change' => '',
        ],
        'details' => [
            'backstory' => '',
            'core_want' => '',
            'core_fear' => '',
            'other' => '',
        ],
    ];
}

function updateStudentMetadata(array &$data) {
    if (!isset($data['metadata']) || !is_array($data['metadata'])) {
        $data['metadata'] = [];
    }
    $data['metadata']['last_updated'] = date('Y-m-d H:i:s');
    $data['metadata']['total_students'] = isset($data['students']) && is_array($data['students'])
        ? count($data['students'])
        : 0;
}

function loadStudentData() {
    return loadJsonFileWithBackup(getStudentDataFilePath(), [
        'default' => function () {
            return getDefaultStudentDataset();
        },
        'backup_prefix' => 'students',
    ]);
}

function modifyStudentData(callable $modifier) {
    return modifyJsonFileWithLock(
        getStudentDataFilePath(),
        function (&$data) use ($modifier) {
            if (!isset($data['students']) || !is_array($data['students'])) {
                $data['students'] = [];
            }
            return $modifier($data);
        },
        [
            'default' => function () {
                return getDefaultStudentDataset();
            },
            'backup_prefix' => 'students',
            'lock_file' => getStudentLockFilePath(),
            'before_save' => function (&$data) {
                updateStudentMetadata($data);
            },
        ]
    );
}

function saveStudentData(array $newData) {
    $result = modifyJsonFileWithLock(
        getStudentDataFilePath(),
        function (&$data) use ($newData) {
            $data = $newData;
            return ['result' => true];
        },
        [
            'default' => function () {
                return getDefaultStudentDataset();
            },
            'backup_prefix' => 'students',
            'lock_file' => getStudentLockFilePath(),
            'before_save' => function (&$data) {
                updateStudentMetadata($data);
            },
        ]
    );

    return $result['success'];
}
