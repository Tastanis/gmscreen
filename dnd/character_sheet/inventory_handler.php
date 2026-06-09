<?php
// Character Sheet Inventory API
// Standalone handler for the character sheet Inventory tab.
// Data lives in dnd/data/character_inventory.json (separate from the
// dashboard inventory in dnd/data/inventory.json during the migration).

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json');

if (!isset($_SESSION['logged_in']) || $_SESSION['logged_in'] !== true || !isset($_SESSION['user'])) {
    echo json_encode(array('success' => false, 'error' => 'Not authenticated'));
    exit;
}

$ciUser = strtolower((string) $_SESSION['user']);
$ciIsGm = strcasecmp((string) $_SESSION['user'], 'GM') === 0;

define('CI_DATA_FILE', __DIR__ . '/../data/character_inventory.json');
define('CI_DASHBOARD_DATA_FILE', __DIR__ . '/../data/inventory.json');
define('CI_IMAGES_DIR', __DIR__ . '/../images');
define('CI_IMAGES_WEB_PATH', '/dnd/images');

$CI_TABS = array('cal', 'sharon', 'indigo', 'zepha', 'shared', 'gm');
$CI_CHARACTER_TABS = array('cal', 'sharon', 'indigo', 'zepha');

function ciLoadData()
{
    global $CI_TABS;

    $data = array();
    if (is_readable(CI_DATA_FILE)) {
        $contents = file_get_contents(CI_DATA_FILE);
        $decoded = json_decode((string) $contents, true);
        if (is_array($decoded)) {
            $data = $decoded;
        }
    }

    foreach ($CI_TABS as $tab) {
        if (!isset($data[$tab]) || !is_array($data[$tab])) {
            $data[$tab] = array('items' => array());
        }
        if (!isset($data[$tab]['items']) || !is_array($data[$tab]['items'])) {
            $data[$tab]['items'] = array();
        }
    }

    return $data;
}

function ciSaveData($data)
{
    $dir = dirname(CI_DATA_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $json = json_encode($data, JSON_PRETTY_PRINT);
    return file_put_contents(CI_DATA_FILE, $json, LOCK_EX) !== false;
}

function ciGenerateId($prefix = 'item')
{
    return $prefix . '_' . time() . '_' . substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 9);
}

function ciCanEditTab($tab, $user, $isGm)
{
    if ($isGm) {
        return true;
    }
    if ($tab === $user) {
        return true;
    }
    if ($tab === 'shared') {
        return true;
    }
    return false;
}

function ciNormalizeEffectSections($value, $legacyEffect = '', $preserveEmpty = false)
{
    $sections = array();

    if (is_string($value)) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : array();
    }

    if (is_array($value)) {
        foreach ($value as $section) {
            if (!is_array($section)) {
                continue;
            }

            $id = isset($section['id']) ? trim((string) $section['id']) : '';
            $title = isset($section['title']) ? trim((string) $section['title']) : '';
            $cost = isset($section['cost']) ? trim((string) $section['cost']) : '';
            $text = isset($section['text']) ? (string) $section['text'] : '';

            if (!$preserveEmpty && $title === '' && $cost === '' && trim($text) === '') {
                continue;
            }

            if ($id === '') {
                $id = ciGenerateId('effect');
            }

            $sections[] = array(
                'id' => substr($id, 0, 80),
                'title' => substr($title, 0, 120),
                'cost' => substr($cost, 0, 80),
                'text' => substr($text, 0, 4000)
            );

            if (count($sections) >= 20) {
                break;
            }
        }
    }

    $legacyEffect = trim((string) $legacyEffect);
    if (count($sections) === 0 && $legacyEffect !== '') {
        $sections[] = array(
            'id' => ciGenerateId('effect'),
            'title' => 'Effect',
            'cost' => '',
            'text' => substr($legacyEffect, 0, 4000)
        );
    }

    return $sections;
}

function ciBuildLegacyEffect($sections, $fallback = '')
{
    if (!is_array($sections) || count($sections) === 0) {
        return (string) $fallback;
    }

    $parts = array();
    foreach ($sections as $section) {
        if (!is_array($section)) {
            continue;
        }
        $title = isset($section['title']) ? trim((string) $section['title']) : '';
        $cost = isset($section['cost']) ? trim((string) $section['cost']) : '';
        $text = isset($section['text']) ? trim((string) $section['text']) : '';
        $heading = trim(implode(' - ', array_filter(array($title, $cost))));
        $parts[] = trim(($heading !== '' ? $heading . "\n" : '') . $text);
    }

    return implode("\n\n", array_filter($parts));
}

