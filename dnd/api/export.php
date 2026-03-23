<?php
/**
 * Campaign Data Export API
 *
 * Exports student and staff NPC data as plain text, split by college and type.
 *
 * Endpoints:
 *   /dnd/api/export.php                          - Directory listing of all available endpoints
 *   /dnd/api/export.php?college=lorehold&type=students   - Lorehold students
 *   /dnd/api/export.php?college=lorehold&type=staff      - Lorehold staff
 *   /dnd/api/export.php?college=prismari&type=students   - Prismari students
 *   ... etc for quandrix, silverquill, witherbloom
 *   /dnd/api/export.php?college=all&type=students        - All students (grouped by college)
 *   /dnd/api/export.php?college=all&type=staff           - All staff (grouped by college)
 */

header('Content-Type: text/plain; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

// Optional API key protection
$API_KEY = '';
if ($API_KEY !== '' && (!isset($_GET['key']) || $_GET['key'] !== $API_KEY)) {
    http_response_code(403);
    echo "Error: Invalid or missing API key\n";
    exit;
}

// Load data utilities
require_once __DIR__ . '/../strixhaven/students/data-utils.php';
require_once __DIR__ . '/../strixhaven/staff/data-utils.php';

$validColleges = ['lorehold', 'prismari', 'quandrix', 'silverquill', 'witherbloom'];
$collegeProper = [
    'lorehold' => 'Lorehold',
    'prismari' => 'Prismari',
    'quandrix' => 'Quandrix',
    'silverquill' => 'Silverquill',
    'witherbloom' => 'Witherbloom',
];

$college = isset($_GET['college']) ? strtolower(trim($_GET['college'])) : '';
$type = isset($_GET['type']) ? strtolower(trim($_GET['type'])) : '';

// --- Directory listing (no params) ---
if ($college === '' && $type === '') {
    echo "=== Strixhaven Campaign Data Export ===\n\n";
    echo "Available endpoints:\n\n";
    foreach ($validColleges as $c) {
        $proper = $collegeProper[$c];
        echo "  {$proper} Students:  ?college={$c}&type=students\n";
        echo "  {$proper} Staff:     ?college={$c}&type=staff\n";
    }
    echo "\n  All Students:        ?college=all&type=students\n";
    echo "  All Staff:           ?college=all&type=staff\n";
    echo "\n  Character Projects:  See /dnd/api/projects.php\n";
    exit;
}

// Validate type
if ($type !== 'students' && $type !== 'staff') {
    http_response_code(400);
    echo "Error: 'type' must be 'students' or 'staff'\n";
    exit;
}

// Validate college
if ($college !== 'all' && !in_array($college, $validColleges)) {
    http_response_code(400);
    echo "Error: 'college' must be one of: " . implode(', ', $validColleges) . ", or 'all'\n";
    exit;
}

// --- Format a student as plain text ---
function formatStudent($s) {
    $lines = [];
    $lines[] = "Name: " . ($s['name'] ?? 'Unknown');
    if (!empty($s['race']))        $lines[] = "Race: " . $s['race'];
    if (!empty($s['age']))         $lines[] = "Age: " . $s['age'];
    if (!empty($s['college']))     $lines[] = "College: " . $s['college'];
    if (!empty($s['grade_level'])) $lines[] = "Year: " . $s['grade_level'];
    if (!empty($s['job']))         $lines[] = "Job: " . $s['job'];
    if (!empty($s['edge']))        $lines[] = "Edge: " . $s['edge'];
    if (!empty($s['bane']))        $lines[] = "Bane: " . $s['bane'];

    if (!empty($s['clubs']) && is_array($s['clubs'])) {
        $clubs = array_filter($s['clubs']);
        if ($clubs) $lines[] = "Clubs: " . implode(', ', $clubs);
    }

    if (!empty($s['skills']) && is_array($s['skills'])) {
        $skills = array_filter($s['skills']);
        if ($skills) $lines[] = "Skills: " . implode(', ', $skills);
    }

    // Character info (origin, desire, fear, connection, impact, change)
    if (!empty($s['character_info']) && is_array($s['character_info'])) {
        foreach ($s['character_info'] as $key => $val) {
            if (!empty($val)) {
                $label = ucfirst(str_replace('_', ' ', $key));
                $lines[] = "{$label}: {$val}";
            }
        }
    }

    // Details (backstory, core_want, core_fear, other)
    if (!empty($s['details']) && is_array($s['details'])) {
        foreach ($s['details'] as $key => $val) {
            if (!empty($val)) {
                $label = ucfirst(str_replace('_', ' ', $key));
                $lines[] = "{$label}: {$val}";
            }
        }
    }

    // Relationships
    if (!empty($s['relationships']) && is_array($s['relationships'])) {
        $relLines = [];
        $characters = ['frunk', 'zepha', 'sharon', 'indigo'];
        foreach ($characters as $char) {
            $points = $s['relationships']["{$char}_points"] ?? '';
            $notes = $s['relationships']["{$char}_notes"] ?? '';
            if ($points !== '' || !empty($notes)) {
                $entry = ucfirst($char);
                if ($points !== '') $entry .= " ({$points} points)";
                if (!empty($notes)) $entry .= ": {$notes}";
                $relLines[] = $entry;
            }
        }
        if ($relLines) {
            $lines[] = "Relationships:";
            foreach ($relLines as $r) {
                $lines[] = "  - {$r}";
            }
        }
    }

    return implode("\n", $lines);
}

// --- Format a staff member as plain text ---
function formatStaff($s) {
    $lines = [];
    $lines[] = "Name: " . ($s['name'] ?? 'Unknown');
    if (!empty($s['title']))    $lines[] = "Title: " . $s['title'];
    if (!empty($s['role']))     $lines[] = "Role: " . $s['role'];
    if (!empty($s['college']))  $lines[] = "College: " . $s['college'];
    if (!empty($s['pronouns'])) $lines[] = "Pronouns: " . $s['pronouns'];

    // Character info (origin, motivation, secrets, relationships)
    if (!empty($s['character_info']) && is_array($s['character_info'])) {
        foreach ($s['character_info'] as $key => $val) {
            if (!empty($val)) {
                $label = ucfirst(str_replace('_', ' ', $key));
                $lines[] = "{$label}: {$val}";
            }
        }
    }

    // GM-only info (plot_hooks, secrets, notes)
    if (!empty($s['gm_only']) && is_array($s['gm_only'])) {
        foreach ($s['gm_only'] as $key => $val) {
            if (!empty($val)) {
                $label = ucfirst(str_replace('_', ' ', $key));
                $lines[] = "{$label}: {$val}";
            }
        }
    }

    return implode("\n", $lines);
}

// --- Load and filter data ---
if ($type === 'students') {
    $studentData = loadStudentData();
    $allRecords = $studentData['students'] ?? [];

    if ($college === 'all') {
        // Group by college, output all
        echo "=== All Students ===\n";
        echo "Total: " . count($allRecords) . "\n\n";

        foreach ($collegeProper as $key => $proper) {
            $filtered = array_filter($allRecords, function ($s) use ($proper) {
                return ($s['college'] ?? '') === $proper;
            });
            usort($filtered, function ($a, $b) {
                return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
            });
            if ($filtered) {
                echo "--- {$proper} (" . count($filtered) . ") ---\n\n";
                foreach ($filtered as $s) {
                    echo formatStudent($s) . "\n\n";
                }
            }
        }
        // Any without a college
        $noCollege = array_filter($allRecords, function ($s) use ($collegeProper) {
            return !in_array($s['college'] ?? '', array_values($collegeProper));
        });
        if ($noCollege) {
            echo "--- Unaffiliated (" . count($noCollege) . ") ---\n\n";
            foreach ($noCollege as $s) {
                echo formatStudent($s) . "\n\n";
            }
        }
    } else {
        $proper = $collegeProper[$college];
        $filtered = array_filter($allRecords, function ($s) use ($proper) {
            return ($s['college'] ?? '') === $proper;
        });
        usort($filtered, function ($a, $b) {
            return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
        });

        echo "=== {$proper} Students ===\n";
        echo "Total: " . count($filtered) . "\n\n";

        foreach ($filtered as $s) {
            echo formatStudent($s) . "\n\n";
        }

        if (empty($filtered)) {
            echo "(No students found for {$proper})\n";
        }
    }
} else {
    // staff
    $staffData = loadStaffData();
    $allRecords = $staffData['staff'] ?? [];

    if ($college === 'all') {
        echo "=== All Staff ===\n";
        echo "Total: " . count($allRecords) . "\n\n";

        foreach ($collegeProper as $key => $proper) {
            $filtered = array_filter($allRecords, function ($s) use ($proper) {
                return ($s['college'] ?? '') === $proper;
            });
            usort($filtered, function ($a, $b) {
                return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
            });
            if ($filtered) {
                echo "--- {$proper} (" . count($filtered) . ") ---\n\n";
                foreach ($filtered as $s) {
                    echo formatStaff($s) . "\n\n";
                }
            }
        }
        $noCollege = array_filter($allRecords, function ($s) use ($collegeProper) {
            return !in_array($s['college'] ?? '', array_values($collegeProper));
        });
        if ($noCollege) {
            echo "--- Unaffiliated (" . count($noCollege) . ") ---\n\n";
            foreach ($noCollege as $s) {
                echo formatStaff($s) . "\n\n";
            }
        }
    } else {
        $proper = $collegeProper[$college];
        $filtered = array_filter($allRecords, function ($s) use ($proper) {
            return ($s['college'] ?? '') === $proper;
        });
        usort($filtered, function ($a, $b) {
            return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
        });

        echo "=== {$proper} Staff ===\n";
        echo "Total: " . count($filtered) . "\n\n";

        foreach ($filtered as $s) {
            echo formatStaff($s) . "\n\n";
        }

        if (empty($filtered)) {
            echo "(No staff found for {$proper})\n";
        }
    }
}
