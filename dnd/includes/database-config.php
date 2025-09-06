<?php
/**
 * Database Configuration for Strixhaven Map System
 * Handles database connections and basic configuration
 */

class DatabaseConfig {
    private static $host = 'localhost';
    private static $database = 'dnd_gmscreen';
    private static $username = 'dnd_user';
    private static $password = 'secure_password_here';
    private static $pdo = null;
    
    /**
     * Get database connection (singleton pattern)
     * @return PDO Database connection
     * @throws Exception if connection fails
     */
    public static function getConnection() {
        if (self::$pdo === null) {
            try {
                $dsn = "mysql:host=" . self::$host . ";dbname=" . self::$database . ";charset=utf8mb4";
                $options = [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_PERSISTENT => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'"
                ];
                
                self::$pdo = new PDO($dsn, self::$username, self::$password, $options);
            } catch (PDOException $e) {
                error_log("Database connection failed: " . $e->getMessage());
                
                // For now, fall back to JSON file storage if database unavailable
                // This allows the system to work without database setup initially
                throw new Exception("Database connection failed. Please ensure database is configured.");
            }
        }
        
        return self::$pdo;
    }
    
    /**
     * Test database connection
     * @return bool True if connection successful
     */
    public static function testConnection() {
        try {
            $pdo = self::getConnection();
            $stmt = $pdo->query("SELECT 1");
            return $stmt !== false;
        } catch (Exception $e) {
            return false;
        }
    }
    
    /**
     * Check if required tables exist
     * @return array Missing table names
     */
    public static function checkTables() {
        try {
            $pdo = self::getConnection();
            
            $requiredTables = [
                'hex_data',
                'hex_change_log',
                'hex_edit_locks',
                'hex_pending_changes',
                'user_sessions'
            ];
            
            $missingTables = [];
            
            foreach ($requiredTables as $table) {
                $stmt = $pdo->prepare("SHOW TABLES LIKE ?");
                $stmt->execute([$table]);
                
                if ($stmt->rowCount() === 0) {
                    $missingTables[] = $table;
                }
            }
            
            return $missingTables;
        } catch (Exception $e) {
            error_log("Table check failed: " . $e->getMessage());
            return ['error' => $e->getMessage()];
        }
    }
    
    /**
     * Create database tables
     * @return bool True if successful
     */
    public static function createTables() {
        try {
            $pdo = self::getConnection();
            
            // Create hex_data table
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS hex_data (
                    hex_id VARCHAR(20) PRIMARY KEY,
                    hex_name VARCHAR(255) NULL,
                    image_path VARCHAR(500) NULL,
                    custom_field_1 TEXT NULL,
                    custom_field_2 TEXT NULL,
                    custom_field_3 TEXT NULL,
                    gm_notes TEXT NULL,
                    player_notes TEXT NULL,
                    created_by VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by VARCHAR(50) NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    version_number INT DEFAULT 1,
                    is_deleted BOOLEAN DEFAULT FALSE,
                    INDEX idx_updated_at (updated_at),
                    INDEX idx_created_by (created_by)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            
            // Create hex_change_log table
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS hex_change_log (
                    change_id INT AUTO_INCREMENT PRIMARY KEY,
                    hex_id VARCHAR(20) NOT NULL,
                    field_name VARCHAR(50) NOT NULL,
                    old_value TEXT NULL,
                    new_value TEXT NULL,
                    changed_by VARCHAR(50) NOT NULL,
                    change_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    session_id VARCHAR(50) NOT NULL,
                    change_type ENUM('create', 'update', 'delete') DEFAULT 'update',
                    INDEX idx_hex_timestamp (hex_id, change_timestamp),
                    FOREIGN KEY (hex_id) REFERENCES hex_data(hex_id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            
            // Create hex_edit_locks table
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS hex_edit_locks (
                    hex_id VARCHAR(20) PRIMARY KEY,
                    locked_by VARCHAR(50) NOT NULL,
                    session_id VARCHAR(50) NOT NULL,
                    lock_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    FOREIGN KEY (hex_id) REFERENCES hex_data(hex_id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            
            // Create hex_pending_changes table
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS hex_pending_changes (
                    pending_id INT AUTO_INCREMENT PRIMARY KEY,
                    hex_id VARCHAR(20) NOT NULL,
                    user_name VARCHAR(50) NOT NULL,
                    session_id VARCHAR(50) NOT NULL,
                    field_name VARCHAR(50) NOT NULL,
                    new_value TEXT NULL,
                    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed BOOLEAN DEFAULT FALSE,
                    conflict_detected BOOLEAN DEFAULT FALSE,
                    INDEX idx_hex_unprocessed (hex_id, processed),
                    FOREIGN KEY (hex_id) REFERENCES hex_data(hex_id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            
            // Create user_sessions table
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS user_sessions (
                    session_id VARCHAR(50) PRIMARY KEY,
                    user_name VARCHAR(50) NOT NULL,
                    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    is_gm BOOLEAN DEFAULT FALSE,
                    INDEX idx_last_activity (last_activity)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
            
            return true;
            
        } catch (Exception $e) {
            error_log("Table creation failed: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Update configuration
     * @param array $config Configuration array
     */
    public static function updateConfig($config) {
        if (isset($config['host'])) self::$host = $config['host'];
        if (isset($config['database'])) self::$database = $config['database'];
        if (isset($config['username'])) self::$username = $config['username'];
        if (isset($config['password'])) self::$password = $config['password'];
        
        // Reset connection to use new config
        self::$pdo = null;
    }
    
    /**
     * Get current configuration
     * @return array Current configuration (without password)
     */
    public static function getConfig() {
        return [
            'host' => self::$host,
            'database' => self::$database,
            'username' => self::$username,
            'password_set' => !empty(self::$password)
        ];
    }
    
    /**
     * Close database connection
     */
    public static function closeConnection() {
        self::$pdo = null;
    }
}
?>