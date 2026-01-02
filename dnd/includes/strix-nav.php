<?php
/**
 * Tiny navigation bar for Strixhaven pages
 * Include this file and call renderStrixNav($currentPage) where $currentPage is one of:
 * 'dashboard', 'map', 'students', 'staff', 'schedule', 'vtt', 'charactersheet'
 */

function renderStrixNav($currentPage = '') {
    // Ensure session is started
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    $user = isset($_SESSION['user']) ? $_SESSION['user'] : '';
    $isGM = ($user === 'GM');

    $navItems = [
        'dashboard' => ['label' => 'Dashboard', 'url' => '/dnd/dashboard.php'],
        'map' => ['label' => 'Map', 'url' => '/dnd/strixhaven/map/index.php'],
        'students' => ['label' => 'Students', 'url' => '/dnd/strixhaven/students/index.php'],
        'staff' => ['label' => 'Staff', 'url' => '/dnd/strixhaven/staff/index.php'],
        'schedule' => ['label' => 'Schedule', 'url' => '/dnd/schedule/index.php'],
        'vtt' => ['label' => 'VTT', 'url' => '/dnd/vtt/index.php'],
    ];

    // Only add Sheet link for non-GM users
    if (!$isGM && !empty($user)) {
        $navItems['charactersheet'] = [
            'label' => 'Sheet',
            'url' => '/dnd/character_sheet/index.php?character=' . urlencode(strtolower($user))
        ];
    }

    $currentPage = strtolower($currentPage);
    ?>
    <style>
        .strix-mini-nav {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 18px;
            background: rgba(26, 26, 46, 0.95);
            border-bottom: 1px solid rgba(102, 126, 234, 0.3);
            z-index: 99999;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 2px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 0 4px;
        }
        .strix-mini-nav a {
            color: #aab;
            text-decoration: none;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 2px;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .strix-mini-nav a:hover {
            color: #fff;
            background: rgba(102, 126, 234, 0.3);
        }
        .strix-mini-nav a.active {
            color: #667eea;
            font-weight: 600;
            cursor: default;
            pointer-events: none;
        }
        .strix-mini-nav-spacer {
            height: 18px;
            flex-shrink: 0;
        }
    </style>
    <nav class="strix-mini-nav">
        <?php foreach ($navItems as $key => $item): ?>
            <?php if ($key !== $currentPage): ?>
                <a href="<?php echo htmlspecialchars($item['url']); ?>"><?php echo htmlspecialchars($item['label']); ?></a>
            <?php else: ?>
                <a class="active"><?php echo htmlspecialchars($item['label']); ?></a>
            <?php endif; ?>
        <?php endforeach; ?>
    </nav>
    <div class="strix-mini-nav-spacer"></div>
    <?php
}
?>
