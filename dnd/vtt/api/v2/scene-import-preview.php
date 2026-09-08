<?php
declare(strict_types=1);
require_once __DIR__ . '/_common.php';
require_once __DIR__ . '/../../lib/ScenePackage.php';
try {
    vttSyncV2RequireGm('Only the GM may preview scene imports.');
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') vttSyncV2Respond(405,['success'=>false,'error'=>'Method not allowed.']);
    $raw = file_get_contents('php://input', false, null, 0, 33554433);
    if ($raw === false || strlen($raw)>33554432) throw new InvalidArgumentException('Scene JSON file is too large (32 MB maximum).');
    try { $package = json_decode($raw, true, 128, JSON_THROW_ON_ERROR); }
    catch (JsonException $error) { throw new InvalidArgumentException('The file is not valid scene JSON.'); }
    if (!is_array($package)) throw new InvalidArgumentException('The file must contain a scene package object.');
    vttSyncV2Respond(200,['success'=>true,'preview'=>ScenePackage::preview($package)]);
} catch (Throwable $error) { vttSyncV2HandleFailure($error); }
