<?php
/**
 * ASL Hub shared helpers: auth, CSRF, scoping, settings, data-safety guards.
 */

// ---------- Responses ----------

function aslhub_json(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function aslhub_json_error(string $message, int $status = 400): void {
    aslhub_json(['success' => false, 'error' => $message], $status);
}

// ---------- Auth ----------

function aslhub_current_user(PDO $pdo): ?array {
    static $user = null;
    static $loaded = false;
    if ($loaded) return $user;
    $loaded = true;
    if (empty($_SESSION['user_id'])) return null;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([(int)$_SESSION['user_id']]);
    $user = $stmt->fetch() ?: null;
    if ($user && isset($user['is_active']) && !(int)$user['is_active']) {
        // Deactivated mid-session: kill the session.
        session_unset();
        session_destroy();
        $user = null;
    }
    return $user;
}

/** Require a logged-in user. Returns the user row. */
function aslhub_require_login(PDO $pdo, bool $json = false): array {
    $user = aslhub_current_user($pdo);
    if (!$user) {
        if ($json) aslhub_json_error('Not logged in.', 401);
        header('Location: ' . aslhub_base_url() . '/index.php');
        exit;
    }
    return $user;
}

/** Require a teacher. Returns the teacher's user row. */
function aslhub_require_teacher(PDO $pdo, bool $json = false): array {
    $user = aslhub_require_login($pdo, $json);
    if (empty($user['is_teacher'])) {
        if ($json) aslhub_json_error('Teacher access required.', 403);
        header('Location: ' . aslhub_base_url() . '/dashboard.php');
        exit;
    }
    return $user;
}

/** Is this teacher the site admin (Harms)? Admin = whole-database tools. */
function aslhub_is_admin(array $teacher): bool {
    return !empty($teacher['is_teacher']) && ($teacher['teacher'] ?? '') === 'harms';
}

/**
 * Require that $teacher may manage $studentId. Admin manages everyone;
 * other teachers manage only students assigned to them.
 * Returns the student row.
 */
function aslhub_require_student_scope(PDO $pdo, array $teacher, int $studentId, bool $json = true): array {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND is_teacher = FALSE");
    $stmt->execute([$studentId]);
    $student = $stmt->fetch();
    if (!$student) {
        if ($json) aslhub_json_error('Student not found.', 404);
        die('Student not found.');
    }
    if (!aslhub_is_admin($teacher) && ($student['teacher'] ?? '') !== ($teacher['teacher'] ?? '')) {
        if ($json) aslhub_json_error('This student is not in your classes.', 403);
        die('This student is not in your classes.');
    }
    return $student;
}

function aslhub_base_url(): string {
    // /asl regardless of how deep the current script is
    $dir = dirname($_SERVER['SCRIPT_NAME']);
    $pos = strpos($dir, '/asl');
    return $pos === false ? $dir : substr($dir, 0, $pos + 4);
}

// ---------- CSRF ----------

function aslhub_csrf_token(): string {
    if (empty($_SESSION['aslhub_csrf'])) {
        $_SESSION['aslhub_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['aslhub_csrf'];
}

/** Validate CSRF on any state-changing request. Accepts POST field or header. */
function aslhub_require_csrf(bool $json = true): void {
    $sent = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['aslhub_csrf']) || !hash_equals($_SESSION['aslhub_csrf'], (string)$sent)) {
        if ($json) aslhub_json_error('Security token expired. Refresh the page and try again.', 419);
        die('Security token expired. Refresh the page and try again.');
    }
}

// ---------- Login rate limiting ----------

function aslhub_login_throttle(PDO $pdo, string $identifier): bool {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $key = $ip . '|' . mb_strtolower(trim($identifier));
    try {
        $pdo->prepare("DELETE FROM asl_login_attempts WHERE attempted_at < (NOW() - INTERVAL 15 MINUTE)")->execute();
        $stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM asl_login_attempts WHERE attempt_key = ? AND attempted_at > (NOW() - INTERVAL 60 SECOND)");
        $stmt->execute([$key]);
        if ((int)$stmt->fetch()['c'] >= 5) return false; // locked out for this minute
        $pdo->prepare("INSERT INTO asl_login_attempts (attempt_key) VALUES (?)")->execute([$key]);
    } catch (PDOException $e) {
        error_log('login throttle: ' . $e->getMessage());
    }
    return true;
}

function aslhub_login_clear(PDO $pdo, string $identifier): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    try {
        $pdo->prepare("DELETE FROM asl_login_attempts WHERE attempt_key = ?")
            ->execute([$ip . '|' . mb_strtolower(trim($identifier))]);
    } catch (PDOException $e) { /* non-fatal */ }
}

// ---------- Settings ----------

function aslhub_setting(PDO $pdo, string $key, ?string $default = null): ?string {
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        try {
            foreach ($pdo->query("SELECT setting_key, setting_value FROM asl_settings") as $row) {
                $cache[$row['setting_key']] = $row['setting_value'];
            }
        } catch (PDOException $e) { /* table may not exist yet */ }
    }
    return array_key_exists($key, $cache) ? $cache[$key] : $default;
}

function aslhub_set_setting(PDO $pdo, string $key, string $value): void {
    $stmt = $pdo->prepare("INSERT INTO asl_settings (setting_key, setting_value) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
    $stmt->execute([$key, $value]);
}

/** Fixed proficiency outcomes for the three calendar-driven pace lines. */
function aslhub_pace_goals(): array {
    return [
        'pace_green_goal' => 3.0,  // all 3s
        'pace_red_goal' => 2.75,   // 25% 2s + 75% 3s
        'pace_blue_goal' => 3.25,  // 25% 4s + 75% 3s
    ];
}

/** Dashboard/settings values. Calendar dates come only from the uploaded calendar. */
function aslhub_dashboard_settings(PDO $pdo): array {
    return aslhub_pace_goals() + [
        'participation_max' => max(1, (int)aslhub_setting($pdo, 'participation_max', '10')),
        'school_timezone' => aslhub_setting($pdo, 'school_timezone', 'America/Los_Angeles'),
        'calendar_revision' => (int)aslhub_setting($pdo, 'calendar_revision', '0'),
        'signup_code' => aslhub_setting($pdo, 'signup_code', 'MGHS'),
    ];
}

// ---------- Data-safety guards ----------

/**
 * Blank-overwrite guard: refuses to replace non-empty data with empty data
 * unless the request explicitly confirms it (confirm_blank=1).
 * Returns true when the write may proceed.
 */
function aslhub_blank_guard($newValue, $oldValue): bool {
    $newEmpty = ($newValue === null || trim((string)$newValue) === '');
    $oldHasData = !($oldValue === null || trim((string)$oldValue) === '');
    if ($newEmpty && $oldHasData) {
        return !empty($_POST['confirm_blank']) || !empty($_GET['confirm_blank']);
    }
    return true;
}

// ---------- Misc ----------

function aslhub_valid_teachers(): array {
    return ['harms' => 'Mr. Harms', 'parks' => 'Ms. Parks'];
}

function aslhub_score_colors(): array {
    return [0 => '#e05252', 1 => '#e05252', 2 => '#e8b93e', 3 => '#4caf6d', 4 => '#4a90d9'];
}

function aslhub_h(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}
