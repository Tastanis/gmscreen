<?php
require_once 'config.php';

try {
    // Clear existing data
    $pdo->exec("DELETE FROM resources");
    $pdo->exec("DELETE FROM user_skills");
    $pdo->exec("DELETE FROM skills");
    
    // Insert sample skills
    $skills = [
        [
            'name' => 'Skill Test 1',
            'description' => 'This is the first skill test for ASL students. Practice basic ASL fundamentals.',
            'resources' => [
                'ASL Alphabet Practice',
                'Basic Greeting Signs',
                'Number Signs 1-10'
            ]
        ],
        [
            'name' => 'Skill Test 2', 
            'description' => 'This is the second skill test for ASL students. Intermediate conversation skills.',
            'resources' => [
                'Common Conversation Phrases',
                'Family Member Signs'
            ]
        ]
    ];
    
    $skill_insert = $pdo->prepare("
        INSERT INTO skills (skill_name, skill_description, points_not_started, points_progressing, points_proficient, order_index) 
        VALUES (?, ?, 0, 1, 3, ?)
    ");
    
    $resource_insert = $pdo->prepare("
        INSERT INTO resources (skill_id, resource_name, resource_url, order_index) 
        VALUES (?, ?, ?, ?)
    ");
    
    foreach ($skills as $index => $skill) {
        // Insert skill
        $skill_insert->execute([
            $skill['name'],
            $skill['description'],
            $index + 1
        ]);
        
        $skill_id = $pdo->lastInsertId();
        
        // Insert resources for this skill
        foreach ($skill['resources'] as $resource_index => $resource_name) {
            $resource_insert->execute([
                $skill_id,
                $resource_name,
                '#', // Placeholder URL
                $resource_index + 1
            ]);
        }
    }
    
    echo "Sample data populated successfully!\n";
    echo "Created " . count($skills) . " skills with resources.\n";
    
} catch(PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>