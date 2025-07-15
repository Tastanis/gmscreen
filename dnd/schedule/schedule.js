// ===== GLOBAL VARIABLES =====
let saveTimeout = null;
let lastScheduleData = {};
let isInitialLoad = true;
let currentWeek = typeof initialWeek !== 'undefined' ? initialWeek : 1;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log(`Schedule system initialized for ${isGM ? 'GM' : currentUser} on week ${currentWeek}`);
    
    // Setup week navigation
    setupWeekNavigation();
    
    // Load initial data for the correct week
    loadScheduleData();
    
    // Setup auto-save and auto-resize for both GM and players
    setupAutoSave();
    setupAutoResize();
});

// ===== WEEK NAVIGATION =====
function setupWeekNavigation() {
    const prevBtn = document.getElementById('prevWeekBtn');
    const nextBtn = document.getElementById('nextWeekBtn');
    
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => navigateToWeek(currentWeek - 1));
        nextBtn.addEventListener('click', () => navigateToWeek(currentWeek + 1));
    }
    
    updateWeekDisplay();
}

function navigateToWeek(week) {
    if (week < 1) {
        week = 1;
    }
    
    if (week !== currentWeek) {
        currentWeek = week;
        updateWeekDisplay();
        
        // Update status
        updateSaveStatus('Loading week...', 'loading');
        
        // Save current week to server for persistence
        updateCurrentWeekOnServer(week);
        
        // Load data for new week
        loadScheduleData();
        
        // Log week change
        console.log(`Navigated to week ${week}`);
    }
}

// Function to update current week on server for persistence
async function updateCurrentWeekOnServer(week) {
    try {
        const response = await fetch('update_current_week.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=update_week&week=${week}`
        });
        
        const data = await response.json();
        
        if (!data.success) {
            console.warn('Failed to update current week on server:', data.error);
        } else {
            console.log(`Week ${week} saved to server for user ${currentUser}`);
        }
    } catch (error) {
        console.warn('Error updating current week on server:', error);
        // Don't show user error for this - it's not critical to functionality
    }
}

function updateWeekDisplay() {
    const weekNumberElement = document.getElementById('currentWeekNumber');
    const prevBtn = document.getElementById('prevWeekBtn');
    
    if (weekNumberElement) {
        weekNumberElement.textContent = currentWeek;
    }
    
    if (prevBtn) {
        prevBtn.disabled = currentWeek <= 1;
    }
}

// ===== AUTO-RESIZE FUNCTIONALITY =====
function setupAutoResize() {
    const textareas = document.querySelectorAll('.schedule-input');
    
    textareas.forEach(textarea => {
        // Initial resize
        autoResize(textarea);
        
        // Resize on input
        textarea.addEventListener('input', function() {
            autoResize(this);
        });
        
        // Resize on paste
        textarea.addEventListener('paste', function() {
            setTimeout(() => autoResize(this), 10);
        });
    });
}

function autoResize(textarea) {
    // Reset height to allow shrinking
    textarea.style.height = 'auto';
    
    // Set height based on scroll height
    const minHeight = 60; // Minimum height in pixels
    const newHeight = Math.max(textarea.scrollHeight, minHeight);
    
    textarea.style.height = newHeight + 'px';
}

// ===== DATA LOADING =====
async function loadScheduleData() {
    try {
        const response = await fetch('get_schedule.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=load&week=${currentWeek}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update current week from server response if provided
            if (data.week) {
                currentWeek = data.week;
                updateWeekDisplay();
            }
            
            if (isGM) {
                populateGMView(data.schedules);
            } else {
                populatePlayerView(data.schedules[currentUser] || {});
            }
            
            // Store data for change detection
            lastScheduleData = JSON.parse(JSON.stringify(data.schedules));
            
            if (!isInitialLoad) {
                updateSaveStatus('Updated', 'success');
                setTimeout(() => updateSaveStatus('Ready', 'ready'), 1500);
            } else {
                // On initial load, show ready status
                updateSaveStatus('Ready', 'ready');
            }
            isInitialLoad = false;
        } else {
            console.error('Failed to load schedule data:', data.error);
            updateSaveStatus('Error loading data', 'error');
        }
    } catch (error) {
        console.error('Error loading schedule data:', error);
        updateSaveStatus('Connection error', 'error');
    }
}

