<?php
require_once __DIR__ . '/../includes/json-file-helper.php';
require_once __DIR__ . '/../../includes/players.php';

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

// Which of a hero's campaign relationships is this student's, for the Students page's save (index.php
// syncRelationshipsToCharacters): the one with the student's id, or else an older entry with no id that has the
// student's name, as the campaign page links it (includes/campaign-api.php campaign_relationship_link). -1 for none.
// October 2026: an entry linked by name only was not found, and each save on the Students page added a second one.
function findStudentRelationshipIndex(array $relationships, string $studentId, string $studentName) {
    if ($studentId !== '') {
        foreach ($relationships as $index => $rel) {
            if (is_array($rel) && (string) ($rel['student_id'] ?? '') === $studentId) return (int) $index;
        }
    }
    $name = strtolower(trim($studentName));
    if ($name === '') return -1;
    foreach ($relationships as $index => $rel) {
        if (!is_array($rel) || trim((string) ($rel['student_id'] ?? '')) !== '' || trim((string) ($rel['staff_id'] ?? '')) !== '') continue;
        if (strtolower(trim((string) ($rel['npc_name'] ?? ''))) === $name) return (int) $index;
    }
    return -1;
}

// Points and notes for every player on the list, on or off (includes/players.php)
function getBlankStudentRelationships() {
    $relationships = [];
    foreach (players_ids() as $id) {
        $relationships[$id . '_points'] = '';
        $relationships[$id . '_notes'] = '';
    }
    return $relationships;
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
        'relationships' => getBlankStudentRelationships(),
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
        // Legacy fields kept for backward compatibility
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
