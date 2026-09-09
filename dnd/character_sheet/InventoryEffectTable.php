<?php
declare(strict_types=1);

/** Plain-text progression table validation shared by inventory save paths. */
final class InventoryEffectTable
{
    public static function normalize($table): ?array
    {
        if ($table === null) return null;
        if (!is_array($table) || !isset($table['headers'], $table['rows'])
            || !is_array($table['headers']) || !array_is_list($table['headers'])
            || !is_array($table['rows']) || !array_is_list($table['rows'])) {
            throw new InvalidArgumentException('A table needs headers and rows.');
        }
        $columns = count($table['headers']);
        $rowCount = count($table['rows']);
        if ($columns < 2 || $columns > 32 || $rowCount < 1 || $rowCount > 200) {
            throw new InvalidArgumentException('Use 2 to 32 columns and 1 to 200 rows.');
        }
        $length = 0;
        $copyRow = static function ($row) use ($columns, &$length): array {
            if (!is_array($row) || !array_is_list($row) || count($row) !== $columns) {
                throw new InvalidArgumentException('Every table row must have the same number of cells.');
            }
            foreach ($row as $cell) {
                if (!is_string($cell) || strlen($cell) > 32000) throw new InvalidArgumentException('Table cells must contain text.');
                // Match JavaScript string length, including surrogate pairs.
                $characters = preg_match_all('/./us', $cell);
                $pairs = preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $cell);
                if ($characters === false || $pairs === false || $characters + $pairs > 8000) {
                    throw new InvalidArgumentException('Table cells may contain at most 8000 characters.');
                }
                $length += $characters + $pairs;
                if ($length > 200000) throw new InvalidArgumentException('The table is too large.');
            }
            return $row;
        };
        $headers = $copyRow($table['headers']);
        $rows = array_map($copyRow, $table['rows']);
        $selected = $table['selectedRow'] ?? 0;
        if ((!is_int($selected) && !is_float($selected)) || !is_finite((float) $selected)
            || floor($selected) !== (float) $selected || $selected < 0 || $selected >= $rowCount) {
            throw new InvalidArgumentException('Select a row that exists in the table.');
        }
        return ['headers' => $headers, 'rows' => $rows, 'selectedRow' => (int) $selected];
    }
}
