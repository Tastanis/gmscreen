<?php
declare(strict_types=1);
require_once __DIR__ . '/ScenePackage.php';
require_once __DIR__ . '/FloorGeometry.php';

final class SceneImportValidation
{
    public static function validate(array $package): void
    {
        ScenePackage::preview($package);
        self::scan($package);
        if (!is_string($package['scene']['mapUrl'] ?? null) || trim($package['scene']['mapUrl']) === '') throw new InvalidArgumentException('The imported scene needs a base map image.');
        $domains = $package['domains'];
        foreach ($domains['placements'] as $entry) {
            self::point($entry, 'column', 'row');
            foreach (['width','height'] as $key) if (isset($entry[$key])) self::number($entry[$key], $key, 0.01);
            foreach (['hidden','primaryPc'] as $key) if (isset($entry[$key]) && !is_bool($entry[$key])) throw new InvalidArgumentException($key . ' must be boolean.');
            if (isset($entry['conditions']) && !is_array($entry['conditions'])) throw new InvalidArgumentException('Token conditions must be a list.');
        }
        foreach ($domains['drawings'] as $entry) {
            if (!is_array($entry['points'] ?? null) || !array_is_list($entry['points']) || count($entry['points']) < 2 || count($entry['points']) > 50000) throw new InvalidArgumentException('Drawings need 2 to 50,000 points.');
            foreach ($entry['points'] as $point) self::point($point, 'x', 'y');
            if (isset($entry['strokeWidth'])) self::number($entry['strokeWidth'], 'Drawing width', 1, 50);
        }
        foreach ($domains['templates'] as $entry) {
            switch ($entry['type'] ?? '') {
                case 'circle': self::point($entry['center'] ?? null); self::number($entry['radius'] ?? null, 'Template radius', 0.5); break;
                case 'rectangle': self::point($entry['start'] ?? null); self::number($entry['length'] ?? null, 'Template length', 1); self::number($entry['width'] ?? null, 'Template width', 1); break;
                case 'wall':
                    if (!is_array($entry['squares'] ?? null) || !array_is_list($entry['squares']) || count($entry['squares']) > 50000) throw new InvalidArgumentException('Invalid wall template squares.');
                    foreach ($entry['squares'] as $point) self::point($point);
                    break;
                default: throw new InvalidArgumentException('Unsupported template type.');
            }
        }
        $config = $domains['sceneConfig'];
        $levels = $config['mapLevels'] ?? [];
        FloorGeometry::validateElevations($levels);
        if (!array_is_list($levels['levels'] ?? [])) throw new InvalidArgumentException('Floors must be a list.');
        foreach ([['stairs'=>$levels['baseStairs'] ?? []], ...($levels['levels'] ?? [])] as $floor) {
            foreach (['stairs','cutouts'] as $key) if (!is_array($floor[$key] ?? []) || !array_is_list($floor[$key] ?? []) || count($floor[$key] ?? []) > 5000) throw new InvalidArgumentException('Invalid floor geometry list.');
            if (isset($floor['hidden']) && !is_bool($floor['hidden'])) throw new InvalidArgumentException('Floor visibility must be boolean.');
            foreach ($floor['cutouts'] ?? [] as $cutout) {
                self::point($cutout); self::number($cutout['width'] ?? null, 'Cutout width', 0.0001); self::number($cutout['height'] ?? null, 'Cutout height', 0.0001);
            }
            foreach ($floor['stairs'] ?? [] as $stair) {
                if (!is_array($stair['corners'] ?? null) || !array_is_list($stair['corners']) || count($stair['corners']) !== 4) throw new InvalidArgumentException('Stairs need four corners.');
                foreach ($stair['corners'] as $point) self::point($point);
                if (!is_array($stair['edgeColors'] ?? [])) throw new InvalidArgumentException('Invalid stair edge colors.');
                foreach ($stair['edgeColors'] ?? [] as $segment=>$color) if (!is_string($segment) || !preg_match('/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/', $segment) || !in_array($color,['red','green'],true)) throw new InvalidArgumentException('Invalid stair edge segment or color.');
            }
        }
        foreach ([$package['scene']['grid'] ?? [], $config['grid'] ?? [], ...array_column($levels['levels'] ?? [], 'grid')] as $grid) {
            if ($grid === null) continue;
            if (!is_array($grid)) throw new InvalidArgumentException('Invalid grid configuration.');
            if (isset($grid['size'])) self::number($grid['size'], 'Grid size', 1);
        }
    }

    private static function number($value, string $label, float $min = -1000000, float $max = 1000000): void
    {
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < $min || $value > $max) throw new InvalidArgumentException($label . ' is outside the supported numeric range.');
    }

    private static function point($value, string $x = 'column', string $y = 'row'): void
    {
        if (!is_array($value)) throw new InvalidArgumentException('Invalid geometry point.');
        self::number($value[$x] ?? null, $x); self::number($value[$y] ?? null, $y);
    }

    private static function scan(array $value): void
    {
        foreach ($value as $key=>$item) {
            if (in_array($key, ['__proto__','prototype','constructor'],true)) throw new InvalidArgumentException('Unsupported object property in scene file.');
            if (is_array($item)) { self::scan($item); continue; }
            if (in_array($key, ['mapUrl','imageUrl','thumbnailUrl','image','backgroundUrl','assetUrl'],true) && is_string($item) && $item !== '') {
                // Never fetch assets while importing. Disallow active schemes and
                // backslash URLs, including those omitted by export's asset list.
                if (preg_match('/[\x00-\x20\\\\]/', $item) || str_starts_with($item,'//') || (!str_starts_with($item,'/') && !preg_match('~^https?://[^/]+(?:/|$)~i',$item))) throw new InvalidArgumentException('Imported images must use HTTP(S) or a site-relative path; embedded images are not supported.');
            }
        }
    }
}
