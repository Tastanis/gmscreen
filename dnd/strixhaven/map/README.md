# Strixhaven Hexagonal Map System

An interactive D&D mapping system with 1400+ clickable hexes, real-time collaboration, and comprehensive data management.

## Features

### 🗺️ Interactive Hex Grid
- **1400+ hexagonal tiles** overlaid on your background map
- **Smooth zoom and pan** with Canvas-based rendering
- **Viewport culling** for optimal performance
- **Precise hex coordinate system** using axial mathematics

### 🎮 User Interaction
- **Click-to-edit** any hex with detailed modal interface
- **Real-time highlighting** and visual feedback
- **GM and Player permissions** with separate note areas
- **Image upload** for individual hexes

### 💾 Data Management
- **Sparse storage** - only modified hexes are saved
- **Auto-save functionality** with 30-second intervals
- **Optimistic locking** to prevent data conflicts
- **Change queuing** to prevent data loss during rapid edits

### 🔒 Concurrency Support
- **Edit locks** prevent simultaneous editing conflicts
- **Version control** with conflict detection and resolution
- **Multi-user support** with up to 15-20 concurrent users
- **Session management** with automatic cleanup

## Installation

### Prerequisites
- PHP 7.4 or higher
- MySQL database (optional - falls back to file storage)
- Apache/Nginx web server
- GD extension for image processing

### Quick Setup

1. **Copy files to your web directory:**
   ```
   /dnd/strixhaven/map/
   ├── index.php          # Main interface
   ├── setup.php          # Setup script
   ├── css/hex-map.css    # Styles
   ├── js/                # JavaScript modules
   ├── api/hex-api.php    # REST API
   └── images/            # Background and hex images
   ```

2. **Run the setup script:**
   - Visit `your-site.com/dnd/strixhaven/map/setup.php`
   - Login as GM (user: 'GM', password: 'harms')
   - Follow the setup wizard

3. **Add your background map:**
   - Place your map image in `images/` directory
   - Supported formats: JPG, PNG, GIF, WebP
   - Recommended size: 2048x1536 or similar

4. **Configure database (optional):**
   - Edit `../../includes/database-config.php`
   - Update connection details
   - Run setup again to create tables

## Usage

### For Game Masters (GMs)

1. **Initial Setup:**
   - Access the map at `/dnd/strixhaven/map/`
   - Click any hex to start editing
   - Fill in hex details as needed

2. **Hex Editing:**
   - **Name:** Display name for the hex
   - **Image:** Upload custom hex image
   - **Custom Fields:** Three flexible text areas
   - **GM Notes:** Private notes only you can see
   - **Player Notes:** Shared notes visible to players

3. **Map Controls:**
   - **Mouse wheel:** Zoom in/out
   - **Click and drag:** Pan around the map
   - **Reset View:** Return to default position
   - **Toggle Grid:** Show/hide hex grid lines
   - **GM Mode:** Enable debug information

### For Players

1. **Viewing the Map:**
   - Access same URL as GM
   - Click hexes to view shared information
   - Add notes in the Player Notes section

2. **Collaborative Editing:**
   - Multiple players can edit different hexes simultaneously
   - Auto-save prevents data loss
   - Conflict resolution handles simultaneous edits

### Keyboard Shortcuts

- **G:** Toggle grid visibility
- **D:** Toggle debug mode (GM only)
- **Escape:** Close hex edit modal
- **Arrow Keys:** Pan the map
- **+/-:** Zoom in/out
- **0:** Reset view

## Technical Details

### Architecture

- **Frontend:** HTML5 Canvas with JavaScript
- **Backend:** PHP with MySQL/File storage
- **Coordinate System:** Axial hex coordinates
- **Rendering:** Viewport culling for performance
- **API:** RESTful endpoints with JSON responses

### Performance

- **Client RAM:** 20-40MB for full grid
- **Server Load:** Minimal impact on shared hosting
- **Database:** <1MB storage for 100 active hexes
- **Network:** 1-3MB initial load, <20KB per update

### Database Schema

```sql
hex_data          # Main hex storage
hex_change_log    # Audit trail
hex_edit_locks    # Concurrency control
hex_pending_changes # Auto-save queue
user_sessions     # Session tracking
```

### File Structure

```
map/
├── index.php                 # Main interface
├── setup.php                 # Setup wizard
├── README.md                 # This file
├── css/
│   └── hex-map.css          # Map-specific styles
├── js/
│   ├── coordinate-system.js  # Hex mathematics
│   ├── hex-grid.js          # Canvas rendering
│   ├── zoom-pan.js          # Viewport control
│   ├── hex-data-manager.js  # Data operations
│   └── map-interface.js     # Main controller
├── api/
│   └── hex-api.php          # REST API endpoints
├── images/
│   ├── hexes/               # Hex-specific images
│   └── background.jpg       # Main map image
└── data/
    ├── hexes.json           # File storage (if no DB)
    ├── locks.json           # File-based locks
    └── changes.json         # Change log
```

## Configuration

### Grid Configuration

Edit the grid settings in `js/coordinate-system.js`:

```javascript
this.gridConfig = {
    imageWidth: 2048,        // Background image width
    imageHeight: 1536,       // Background image height
    gridOriginX: 100,        // Where hex (0,0) appears
    gridOriginY: 200,        // Where hex (0,0) appears
    gridWidth: 40,           // Number of hexes horizontally
    gridHeight: 35,          // Number of hexes vertically
    hexSize: 25              // Hex radius in pixels
};
```

### Database Configuration

Edit `../../includes/database-config.php`:

```php
private static $host = 'localhost';
private static $database = 'dnd_gmscreen';
private static $username = 'your_db_user';
private static $password = 'your_db_password';
```

## Troubleshooting

### Common Issues

1. **"Canvas element not found"**
   - Ensure index.php loaded correctly
   - Check browser console for JavaScript errors

2. **"Database connection failed"**
   - System automatically falls back to file storage
   - Check database credentials in config file

3. **Performance issues**
   - Try reducing hex grid size
   - Ensure viewport culling is working
   - Check browser developer tools for memory usage

4. **Image uploads not working**
   - Check file permissions on `images/hexes/` directory
   - Verify GD extension is installed
   - Check file size limits (max 5MB)

### Debug Mode

Enable debug mode (GM only) to see:
- Render performance metrics
- Visible hex count
- Memory usage
- FPS counter
- Coordinate information

## Security

- **Input validation** on all form data
- **File upload restrictions** (type, size)
- **SQL injection prevention** with prepared statements
- **Session-based authentication**
- **GM-only administrative functions**

## Browser Compatibility

- **Chrome 80+** ✅ Full support
- **Firefox 75+** ✅ Full support
- **Safari 13+** ✅ Full support
- **Edge 80+** ✅ Full support
- **Mobile browsers** ⚠️ Limited touch support

## Performance Recommendations

### For Optimal Performance:
1. Use background images under 2MB
2. Keep active hex data under 100 hexes
3. Limit concurrent users to 15-20
4. Use modern browsers with Canvas support
5. Consider upgrading from shared hosting for heavy usage

## Contributing

This system is designed to be modular and extensible:

1. **Adding new hex fields:** Modify the database schema and modal interface
2. **Custom rendering:** Extend the HexGrid class
3. **Additional map layers:** Add new canvas layers
4. **API extensions:** Add new endpoints to hex-api.php

## License

Part of the D&D GM Screen system. Use responsibly for your gaming table.

---

**Need help?** Check the browser console for error messages or contact your system administrator.

**Performance issues?** Try the GM debug mode to identify bottlenecks.