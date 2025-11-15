<?php

function bingo_custom_lists_path(): string
{
    $path = __DIR__ . '/../custom_lists.json';
    if (!file_exists($path)) {
        file_put_contents($path, json_encode([], JSON_PRETTY_PRINT));
    }
    return $path;
}

function bingo_load_custom_lists(): array
{
    $path = bingo_custom_lists_path();
    $raw = file_get_contents($path);
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }
    return $decoded;
}

function bingo_save_custom_lists(array $lists): void
{
    $path = bingo_custom_lists_path();
    file_put_contents($path, json_encode(array_values($lists), JSON_PRETTY_PRINT), LOCK_EX);
}

function bingo_filter_words($words): array
{
    if (is_string($words)) {
        $words = preg_split('/[\r\n,]+/', $words);
    }
    if (!is_array($words)) {
        return [];
    }
    $clean = [];
    foreach ($words as $word) {
        if (!is_string($word)) {
            continue;
        }
        $trimmed = trim($word);
        if ($trimmed !== '') {
            $clean[] = $trimmed;
        }
    }
    return array_values(array_unique($clean));
}

function bingo_add_custom_list(int $teacherId, string $name, $words): array
{
    $lists = bingo_load_custom_lists();
    $filteredWords = bingo_filter_words($words);
    $entry = [
        'id' => 'custom-' . bin2hex(random_bytes(4)),
        'teacher_id' => $teacherId,
        'name' => $name,
        'words' => $filteredWords,
        'created_at' => date('c'),
    ];
    $lists[] = $entry;
    bingo_save_custom_lists($lists);
    return $entry;
}

function bingo_find_custom_list(string $id, ?int $teacherId = null): ?array
{
    $lists = bingo_load_custom_lists();
    foreach ($lists as $entry) {
        if (($entry['id'] ?? '') === $id) {
            if ($teacherId === null || (int) ($entry['teacher_id'] ?? 0) === $teacherId) {
                return $entry;
            }
        }
    }
    return null;
}

function bingo_replace_custom_list(array $entry): void
{
    $lists = bingo_load_custom_lists();
    $updated = [];
    $found = false;
    foreach ($lists as $item) {
        if (($item['id'] ?? '') === ($entry['id'] ?? '')) {
            $updated[] = $entry;
            $found = true;
        } else {
            $updated[] = $item;
        }
    }
    if (!$found) {
        $updated[] = $entry;
    }
    bingo_save_custom_lists($updated);
}