function ciCleanItem($raw)
{
    $item = is_array($raw) ? $raw : array();

    $clean = array(
        'id' => isset($item['id']) && trim((string) $item['id']) !== '' ? substr(trim((string) $item['id']), 0, 80) : ciGenerateId(),
        'name' => isset($item['name']) ? substr((string) $item['name'], 0, 200) : '',
        'description' => isset($item['description']) ? substr((string) $item['description'], 0, 8000) : '',
        'keywords' => isset($item['keywords']) ? substr((string) $item['keywords'], 0, 500) : '',
        'image' => isset($item['image']) ? substr((string) $item['image'], 0, 500) : '',
        'visible' => isset($item['visible']) ? (bool) $item['visible'] : true
    );

    $clean['effectSections'] = ciNormalizeEffectSections(
        isset($item['effectSections']) ? $item['effectSections'] : array(),
        isset($item['effect']) ? $item['effect'] : '',
        true
    );
    $clean['effect'] = ciBuildLegacyEffect($clean['effectSections'], isset($item['effect']) ? $item['effect'] : '');

    return $clean;
}

// Find an item by id inside a tab. Returns the index or -1.
function ciFindItemIndex($data, $tab, $itemId)
{
    if (!isset($data[$tab]['items']) || !is_array($data[$tab]['items'])) {
        return -1;
    }
    foreach ($data[$tab]['items'] as $index => $item) {
        if (is_array($item) && isset($item['id']) && (string) $item['id'] === (string) $itemId) {
            return $index;
        }
    }
    return -1;
}

// Image usage must be checked across BOTH inventory files while the old
// dashboard inventory still exists, since imported items share image files.
function ciImagePathVariants($path)
{
    $path = (string) $path;
    if ($path === '') {
        return array();
    }
    $variants = array($path);
    if (strpos($path, CI_IMAGES_WEB_PATH . '/') === 0) {
        $variants[] = substr($path, strlen('/dnd/'));
    } elseif (strpos($path, 'images/') === 0) {
        $variants[] = '/dnd/' . $path;
    }
    return $variants;
}

function ciIsImageUsed($imagePath)
{
    $targets = ciImagePathVariants($imagePath);
    if (!count($targets)) {
        return true;
    }

    $files = array(CI_DATA_FILE, CI_DASHBOARD_DATA_FILE);
    foreach ($files as $file) {
        if (!is_readable($file)) {
            continue;
        }
        $decoded = json_decode((string) file_get_contents($file), true);
        if (!is_array($decoded)) {
            continue;
        }
        foreach ($decoded as $tab) {
            if (!isset($tab['items']) || !is_array($tab['items'])) {
                continue;
            }
            foreach ($tab['items'] as $item) {
                if (is_array($item) && !empty($item['image']) && in_array((string) $item['image'], $targets, true)) {
                    return true;
                }
            }
        }
    }

    return false;
}

function ciDeleteImageIfUnused($imagePath)
{
    if (empty($imagePath) || ciIsImageUsed($imagePath)) {
        return;
    }

    $relative = $imagePath;
    if (strpos($relative, CI_IMAGES_WEB_PATH . '/') === 0) {
        $relative = substr($relative, strlen(CI_IMAGES_WEB_PATH . '/'));
    } elseif (strpos($relative, 'images/') === 0) {
        $relative = substr($relative, strlen('images/'));
    } else {
        return;
    }

    $file = CI_IMAGES_DIR . '/' . basename($relative);
    if (is_file($file)) {
        unlink($file);
    }
}

// Convert dashboard-relative image paths ("images/foo.jpg") to absolute web
// paths so they resolve from the character sheet page too.
function ciNormalizeImagePath($path)
{
    $path = trim((string) $path);
    if ($path === '') {
        return '';
    }
    if (strpos($path, 'images/') === 0) {
        return '/dnd/' . $path;
    }
    return $path;
}

function ciRespond($payload)
{
    echo json_encode($payload);
    exit;
}

function ciFail($message)
{
    ciRespond(array('success' => false, 'error' => $message));
}

$action = isset($_POST['action']) ? (string) $_POST['action'] : (isset($_GET['action']) ? (string) $_GET['action'] : '');

