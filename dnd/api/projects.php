<?php
/**
 * Character Projects Export API
 *
 * Exports all player character project data as plain text.
 *
 * Endpoints:
 *   /dnd/api/projects.php                        - Directory listing + all projects summary
 *   /dnd/api/projects.php?character=frunk         - Projects for a specific character
 *   /dnd/api/projects.php?character=all           - All characters' projects
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

// Load character data
$dataFile = __DIR__ . '/../data/characters.json';
if (!file_exists($dataFile)) {
    http_response_code(404);
    echo "Error: Character data file not found\n";
    exit;
}

$content = file_get_contents($dataFile);
$allData = json_decode($content, true);
if (!is_array($allData)) {
    http_response_code(500);
    echo "Error: Failed to parse character data\n";
    exit;
}

$character = isset($_GET['character']) ? strtolower(trim($_GET['character'])) : '';
$validCharacters = array_keys($allData);

// --- Format a single project as plain text ---
function formatProject($project, $index) {
    $lines = [];
    $name = $project['project_name'] ?? 'Unnamed Project';
    $lines[] = "  Project #" . ($index + 1) . ": " . $name;
    if (!empty($project['source']))        $lines[] = "    Source: " . $project['source'];
    $earned = $project['points_earned'] ?? '0';
    $total = $project['total_points'] ?? '?';
    $lines[] = "    Progress: " . $earned . " / " . $total . " points";
    if (!empty($project['extra']))         $lines[] = "    Notes: " . $project['extra'];
    if (!empty($project['points_history']) && is_array($project['points_history'])) {
        $lines[] = "    Points History: " . implode(', ', $project['points_history']);
    }
    return implode("\n", $lines);
}

// --- Format all projects for a character ---
function formatCharacterProjects($characterId, $characterData) {
    $lines = [];
    $charName = $characterData['character']['character_name'] ?? ucfirst($characterId);
    $playerName = $characterData['character']['player_name'] ?? '';

    $header = $charName;
    if (!empty($playerName)) {
        $header .= " (Player: " . $playerName . ")";
    }
    $lines[] = $header;

    if (!empty($characterData['character']['college'])) {
        $lines[] = "College: " . $characterData['character']['college'];
    }

    $projects = $characterData['projects'] ?? [];
    if (empty($projects)) {
        $lines[] = "  (No projects)";
    } else {
        $lines[] = "  Total Projects: " . count($projects);
        foreach ($projects as $i => $project) {
            $lines[] = "";
            $lines[] = formatProject($project, $i);
        }
    }

    return implode("\n", $lines);
}

// --- Directory listing (no params) ---
if ($character === '') {
    echo "=== Character Projects Export ===\n\n";
    echo "Available endpoints:\n\n";
    foreach ($validCharacters as $c) {
        $charName = $allData[$c]['character']['character_name'] ?? ucfirst($c);
        $projectCount = count($allData[$c]['projects'] ?? []);
        echo "  ?character={$c}  - {$charName} ({$projectCount} projects)\n";
    }
    echo "\n  ?character=all   - All characters' projects\n";
    echo "\n\n";

    // Also show a full summary
    echo "=== Quick Summary ===\n\n";
    foreach ($validCharacters as $c) {
        $charData = $allData[$c];
        $charName = $charData['character']['character_name'] ?? ucfirst($c);
        $projects = $charData['projects'] ?? [];
        echo "{$charName}: " . count($projects) . " project(s)\n";
        foreach ($projects as $i => $project) {
            $name = $project['project_name'] ?? 'Unnamed';
            $earned = $project['points_earned'] ?? '0';
            $total = $project['total_points'] ?? '?';
            echo "  - {$name} ({$earned}/{$total} points)\n";
        }
    }
    exit;
}

// --- Single character ---
if ($character !== 'all') {
    if (!isset($allData[$character])) {
        http_response_code(404);
        echo "Error: Character '{$character}' not found.\n";
        echo "Valid characters: " . implode(', ', $validCharacters) . "\n";
        exit;
    }

    echo "=== Projects for " . ($allData[$character]['character']['character_name'] ?? ucfirst($character)) . " ===\n\n";
    echo formatCharacterProjects($character, $allData[$character]) . "\n";
    exit;
}

// --- All characters ---
echo "=== All Character Projects ===\n";
echo "Total Characters: " . count($validCharacters) . "\n\n";

foreach ($validCharacters as $c) {
    echo "--- " . ucfirst($c) . " ---\n\n";
    echo formatCharacterProjects($c, $allData[$c]) . "\n\n";
}
