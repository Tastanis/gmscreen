<?php
/** Shared teacher-page chrome + roster query. */

function aslhub_scoped_students(PDO $pdo, array $teacher, array $filters = []): array {
    $where = ["is_teacher = FALSE"];
    $params = [];

    if (aslhub_is_admin($teacher)) {
        if (!empty($filters['teacher']) && $filters['teacher'] !== 'all') {
            $where[] = "teacher = ?";
            $params[] = $filters['teacher'];
        }
    } else {
        $where[] = "teacher = ?";
        $params[] = $teacher['teacher'];
    }
    if (!empty($filters['period']) && $filters['period'] !== 'all') {
        $where[] = "class_period = ?";
        $params[] = (int)$filters['period'];
    }
    if (!empty($filters['level']) && $filters['level'] !== 'all') {
        $where[] = "level = ?";
        $params[] = (int)$filters['level'];
    }
    if (empty($filters['include_inactive'])) {
        $where[] = "is_active = 1";
    }
    $sql = "SELECT * FROM users WHERE " . implode(' AND ', $where) . " ORDER BY last_name, first_name";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function aslhub_teacher_header(array $me, string $title, string $active = ''): void {
    $base = aslhub_base_url();
    $isAdmin = aslhub_is_admin($me);
    $nav = [
        'dashboard' => ['dashboard.php', 'Roster'],
        'grading' => ['grading.php', 'Grading'],
        'weekly' => ['weekly.php', 'Weekly Log'],
        'resources' => ['resources.php', 'Resources'],
        'settings' => ['settings.php', 'Settings'],
    ];
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ASL Hub - <?php echo aslhub_h($title); ?></title>
    <link rel="stylesheet" href="<?php echo $base; ?>/css/asl-style.css">
    <link rel="stylesheet" href="<?php echo $base; ?>/css/hub.css">
    <script src="<?php echo $base; ?>/js/vendor/chart.umd.js"></script>
    <style>
        .teacher-nav { display:flex; gap:8px; flex-wrap:wrap; }
        .teacher-nav a {
            padding:8px 16px; border-radius:20px; text-decoration:none; font-weight:600;
            background:#edf2f7; color:#4a5568; font-size:.9rem; border:1px solid #e2e8f0;
        }
        .teacher-nav a:hover { background:#e2e8f0; }
        .teacher-nav a.active { background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#fff; border-color:transparent; }
        .filters-bar { display:flex; gap:10px; flex-wrap:wrap; align-items:center;
            background:rgba(255,255,255,.95); border-radius:12px; padding:12px 16px; margin-bottom:16px; }
        .filters-bar select, .filters-bar input[type=text], .filters-bar input[type=date] {
            padding:7px 10px; border:1px solid #cbd5e0; border-radius:8px; font-size:.9rem; }
    </style>
</head>
<body>
<div class="container">
    <header>
        <div>
            <h1 style="font-size:1.7rem;"><?php echo aslhub_h($title); ?></h1>
            <span class="pill"><?php echo $isAdmin ? 'Admin · Mr. Harms' : aslhub_h(aslhub_valid_teachers()[$me['teacher']] ?? 'Teacher'); ?></span>
        </div>
        <nav class="teacher-nav">
            <?php foreach ($nav as $key => [$href, $label]): ?>
                <a href="<?php echo $base; ?>/teacher/<?php echo $href; ?>" class="<?php echo $key === $active ? 'active' : ''; ?>"><?php echo $label; ?></a>
            <?php endforeach; ?>
            <a href="<?php echo $base; ?>/logout.php">Logout</a>
        </nav>
    </header>
<?php
}

function aslhub_teacher_footer(): void {
    echo "</div></body></html>";
}
