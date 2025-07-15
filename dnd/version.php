<?php
// Version tracking system for D&D GM Screen
// This file tracks the current version and provides functions to increment it

class Version {
    private static $version_file = __DIR__ . '/data/version.json';
    private static $default_version = '1.0.0';
    
    public static function get() {
        if (!file_exists(self::$version_file)) {
            self::init();
        }
        
        $version_data = json_decode(file_get_contents(self::$version_file), true);
        return $version_data['version'] ?? self::$default_version;
    }
    
    public static function increment($type = 'patch') {
        $current = self::get();
        $parts = explode('.', $current);
        
        $major = intval($parts[0] ?? 1);
        $minor = intval($parts[1] ?? 0);
        $patch = intval($parts[2] ?? 0);
        
        switch ($type) {
            case 'major':
                $major++;
                $minor = 0;
                $patch = 0;
                break;
            case 'minor':
                $minor++;
                $patch = 0;
                break;
            case 'patch':
            default:
                $patch++;
                break;
        }
        
        $new_version = "$major.$minor.$patch";
        
        $version_data = [
            'version' => $new_version,
            'last_updated' => date('Y-m-d H:i:s'),
            'build_number' => (self::getBuildNumber() + 1)
        ];
        
        // Ensure data directory exists
        $data_dir = dirname(self::$version_file);
        if (!is_dir($data_dir)) {
            mkdir($data_dir, 0755, true);
        }
        
        file_put_contents(self::$version_file, json_encode($version_data, JSON_PRETTY_PRINT));
        
        return $new_version;
    }
    
    public static function getBuildNumber() {
        if (!file_exists(self::$version_file)) {
            return 1;
        }
        
        $version_data = json_decode(file_get_contents(self::$version_file), true);
        return $version_data['build_number'] ?? 1;
    }
    
    public static function getLastUpdated() {
        if (!file_exists(self::$version_file)) {
            return date('Y-m-d H:i:s');
        }
        
        $version_data = json_decode(file_get_contents(self::$version_file), true);
        return $version_data['last_updated'] ?? date('Y-m-d H:i:s');
    }
    
    private static function init() {
        $version_data = [
            'version' => self::$default_version,
            'last_updated' => date('Y-m-d H:i:s'),
            'build_number' => 1
        ];
        
        // Ensure data directory exists
        $data_dir = dirname(self::$version_file);
        if (!is_dir($data_dir)) {
            mkdir($data_dir, 0755, true);
        }
        
        file_put_contents(self::$version_file, json_encode($version_data, JSON_PRETTY_PRINT));
    }
    
    public static function displayVersion() {
        $version = self::get();
        $build = self::getBuildNumber();
        return "v$version (Build $build)";
    }
}

// Auto-increment version on any edit (if not being called from version system itself)
if (!defined('VERSION_SYSTEM_INTERNAL')) {
    $backtrace = debug_backtrace();
    if (count($backtrace) > 1) {
        // Only increment if this isn't being called from version system functions
        $caller = $backtrace[1]['file'] ?? '';
        if (strpos($caller, 'version.php') === false) {
            Version::increment('patch');
        }
    }
}

?>