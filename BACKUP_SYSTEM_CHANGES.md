# Backup System Standardization - Change Summary

## Overview
All three systems (GM Screen, Templates, Monster Creator) now use the same 3-tier smart backup strategy:
- **Recent**: For corruption recovery (always overwrites)
- **Session**: For session recovery (2 rotating slots)
- **Daily**: For historical recovery (2 daily backups max)

---

## Files Created

### 1. GM Screen Backup Helper
**File**: `/dnd/strixhaven/gm/includes/gm-backup-helper.php`
- New smart backup class based on Templates system
- Compatible with old BackupSystem interface
- Handles gm-tabs.json backups with 3-tier strategy

### 2. Monster Creator Backup Helper
**File**: `/dnd/strixhaven/monster-creator/includes/monster-backup-helper.php`
- New smart backup class based on Templates system
- Compatible with old BackupSystem interface
- Handles gm-monsters.json backups with 3-tier strategy

---

## Files Modified

### GM Screen Changes

#### `/dnd/strixhaven/gm/index.php`
- **Line 26**: Changed `require_once 'includes/backup-system.php';` → `require_once 'includes/gm-backup-helper.php';`
- **Line 169**: Added backup type parameter to `saveTabsData($data, $tabsFile, $backupType = 'pre-save')`
- **Line 174**: Changed `$backupSystem = new BackupSystem($dataDir);` → `$backupHelper = new GMBackupHelper($dataDir);`
- **Line 176**: Changed `$backupResult = $backupSystem->createBackup($tabsFile, 'pre-save');` → `$backupResult = $backupHelper->createBackup($tabsFile, $backupType);`
- **Line 226**: Changed `$backupSystem->restoreBackup` → `$backupHelper->restoreBackup`
- **Lines 428-444**: Added new `session_backup` action handler

#### `/dnd/strixhaven/gm/js/gm-screen.js`
- **Lines 1004-1044**: Enhanced auto-save with session backup functionality
- **Line 1006**: Added initial session backup creation
- **Line 1013-1015**: Added session backup interval (every 10 minutes)
- **Lines 1021-1044**: Added `createSessionBackup()` async function

### Monster Creator Changes

#### `/dnd/strixhaven/monster-creator/save-monster-data.php`
- **Line 22**: Changed `require_once '../gm/includes/backup-system.php';` → `require_once 'includes/monster-backup-helper.php';`
- **Line 49**: Added backup type parameter handling
- **Line 64**: Added backup type parameter to function signature
- **Line 81**: Added backupType to closure parameters
- **Line 83**: Changed `$backupSystem = new BackupSystem($dataDir);` → `$backupHelper = new MonsterBackupHelper($dataDir);`
- **Line 86**: Changed backup creation to use backupType parameter
- **Line 140**: Changed restore call to use new helper

#### `/dnd/strixhaven/monster-creator/monster-recovery.php`
- **Line 20**: Changed backup system include
- **Line 27**: Changed `$backupSystem = new BackupSystem($dataDir);` → `$backupHelper = new MonsterBackupHelper($dataDir);`
- **Lines 35, 46, 57, 76, 77**: Updated all method calls to use new helper

#### `/dnd/strixhaven/monster-creator/js/monster-builder.js`
- **Line 29-30**: Added session backup timing variables
- **Line 132**: Added session backup initialization
- **Line 1937**: Added backup type parameter to `saveChangedData()`
- **Line 1977**: Added backup_type to JSON payload
- **Lines 2328-2351**: Added session backup functionality

---

## Files Backed Up
- `/dnd/strixhaven/gm/includes/backup-system.php` → `backup-system.php.bak`

---

## New Backup File Naming Conventions

### GM Screen
- Recent: `gm-tabs_recent_latest.json`
- Session: `gm-tabs_session_{1|2}_{timestamp}.json`
- Daily: `gm-tabs_daily_{YYYY-MM-DD}.json`

### Monster Creator
- Recent: `gm-monsters_recent_latest.json`
- Session: `gm-monsters_session_{1|2}_{timestamp}.json`
- Daily: `gm-monsters_daily_{YYYY-MM-DD}.json`

### Templates (unchanged)
- Recent: `templates_recent_latest.json`
- Session: `templates_session_{1|2}_{timestamp}.json`
- Daily: `templates_daily_{YYYY-MM-DD}.json`

---

## Backup Triggers

### All Systems Now Support:
1. **Auto/Pre-save** → Recent backup (corruption protection)
2. **Session** → Session backup (session recovery)
3. **Manual** → Daily backup (historical recovery)

### Timing:
- **Session backups**: Every 10 minutes (if data exists)
- **Auto-save**: Every 30 seconds (unchanged)
- **Recent backups**: On every save operation

---

## Backward Compatibility
All new backup helpers maintain compatibility with the old BackupSystem interface:
- `createBackup($filePath, $type)`
- `restoreBackup($backupPath, $targetPath)`
- `getBackups($fileName)`
- `getStats()`
- `verifyBackup($backupPath)`

---

## Data Safety
- **No existing data is modified** - only backup mechanisms changed
- **All save/load functionality preserved**
- **Original backup files remain accessible**
- **Atomic operations maintained**
- **File locking preserved**