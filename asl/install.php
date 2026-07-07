<?php
/**
 * One-time installer / re-seeder. Safe to run repeatedly (additive only).
 * Access: any logged-in teacher — or anyone if no teacher account exists yet
 * (bootstrap on a brand-new database).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/seed.php';

$hasTeacher = (bool)$pdo->query("SELECT id FROM users WHERE is_teacher = TRUE LIMIT 1")->fetch();
if ($hasTeacher) {
    $me = aslhub_require_teacher($pdo);
    // Legacy teacher accounts from asl1/asl2 predate the teacher tag — tag Harms now
    // so admin-only pages recognize him after this install.
    if (empty($me['teacher']) && strcasecmp($me['first_name'], 'Brandon') === 0) {
        $pdo->prepare("UPDATE users SET teacher = 'harms' WHERE id = ? AND is_teacher = TRUE")
            ->execute([(int)$me['id']]);
    }
}

$results = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    aslhub_require_csrf(false);
    aslhub_ensure_schema($pdo, true);
    $results[] = 'Schema check complete (version ' . ASLHUB_SCHEMA_VERSION . ').';
    $seedResult = aslhub_seed_content($pdo);
    if ($seedResult['success']) {
        $s = $seedResult['stats'];
        $results[] = "Rubric content seeded: {$s['buckets']} buckets, {$s['standards']} standards, {$s['targets']} level-targets, {$s['rubric_rows']} rubric rows.";
        foreach ($s['deactivated'] as $d) $results[] = "Deactivated (kept, hidden): $d";
    } else {
        $results[] = 'SEED FAILED: ' . $seedResult['error'];
    }
    foreach (aslhub_seed_teachers($pdo) as $msg) $results[] = $msg;
}
$csrf = aslhub_csrf_token();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"><title>ASL Hub - Install</title>
    <link rel="stylesheet" href="css/asl-style.css">
</head>
<body>
    <div class="container" style="max-width:700px;">
        <header><h1>ASL Hub Installer</h1></header>
        <div class="form-section" style="background:rgba(255,255,255,.95);border-radius:15px;padding:30px;">
            <p>Runs the additive schema check, imports/updates the proficiency rubrics from
            <code>data/rubric_seed.json</code>, and makes sure both teacher accounts exist.
            It never deletes student data — safe to re-run any time (for example after
            rubric wording updates).</p>
            <form method="POST" style="margin-top:20px;">
                <input type="hidden" name="csrf_token" value="<?php echo $csrf; ?>">
                <button type="submit" class="form-button">Run Install / Update</button>
            </form>
            <?php if ($results): ?>
                <h3 style="margin-top:25px;">Results</h3>
                <ul style="margin:10px 0 0 20px;">
                    <?php foreach ($results as $r): ?><li><?php echo aslhub_h($r); ?></li><?php endforeach; ?>
                </ul>
                <p style="margin-top:20px;"><a href="teacher/dashboard.php">Go to teacher dashboard &rarr;</a></p>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
