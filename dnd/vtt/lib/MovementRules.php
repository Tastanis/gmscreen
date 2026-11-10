<?php
declare(strict_types=1);

/**
 * The movement rules table (assets/js/ui/movement-rules.mjs), read from the same file the browser loads, so
 * the two never disagree. The table sits between the marks / *rules* / and / *end* / as plain JSON.
 */
final class MovementRules
{
    private static ?array $rules = null;

    public static function all(): array
    {
        if (self::$rules !== null) return self::$rules;
        $source = (string) @file_get_contents(__DIR__ . '/../assets/js/ui/movement-rules.mjs');
        $start = strpos($source, '/*rules*/'); $end = strpos($source, '/*end*/');
        $rules = $start !== false && $end !== false ? json_decode(substr($source, $start + 9, $end - $start - 9), true) : null;
        if (!is_array($rules)) throw new RuntimeException('The movement rules table could not be read.');
        return self::$rules = $rules;
    }

    public static function get(string $name): float
    {
        return (float) (self::all()[$name] ?? throw new RuntimeException('No movement rule ' . $name . '.'));
    }

    public static function cost(string $name): float
    {
        return (float) (self::all()['cost'][$name] ?? 0);
    }
}
