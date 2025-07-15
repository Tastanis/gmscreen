# Claude Code Development Notes

## Version System

### Overview
A centralized version tracking system has been implemented to help track changes and ensure browser cache updates.

### Files
- `/dnd/version.php` - Core version management system
- Version display appears in bottom-right corner of all pages that include it

### Usage

#### Including Version System
```php
// Include at top of PHP files
define('VERSION_SYSTEM_INTERNAL', true);
require_once '../version.php';

// Display version in HTML
<div class="version-footer">
    <span class="version-info"><?php echo Version::displayVersion(); ?></span>
    <span class="version-updated">Updated: <?php echo Version::getLastUpdated(); ?></span>
</div>
```

#### Version Management
```php
// Get current version
$version = Version::get();

// Increment version
Version::increment('patch');  // 1.0.0 -> 1.0.1
Version::increment('minor');  // 1.0.1 -> 1.1.0
Version::increment('major');  // 1.1.0 -> 2.0.0

// Get build number
$build = Version::getBuildNumber();
```

### Auto-Increment
The system automatically increments the patch version whenever the version.php file is included (unless called from within the version system itself).

### Developer Guidelines
- **Always update version after making changes** - The system will auto-increment, but manually increment for major/minor changes
- **Test with hard refresh** - After changes, use Ctrl+F5 to bypass browser cache
- **Check version display** - Verify version number updates in bottom-right corner

## Import Button Troubleshooting

### Issue Resolution Steps
1. **Check Debug Info** - Look for the debug info box that shows:
   - User status
   - GM status
   - Session information
   - Button visibility logic

2. **Browser Developer Tools**:
   - Open F12 console
   - Look for "Import button clicked!" message when clicking
   - Check Elements tab for button styling
   - Verify no CSS conflicts

3. **Common Issues**:
   - Not logged in as GM (password: 'harms')
   - Browser cache (use Ctrl+F5)
   - CSS conflicts with button styles
   - JavaScript errors preventing display

### Testing Commands
```javascript
// In browser console
console.log('Is GM:', window.isGM);
console.log('Button element:', document.getElementById('import-character-btn'));
```

## Development Workflow

### After Making Changes
1. Check version number updated in bottom-right corner
2. Test functionality with hard refresh (Ctrl+F5)
3. Verify changes work as expected
4. Document significant changes in this file

### Debugging
- Enable debug info boxes for troubleshooting
- Use console.log statements for JavaScript debugging
- Check browser Network tab for failed requests
- Verify file paths and permissions

## Notes
- Version system tracks: version number, build number, last updated timestamp
- Debug info should be removed before production
- Import button requires GM login (user: 'GM', password: 'harms')