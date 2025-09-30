<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true) {
    header('Location: ../index.php');
    exit;
}

$user = $_SESSION['user'] ?? 'Adventurer';
$isGm = strtolower($user) === 'gm';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Virtual Tabletop Placeholder</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #111827;
            color: #f9fafb;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .placeholder-card {
            background: rgba(30, 41, 59, 0.9);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 16px;
            padding: 3rem;
            max-width: 520px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.45);
        }

        .placeholder-card h1 {
            margin-top: 0;
            font-size: 2.25rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .placeholder-card p {
            font-size: 1.05rem;
            line-height: 1.6;
            color: #cbd5f5;
        }

        .placeholder-card .badge {
            display: inline-block;
            margin-bottom: 1.5rem;
            padding: 0.35rem 1rem;
            border-radius: 999px;
            background: rgba(59, 130, 246, 0.2);
            color: #93c5fd;
            font-size: 0.85rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .placeholder-card a {
            color: #38bdf8;
            text-decoration: none;
            font-weight: 600;
        }

        .placeholder-card a:hover,
        .placeholder-card a:focus {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="placeholder-card">
        <div class="badge"><?php echo $isGm ? 'GM Preview' : 'Player Preview'; ?></div>
        <h1>VTT Coming Soon</h1>
        <p>
            This space will soon transform into the fully featured Virtual Tabletop experience
            for your Strixhaven adventures. Stay tuned for maps, tokens, interactive combat, and more!
        </p>
        <p>
            Need to get back? <a href="../dashboard.php" target="_self">Return to the Dashboard</a>.
        </p>
    </div>
</body>
</html>