// ===== GM VIEW FUNCTIONS =====
function populateGMView(allSchedules) {
    const characters = ['frunk', 'sharon', 'indigo', 'zepha'];
    const days = ['monday', 'tuesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const blocks = ['block1', 'block2', 'block3', 'block4'];
    
    characters.forEach(character => {
        days.forEach(day => {
            blocks.forEach(block => {
                const input = document.querySelector(
                    `.schedule-input[data-character="${character}"][data-day="${day}"][data-block="${block}"]`
                );
                
                if (input) {
                    const newValue = (allSchedules[character] && 
                                    allSchedules[character][day] && 
                                    allSchedules[character][day][block]) || '';
                    
                    input.value = newValue;
                    
                    // Auto-resize after setting value
                    autoResize(input);
                }
            });
        });
    });
}

function populatePlayerView(playerSchedule) {
    const days = ['monday', 'tuesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const blocks = ['block1', 'block2', 'block3', 'block4'];
    
    days.forEach(day => {
        blocks.forEach(block => {
            const input = document.querySelector(
                `.schedule-input[data-character="${currentUser}"][data-day="${day}"][data-block="${block}"]`
            );
            
            if (input) {
                const value = (playerSchedule[day] && playerSchedule[day][block]) || '';
                input.value = value;
                
                // Auto-resize after setting value
                autoResize(input);
            }
        });
    });
}

// ===== AUTO-SAVE SETUP =====
function setupAutoSave() {
    const inputs = document.querySelectorAll('.schedule-input');
    
    inputs.forEach(input => {
        // Save on input with debouncing
        input.addEventListener('input', function() {
            handleInputChange(this);
            autoResize(this); // Auto-resize as user types
        });
        
        // Also save on blur (when user clicks away)
        input.addEventListener('blur', function() {
            saveScheduleData(this);
        });
        
        // Handle enter key (allows line breaks)
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                // Allow enter key for line breaks, auto-resize will handle the height
                setTimeout(() => autoResize(this), 10);
            }
        });
        
        // Handle paste events
        input.addEventListener('paste', function() {
            setTimeout(() => {
                autoResize(this);
                handleInputChange(this);
            }, 10);
        });
    });
    
    updateSaveStatus('Ready', 'ready');
}

function handleInputChange(input) {
    // Clear any existing timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    // Visual feedback
    input.classList.add('saving');
    updateSaveStatus('Typing...', 'typing');
    
    // Set new timeout for auto-save (500ms delay)
    saveTimeout = setTimeout(() => {
        saveScheduleData(input);
    }, 500);
}

async function saveScheduleData(input) {
    const character = input.dataset.character;
    const day = input.dataset.day;
    const block = input.dataset.block;
    const value = input.value.trim();
    
    // Clear any pending timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
    
    // Visual feedback
    updateSaveStatus('Saving...', 'saving');
    
    try {
        const response = await fetch('save_schedule.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `action=save&character=${encodeURIComponent(character)}&day=${encodeURIComponent(day)}&block=${encodeURIComponent(block)}&value=${encodeURIComponent(value)}&week=${currentWeek}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Success feedback
            input.classList.remove('saving');
            input.classList.add('saved');
            updateSaveStatus('Saved', 'saved');
            
            // Remove saved class after a moment
            setTimeout(() => {
                input.classList.remove('saved');
                updateSaveStatus('Ready', 'ready');
            }, 1500);
            
        } else {
            throw new Error(data.error || 'Save failed');
        }
        
    } catch (error) {
        console.error('Save error:', error);
        
        // Error feedback
        input.classList.remove('saving');
        input.classList.add('error');
        updateSaveStatus('Save failed - retrying...', 'error');
        
        // Retry after 2 seconds
        setTimeout(() => {
            input.classList.remove('error');
            saveScheduleData(input);
        }, 2000);
    }
}

function updateSaveStatus(message, type) {
    const statusElement = document.getElementById('saveStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `save-status ${type}`;
    }
}

// ===== UTILITY FUNCTIONS =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function sanitizeInput(input) {
    // Basic sanitization
    return input.replace(/[<>]/g, '').trim();
}

// ===== ERROR HANDLING =====
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    updateSaveStatus('System error', 'error');
});

// ===== CLEANUP ON PAGE UNLOAD =====
window.addEventListener('beforeunload', function() {
    // Clear timeouts
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
});

// ===== NETWORK STATUS MONITORING =====
window.addEventListener('online', function() {
    console.log('Connection restored');
    updateSaveStatus('Connection restored', 'success');
    setTimeout(() => updateSaveStatus('Ready', 'ready'), 2000);
});

window.addEventListener('offline', function() {
    console.log('Connection lost');
    updateSaveStatus('No connection', 'error');
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', function(e) {
    // Ctrl+S or Cmd+S to force save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        
        // Save all modified inputs
        const inputs = document.querySelectorAll('.schedule-input');
        inputs.forEach(input => {
            if (input.value.trim() !== '') {
                saveScheduleData(input);
            }
        });
        
        updateSaveStatus('Force saving all...', 'saving');
    }
    
    // Arrow keys for week navigation
    if (e.altKey || e.ctrlKey) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateToWeek(currentWeek - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateToWeek(currentWeek + 1);
        }
    }
});

// ===== DEVELOPMENT HELPERS =====
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Add some development logging
    console.log('Schedule system running in development mode');
    
    // Expose some functions globally for debugging
    window.scheduleDebug = {
        loadData: loadScheduleData,
        isGM: isGM,
        currentUser: currentUser,
        currentWeek: () => currentWeek,
        navigateToWeek: navigateToWeek,
        lastData: () => lastScheduleData
    };
}