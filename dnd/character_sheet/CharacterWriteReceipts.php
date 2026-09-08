<?php
declare(strict_types=1);

/** Receipts live in the same atomic JSON replacement as their character mutation. */
final class CharacterWriteReceipts
{
    public static function operationId($value): ?string
    {
        if ($value === null) return null; // Existing callers remain compatible.
        if (!is_string($value) || preg_match('/^[A-Za-z0-9._:-]{8,128}$/D', $value) !== 1) {
            throw new InvalidArgumentException('Invalid character operation ID.');
        }
        return $value;
    }

    private static function fingerprint(string $actor, string $character, string $action, array $input): string
    {
        ksort($input);
        return hash('sha256', json_encode([$actor, $character, $action, $input], JSON_THROW_ON_ERROR));
    }

    public static function lookup(array $data, ?string $id, string $actor, string $character, string $action, array $input): ?array
    {
        if ($id === null) return null;
        if (isset($data['_vttOperations']) && !is_array($data['_vttOperations'])) throw new RuntimeException('Character operation records are invalid.');
        $entry = $data['_vttOperations'][$id] ?? null;
        if ($entry === null) return null;
        if (($entry['fingerprint'] ?? '') !== self::fingerprint($actor, $character, $action, $input)) {
            throw new InvalidArgumentException('Character operation ID was already used for a different request.');
        }
        return [...$entry['response'], 'replayed'=>true];
    }

    public static function record(array &$data, ?string $id, string $actor, string $character, string $action, array $input, array $response): array
    {
        if ($id === null) return $response;
        $response = [...$response, 'operationId'=>$id, 'replayed'=>false];
        $data['_vttOperations'][$id] = ['fingerprint'=>self::fingerprint($actor, $character, $action, $input),
            'actor'=>$actor, 'character'=>$character, 'action'=>$action, 'createdAt'=>time(), 'response'=>$response];
        return $response;
    }
}
