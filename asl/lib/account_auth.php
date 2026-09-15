<?php
/** Server-only account claiming. Never include the claiming credential in responses. */
function aslhub_claim_password(): string {
    $password = defined('ASLHUB_CLAIM_PASSWORD') ? ASLHUB_CLAIM_PASSWORD : getenv('ASLHUB_CLAIM_PASSWORD');
    if (!is_string($password) || $password === '') throw new RuntimeException('Private claiming credential is not configured.');
    return $password;
}

function aslhub_authenticate(PDO $pdo, string $first, string $last, string $password): ?array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE first_name = ? AND last_name = ? AND is_active = 1');
    $stmt->execute([$first, $last]);
    $matches = [];
    foreach ($stmt->fetchAll() as $user) {
        if (!empty($user['is_unclaimed'])) {
            if (empty($user['is_teacher']) && hash_equals(aslhub_claim_password(), $password)) $matches[] = $user;
        } elseif (password_verify($password, $user['password'])) {
            $matches[] = $user;
        }
    }
    // Never silently choose between ambiguous identities.
    return count($matches) === 1 ? $matches[0] : null;
}

function aslhub_personal_password_error(string $password, string $confirmation): ?string {
    if ($password === '' || $confirmation === '') return 'Enter both passwords.';
    if ($password !== $confirmation) return 'Passwords do not match.';
    if (hash_equals(aslhub_claim_password(), $password)) return 'Choose a different password.';
    if (strlen($password) > 72 || str_contains($password, "\0")) return 'Choose a password of 72 bytes or fewer without null characters.';
    return null;
}

function aslhub_save_claim_password(PDO $pdo, int $id, string $password): bool {
    $stmt = $pdo->prepare('UPDATE users SET password = ?, is_unclaimed = 0, must_change_password = 0 WHERE id = ? AND is_unclaimed = 1 AND is_teacher = 0 AND is_active = 1');
    $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
    return $stmt->rowCount() === 1;
}
