<?php
require_once __DIR__ . '/auth.php';
buisness_require_login();

$projects = [
    ['id' => 'app-automation', 'name' => 'APP Automation', 'tag' => 'Active',   'mark' => '01', 'state' => 'active',
     'desc' => 'Operational protocols, runbooks & checklists.', 'href' => 'app-automation.php'],
    ['id' => 'p2', 'name' => 'Coming Soon', 'tag' => 'Reserved', 'mark' => '02', 'state' => 'coming'],
    ['id' => 'p3', 'name' => 'Coming Soon', 'tag' => 'Reserved', 'mark' => '03', 'state' => 'coming'],
    ['id' => 'p4', 'name' => 'Coming Soon', 'tag' => 'Reserved', 'mark' => '04', 'state' => 'coming'],
    ['id' => 'p5', 'name' => 'Coming Soon', 'tag' => 'Reserved', 'mark' => '05', 'state' => 'coming'],
];

$activeCount = count(array_filter($projects, fn($p) => $p['state'] === 'active'));
$comingCount = count(array_filter($projects, fn($p) => $p['state'] === 'coming'));
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Projects - Business</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/business.css">
</head>
<body class="no-chrome">

<div class="page">
  <div class="topBar">
    <div class="brand"><span class="brandMark">B</span> Business</div>
    <a class="pillBtn ghost" href="logout.php">Sign out</a>
  </div>

  <div class="projWrap">
    <div class="projHead">
      <div>
        <h1 class="projTitle">Projects.</h1>
        <p class="projHint">Open an active project, or claim a slot to start a new business.</p>
      </div>
      <div class="projCount"><?php echo $activeCount; ?> active &middot; <?php echo $comingCount; ?> reserved</div>
    </div>

    <div class="tileGrid">
      <?php foreach ($projects as $p):
        $cls = 'tile';
        if ($p['state'] === 'active') $cls .= ' active';
        if ($p['state'] === 'coming') $cls .= ' coming';
        $tag = 'div';
        $hrefAttr = '';
        if ($p['state'] === 'active' && !empty($p['href'])) {
            $tag = 'a';
            $hrefAttr = ' href="' . htmlspecialchars($p['href']) . '"';
        }
      ?>
        <<?php echo $tag; ?> class="<?php echo $cls; ?>"<?php echo $hrefAttr; ?>>
          <div class="tileTop">
            <div class="tileMark"><?php echo htmlspecialchars($p['mark']); ?></div>
            <div class="tileTag"><?php echo htmlspecialchars($p['tag']); ?></div>
          </div>
          <div>
            <h3 class="tileName"><?php echo htmlspecialchars($p['name']); ?></h3>
            <div class="tileFoot">
              <?php if ($p['state'] === 'active'): ?>
                Open project <span class="tileArrow">&rarr;</span>
              <?php else: ?>
                Tap to claim slot
              <?php endif; ?>
            </div>
          </div>
        </<?php echo $tag; ?>>
      <?php endforeach; ?>
    </div>
  </div>
</div>

</body>
</html>