switch ($action) {
    case 'load':
        $data = ciLoadData();

        // Hide invisible items from players entirely.
        if (!$ciIsGm) {
            foreach ($data as $tab => $tabData) {
                $data[$tab]['items'] = array_values(array_filter($tabData['items'], function ($item) {
                    return !is_array($item) || !array_key_exists('visible', $item) || $item['visible'] !== false;
                }));
            }
        }

        $lastModified = is_file(CI_DATA_FILE) ? filemtime(CI_DATA_FILE) : null;
        ciRespond(array('success' => true, 'data' => $data, 'last_modified' => $lastModified));
        break;

    case 'add_item':
        $tab = isset($_POST['tab']) ? strtolower((string) $_POST['tab']) : '';
        if (!in_array($tab, $CI_TABS, true)) {
            ciFail('Invalid tab');
        }
        if (!ciCanEditTab($tab, $ciUser, $ciIsGm)) {
            ciFail('Permission denied');
        }

        $newItem = ciCleanItem(array(
            'id' => ciGenerateId(),
            'name' => 'New Item',
            'visible' => true,
            'effectSections' => array(array('id' => ciGenerateId('effect'), 'title' => '', 'cost' => '', 'text' => ''))
        ));

        $data = ciLoadData();
        $data[$tab]['items'][] = $newItem;

        if (ciSaveData($data)) {
            ciRespond(array('success' => true, 'item' => $newItem, 'tab' => $tab));
        }
        ciFail('Failed to save data');
        break;

    case 'save_item':
        $tab = isset($_POST['tab']) ? strtolower((string) $_POST['tab']) : '';
        $itemData = isset($_POST['item_data']) ? json_decode((string) $_POST['item_data'], true) : null;

        if (!in_array($tab, $CI_TABS, true)) {
            ciFail('Invalid tab');
        }
        if (!ciCanEditTab($tab, $ciUser, $ciIsGm)) {
            ciFail('Permission denied');
        }
        if (!is_array($itemData) || empty($itemData['id'])) {
            ciFail('Invalid item data');
        }

        $clean = ciCleanItem($itemData);
        $data = ciLoadData();
        $index = ciFindItemIndex($data, $tab, $clean['id']);

        if ($index >= 0) {
            $data[$tab]['items'][$index] = $clean;
        } else {
            $data[$tab]['items'][] = $clean;
        }

        if (ciSaveData($data)) {
            ciRespond(array('success' => true, 'item' => $clean));
        }
        ciFail('Failed to save data');
        break;

    case 'update_item_field':
        $tab = isset($_POST['tab']) ? strtolower((string) $_POST['tab']) : '';
        $itemId = isset($_POST['item_id']) ? (string) $_POST['item_id'] : '';
        $field = isset($_POST['field']) ? (string) $_POST['field'] : '';
        $value = isset($_POST['value']) ? $_POST['value'] : '';

        if (!in_array($tab, $CI_TABS, true)) {
            ciFail('Invalid tab');
        }
        if (!ciCanEditTab($tab, $ciUser, $ciIsGm)) {
            ciFail('Permission denied');
        }

        $allowedFields = array('name', 'description', 'keywords', 'effect', 'effectSections', 'visible', 'image');
        if ($itemId === '' || !in_array($field, $allowedFields, true)) {
            ciFail('Invalid parameters');
        }

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $tab, $itemId);
        if ($index < 0) {
            ciFail('Item not found');
        }

        if ($field === 'visible') {
            if (!$ciIsGm) {
                ciFail('Only the GM can change visibility');
            }
            $value = ($value === 'true' || $value === '1' || $value === 1 || $value === true);
        }

        if ($field === 'effectSections') {
            $value = ciNormalizeEffectSections(
                $value,
                isset($data[$tab]['items'][$index]['effect']) ? $data[$tab]['items'][$index]['effect'] : '',
                true
            );
            $data[$tab]['items'][$index]['effect'] = ciBuildLegacyEffect(
                $value,
                isset($data[$tab]['items'][$index]['effect']) ? $data[$tab]['items'][$index]['effect'] : ''
            );
        } elseif ($field === 'effect' && empty($data[$tab]['items'][$index]['effectSections'])) {
            $data[$tab]['items'][$index]['effectSections'] = ciNormalizeEffectSections(array(), $value);
        }

        $data[$tab]['items'][$index][$field] = $value;

        if (ciSaveData($data)) {
            ciRespond(array('success' => true));
        }
        ciFail('Failed to save data');
        break;

    case 'delete_item':
        $tab = isset($_POST['tab']) ? strtolower((string) $_POST['tab']) : '';
        $itemId = isset($_POST['item_id']) ? (string) $_POST['item_id'] : '';

        if (!in_array($tab, $CI_TABS, true)) {
            ciFail('Invalid tab');
        }
        if (!ciCanEditTab($tab, $ciUser, $ciIsGm)) {
            ciFail('Permission denied');
        }

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $tab, $itemId);
        if ($index < 0) {
            ciFail('Item not found');
        }

        $removed = $data[$tab]['items'][$index];
        array_splice($data[$tab]['items'], $index, 1);

        if (ciSaveData($data)) {
            ciDeleteImageIfUnused(isset($removed['image']) ? $removed['image'] : '');
            ciRespond(array('success' => true));
        }
        ciFail('Failed to save data');
        break;

    case 'duplicate_item':
        if (!$ciIsGm) {
            ciFail('Only the GM can duplicate items');
        }

        $tab = isset($_POST['tab']) ? strtolower((string) $_POST['tab']) : '';
        $itemId = isset($_POST['item_id']) ? (string) $_POST['item_id'] : '';

        if (!in_array($tab, $CI_TABS, true)) {
            ciFail('Invalid tab');
        }

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $tab, $itemId);
        if ($index < 0) {
            ciFail('Item not found');
        }

        $copy = ciCleanItem($data[$tab]['items'][$index]);
        $copy['id'] = ciGenerateId();
        foreach ($copy['effectSections'] as $i => $section) {
            $copy['effectSections'][$i]['id'] = ciGenerateId('effect');
        }
        $data[$tab]['items'][] = $copy;

        if (ciSaveData($data)) {
            ciRespond(array('success' => true, 'item' => $copy, 'tab' => $tab));
        }
        ciFail('Failed to save data');
        break;

    case 'share_item':
        $fromTab = isset($_POST['from_tab']) ? strtolower((string) $_POST['from_tab']) : '';
        $toTab = isset($_POST['to_tab']) ? strtolower((string) $_POST['to_tab']) : 'shared';
        $itemId = isset($_POST['item_id']) ? (string) $_POST['item_id'] : '';

        if (!in_array($fromTab, $CI_TABS, true) || !in_array($toTab, array('shared', 'gm'), true)) {
            ciFail('Invalid tab');
        }
        if ($fromTab === $toTab) {
            ciFail('Item is already there');
        }
        if (!$ciIsGm && ($fromTab !== $ciUser || $toTab !== 'shared')) {
            ciFail('You can only send items from your own inventory to the shared folder');
        }

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $fromTab, $itemId);
        if ($index < 0) {
            ciFail('Item not found');
        }

        $moved = ciCleanItem($data[$fromTab]['items'][$index]);
        $moved['id'] = ciGenerateId();
        array_splice($data[$fromTab]['items'], $index, 1);
        $data[$toTab]['items'][] = $moved;

        if (ciSaveData($data)) {
            ciRespond(array('success' => true, 'item' => $moved, 'to_tab' => $toTab));
        }
        ciFail('Failed to save data');
        break;

    case 'take_item':
        if ($ciIsGm) {
            ciFail('GMs cannot take items');
        }

        $fromTab = isset($_POST['from_tab']) ? strtolower((string) $_POST['from_tab']) : '';
        $itemId = isset($_POST['item_id']) ? (string) $_POST['item_id'] : '';
        $toTab = $ciUser;

        if (!in_array($fromTab, array('gm', 'shared'), true)) {
            ciFail('Can only take items from the GM or shared sections');
        }
        if (!in_array($toTab, $CI_CHARACTER_TABS, true)) {
            ciFail('Invalid target tab');
        }

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $fromTab, $itemId);
        if ($index < 0) {
            ciFail('Item not found');
        }

        $moved = ciCleanItem($data[$fromTab]['items'][$index]);
        if ($moved['visible'] === false) {
            ciFail('Item not found');
        }
        $moved['id'] = ciGenerateId();
        array_splice($data[$fromTab]['items'], $index, 1);
        $data[$toTab]['items'][] = $moved;

        if (ciSaveData($data)) {
            ciRespond(array('success' => true, 'item' => $moved, 'to_tab' => $toTab));
        }
        ciFail('Failed to save data');
        break;

    case 'upload_image':
        $itemId = isset($_POST['item_id']) ? (string) $_POST['item_id'] : '';
        if ($itemId === '') {
            ciFail('No item ID provided');
        }

        if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            $code = isset($_FILES['image']['error']) ? ' (Error code: ' . $_FILES['image']['error'] . ')' : '';
            ciFail('No file uploaded or upload error' . $code);
        }

        $uploadedFile = $_FILES['image'];
        $allowedTypes = array('image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp');
        $fileExtension = strtolower(pathinfo($uploadedFile['name'], PATHINFO_EXTENSION));
        $allowedExtensions = array('jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp');

        if (!in_array($uploadedFile['type'], $allowedTypes, true) && !in_array($fileExtension, $allowedExtensions, true)) {
            ciFail('Invalid file type. Only JPG, PNG, GIF, BMP, and WebP images are allowed.');
        }

        if ($uploadedFile['size'] > 5 * 1024 * 1024) {
            ciFail('File too large. Maximum size is 5MB.');
        }

        if (!is_dir(CI_IMAGES_DIR) && !mkdir(CI_IMAGES_DIR, 0755, true)) {
            ciFail('Could not create images directory');
        }

        $data = ciLoadData();
        $foundTab = null;
        $foundIndex = -1;
        foreach ($CI_TABS as $tab) {
            $index = ciFindItemIndex($data, $tab, $itemId);
            if ($index >= 0) {
                $foundTab = $tab;
                $foundIndex = $index;
                break;
            }
        }

        if ($foundTab === null) {
            ciFail('Item not found');
        }
        if (!ciCanEditTab($foundTab, $ciUser, $ciIsGm)) {
            ciFail('Permission denied');
        }

        $fileName = preg_replace('/[^a-z0-9_\-]/i', '', $itemId) . '_' . time() . '.' . $fileExtension;
        $filePath = CI_IMAGES_DIR . '/' . $fileName;

        if (!move_uploaded_file($uploadedFile['tmp_name'], $filePath)) {
            ciFail('Failed to save uploaded file to server');
        }

        $oldImage = isset($data[$foundTab]['items'][$foundIndex]['image']) ? $data[$foundTab]['items'][$foundIndex]['image'] : '';
        $webPath = CI_IMAGES_WEB_PATH . '/' . $fileName;
        $data[$foundTab]['items'][$foundIndex]['image'] = $webPath;

        if (ciSaveData($data)) {
            ciDeleteImageIfUnused($oldImage);
            ciRespond(array(
                'success' => true,
                'image_path' => $webPath,
                'item_id' => $itemId,
                'tab' => $foundTab
            ));
        }

        unlink($filePath);
        ciFail('Failed to save image data to inventory');
        break;

    case 'import_dashboard':
        if (!$ciIsGm) {
            ciFail('Only the GM can import items');
        }

        if (!is_readable(CI_DASHBOARD_DATA_FILE)) {
            ciFail('Dashboard inventory file not found');
        }

        $source = json_decode((string) file_get_contents(CI_DASHBOARD_DATA_FILE), true);
        if (!is_array($source)) {
            ciFail('Dashboard inventory file is not valid JSON');
        }

        $data = ciLoadData();
        $imported = array();
        $skipped = 0;

        foreach ($CI_TABS as $tab) {
            $imported[$tab] = 0;
            if (!isset($source[$tab]['items']) || !is_array($source[$tab]['items'])) {
                continue;
            }

            foreach ($source[$tab]['items'] as $rawItem) {
                if (!is_array($rawItem) || empty($rawItem['id'])) {
                    continue;
                }
                if (ciFindItemIndex($data, $tab, $rawItem['id']) >= 0) {
                    $skipped++;
                    continue;
                }

                $clean = ciCleanItem($rawItem);
                $clean['image'] = ciNormalizeImagePath($clean['image']);
                $data[$tab]['items'][] = $clean;
                $imported[$tab]++;
            }
        }

        if (ciSaveData($data)) {
            ciRespond(array(
                'success' => true,
                'imported' => $imported,
                'imported_total' => array_sum($imported),
                'skipped' => $skipped
            ));
        }
        ciFail('Failed to save data');
        break;

    default:
        ciFail('Invalid inventory action');
        break;
}
