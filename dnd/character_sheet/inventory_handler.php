<?php
// Character Sheet Inventory API
// Standalone handler for the character sheet Inventory tab.
// Data lives in dnd/data/character_inventory.json.
require_once __DIR__ . '/AtomicJsonFile.php';
require_once __DIR__ . '/InventoryEffectTable.php';

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
define('CI_IMAGES_DIR', __DIR__ . '/../images');
define('CI_IMAGES_WEB_PATH', '/dnd/images');

$CI_TABS = array('cal', 'sharon', 'indigo', 'zepha', 'shared', 'gm');
$CI_CHARACTER_TABS = array('cal', 'sharon', 'indigo', 'zepha');

function ciLoadData()
{
    global $CI_TABS;

    $data = array();
    if (is_file(CI_DATA_FILE)) {
        $contents = file_get_contents(CI_DATA_FILE);
        $decoded = json_decode((string) $contents, true);
        if ($contents === false || !is_array($decoded)) ciFail('Inventory data could not be read. No changes were saved.');
        $data = $decoded;
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

    try {
        return AtomicJsonFile::write(CI_DATA_FILE, $data);
    } catch (Throwable $error) {
        error_log('Inventory save failed: ' . $error->getMessage());
        return false;
    }
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

function ciCanUpdateCharges($data, $tab, $index, $user, $isGm)
{
    global $CI_CHARACTER_TABS;

    if ($isGm) {
        return true;
    }
    if ($tab === 'shared' || $tab === 'gm' || $tab === $user) {
        $item = isset($data[$tab]['items'][$index]) && is_array($data[$tab]['items'][$index])
            ? $data[$tab]['items'][$index]
            : array();
        return !array_key_exists('visible', $item) || $item['visible'] !== false;
    }
    return in_array($tab, $CI_CHARACTER_TABS, true) && $tab === $user;
}

function ciNormalizeEffectSections($value, $legacyEffect = '', $preserveEmpty = false, $previous = array())
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
            $table = null;
            $tableSupplied = array_key_exists('table', $section);
            if ($tableSupplied) {
                try { $table = InventoryEffectTable::normalize($section['table']); }
                catch (InvalidArgumentException $error) { ciFail($error->getMessage()); }
            } else {
                foreach ($previous as $oldSection) {
                    if (is_array($oldSection) && ($oldSection['id'] ?? '') === $id) {
                        $table = $oldSection['table'] ?? null;
                        break;
                    }
                }
            }

            if (!$preserveEmpty && $title === '' && $cost === '' && trim($text) === '' && $table === null) {
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
            if ($table !== null) $sections[count($sections) - 1]['table'] = $table;

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

function ciCleanItem($raw, $previous = array())
{
    $item = is_array($raw) ? $raw : array();

    $clean = array(
        'id' => isset($item['id']) && trim((string) $item['id']) !== '' ? substr(trim((string) $item['id']), 0, 80) : ciGenerateId(),
        'name' => isset($item['name']) ? substr((string) $item['name'], 0, 200) : '',
        'description' => isset($item['description']) ? substr((string) $item['description'], 0, 8000) : '',
        'keywords' => isset($item['keywords']) ? substr((string) $item['keywords'], 0, 500) : '',
        'image' => isset($item['image']) ? substr((string) $item['image'], 0, 500) : '',
        'visible' => isset($item['visible']) ? (bool) $item['visible'] : true,
        'hasCharges' => isset($item['hasCharges']) ? (bool) $item['hasCharges'] : false,
        'charges' => isset($item['charges']) ? max(0, min(999, (int) $item['charges'])) : 0
    );

    $clean['effectSections'] = ciNormalizeEffectSections(
        isset($item['effectSections']) ? $item['effectSections'] : array(),
        isset($item['effect']) ? $item['effect'] : '',
        true,
        $previous['effectSections'] ?? array()
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

// Items imported from the old dashboard inventory may reference images by
// either a relative ("images/foo.jpg") or absolute ("/dnd/images/foo.jpg")
// path, so usage checks match both forms.
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

    if (!is_readable(CI_DATA_FILE)) {
        return false;
    }
    $decoded = json_decode((string) file_get_contents(CI_DATA_FILE), true);
    if (!is_array($decoded)) {
        return false;
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

function ciRevisionFields($field)
{
    if (in_array($field, array('charges', 'hasCharges'), true)) return array('charges', 'hasCharges');
    if (in_array($field, array('effect', 'effectSections'), true)) return array('effect', 'effectSections');
    return array($field);
}

function ciFieldRevisions($item, $fields = null)
{
    $fields = $fields ?? array('name', 'description', 'keywords', 'effect', 'effectSections', 'visible', 'image', 'hasCharges', 'charges');
    $result = array();
    foreach ($fields as $field) {
        $values = array();
        foreach (ciRevisionFields($field) as $related) $values[$related] = $item[$related] ?? null;
        $result[$field] = hash('sha256', json_encode($values, JSON_THROW_ON_ERROR));
    }
    return $result;
}

function ciRespond($payload)
{
    // Response-only metadata: never write these derived revisions into inventory.
    if (isset($payload['item']) && is_array($payload['item'])) $payload['item']['_fieldRevisions'] = ciFieldRevisions($payload['item']);
    if (isset($payload['data']) && is_array($payload['data'])) {
        foreach ($payload['data'] as &$tab) {
            if (!isset($tab['items']) || !is_array($tab['items'])) continue;
            foreach ($tab['items'] as &$item) if (is_array($item)) $item['_fieldRevisions'] = ciFieldRevisions($item);
            unset($item);
        }
        unset($tab);
    }
    echo json_encode($payload);
    exit;
}

function ciFail($message)
{
    ciRespond(array('success' => false, 'error' => $message));
}

$action = isset($_POST['action']) ? (string) $_POST['action'] : (isset($_GET['action']) ? (string) $_GET['action'] : '');

// Lock a stable sibling file: the JSON destination is atomically replaced.
// Hold through the whole request so independent edits read the latest inventory.
$ciDirectory = dirname(CI_DATA_FILE);
if (!is_dir($ciDirectory) && !mkdir($ciDirectory, 0755, true) && !is_dir($ciDirectory)) {
    ciFail('Inventory storage is unavailable.');
}
$ciLock = fopen(CI_DATA_FILE . '.lock', 'c');
if ($ciLock === false || !flock($ciLock, $action === 'load' ? LOCK_SH : LOCK_EX)) {
    if (is_resource($ciLock)) fclose($ciLock);
    ciFail('Inventory storage is busy. Try again.');
}
register_shutdown_function(function () use ($ciLock) {
    flock($ciLock, LOCK_UN);
    fclose($ciLock);
});

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
        $contentRevision = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
        ciRespond(array('success' => true, 'data' => $data, 'last_modified' => $lastModified, 'content_revision' => $contentRevision));
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

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $tab, substr(trim((string) $itemData['id']), 0, 80));
        $clean = ciCleanItem($itemData, $index >= 0 ? $data[$tab]['items'][$index] : array());

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
        $chargeFields = array('hasCharges', 'charges');
        $allowedFields = array('name', 'description', 'keywords', 'effect', 'effectSections', 'visible', 'image', 'hasCharges', 'charges');
        if ($itemId === '' || !in_array($field, $allowedFields, true)) {
            ciFail('Invalid parameters');
        }

        $data = ciLoadData();
        $index = ciFindItemIndex($data, $tab, $itemId);
        if ($index < 0) {
            ciFail('Item not found');
        }

        if (!ciCanEditTab($tab, $ciUser, $ciIsGm)) {
            if (!in_array($field, $chargeFields, true) || !ciCanUpdateCharges($data, $tab, $index, $ciUser, $ciIsGm)) {
                ciFail('Permission denied');
            }
        }

        if (isset($_POST['expected_revision'])) {
            $expected = $_POST['expected_revision'];
            $revision = ciFieldRevisions($data[$tab]['items'][$index], array($field))[$field];
            if (!is_string($expected) || !hash_equals($revision, $expected)) {
                ciFail('This field changed in another window. Your edit was not saved; keep a copy of it before reloading.');
            }
        }

        if ($field === 'visible') {
            if (!$ciIsGm) {
                ciFail('Only the GM can change visibility');
            }
            $value = ($value === 'true' || $value === '1' || $value === 1 || $value === true);
        }

        if ($field === 'hasCharges') {
            $value = ($value === 'true' || $value === '1' || $value === 1 || $value === true);
        } elseif ($field === 'charges') {
            $value = max(0, min(999, (int) $value));
            $data[$tab]['items'][$index]['hasCharges'] = true;
        } elseif ($field === 'effectSections') {
            $value = ciNormalizeEffectSections(
                $value,
                isset($data[$tab]['items'][$index]['effect']) ? $data[$tab]['items'][$index]['effect'] : '',
                true,
                $data[$tab]['items'][$index]['effectSections'] ?? array()
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
            ciRespond(array('success' => true, 'field_revisions' => ciFieldRevisions($data[$tab]['items'][$index], ciRevisionFields($field))));
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

    default:
        ciFail('Invalid inventory action');
        break;
}
