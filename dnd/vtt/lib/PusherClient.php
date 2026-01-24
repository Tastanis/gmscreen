<?php
declare(strict_types=1);

/**
 * Lightweight Pusher client for triggering events without Composer dependencies.
 *
 * This implementation uses the Pusher HTTP API to trigger events. It handles:
 * - HMAC SHA256 authentication signature generation
 * - HTTP POST requests via cURL
 * - Graceful error handling (fails silently to not block saves)
 */
class PusherClient
{
    private string $appId;
    private string $key;
    private string $secret;
    private string $cluster;
    private int $timeout;

    /**
     * @param string $appId    Pusher application ID
     * @param string $key      Pusher application key (public)
     * @param string $secret   Pusher application secret (private)
     * @param string $cluster  Pusher cluster (e.g., 'us3')
     * @param int    $timeout  HTTP request timeout in seconds
     */
    public function __construct(
        string $appId,
        string $key,
        string $secret,
        string $cluster = 'us3',
        int $timeout = 5
    ) {
        $this->appId = $appId;
        $this->key = $key;
        $this->secret = $secret;
        $this->cluster = $cluster;
        $this->timeout = max(1, min(30, $timeout));
    }

    /**
     * Trigger an event on one or more channels.
     *
     * @param string|array $channels  Channel name(s) to trigger on
     * @param string       $event     Event name
     * @param mixed        $data      Event payload (will be JSON encoded)
     * @param string|null  $socketId  Optional socket ID to exclude from broadcast
     * @return bool True if the event was triggered successfully
     */
    public function trigger($channels, string $event, $data, ?string $socketId = null): bool
    {
        if (!function_exists('curl_init')) {
            error_log('[Pusher] cURL extension is not available');
            return false;
        }

        $channelList = is_array($channels) ? $channels : [$channels];
        if (empty($channelList)) {
            return false;
        }

        // Validate channel names (must not exceed 100 characters, alphanumeric + _-)
        foreach ($channelList as $channel) {
            if (!is_string($channel) || strlen($channel) > 100) {
                error_log('[Pusher] Invalid channel name');
                return false;
            }
        }

        // Validate event name
        if (strlen($event) > 200) {
            error_log('[Pusher] Event name too long');
            return false;
        }

        $body = [
            'name' => $event,
            'channels' => $channelList,
            'data' => json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ];

        if ($socketId !== null && $socketId !== '') {
            $body['socket_id'] = $socketId;
        }

        $bodyJson = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($bodyJson === false) {
            error_log('[Pusher] Failed to encode event data');
            return false;
        }

        // Check payload size (Pusher limit is 10KB per event)
        if (strlen($bodyJson) > 10240) {
            error_log('[Pusher] Payload exceeds 10KB limit');
            return false;
        }

        return $this->post('/events', $bodyJson);
    }

    /**
     * Trigger a batch of events (up to 10 events per batch).
     *
     * @param array $batch Array of events, each with 'channel', 'name', 'data' keys
     * @return bool True if the batch was triggered successfully
     */
    public function triggerBatch(array $batch): bool
    {
        if (!function_exists('curl_init')) {
            error_log('[Pusher] cURL extension is not available');
            return false;
        }

        if (empty($batch) || count($batch) > 10) {
            error_log('[Pusher] Batch must contain 1-10 events');
            return false;
        }

        $events = [];
        foreach ($batch as $event) {
            if (!isset($event['channel'], $event['name'], $event['data'])) {
                continue;
            }

            $eventData = [
                'channel' => $event['channel'],
                'name' => $event['name'],
                'data' => json_encode($event['data'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ];

            if (isset($event['socket_id']) && $event['socket_id'] !== '') {
                $eventData['socket_id'] = $event['socket_id'];
            }

            $events[] = $eventData;
        }

        if (empty($events)) {
            return false;
        }

        $bodyJson = json_encode(['batch' => $events], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($bodyJson === false) {
            return false;
        }

        return $this->post('/batch_events', $bodyJson);
    }

    /**
     * Send a POST request to the Pusher API.
     *
     * @param string $path     API endpoint path (e.g., '/events')
     * @param string $bodyJson JSON-encoded request body
     * @return bool True if the request was successful
     */
    private function post(string $path, string $bodyJson): bool
    {
        $timestamp = time();
        $bodyMd5 = md5($bodyJson);

        // Build the signature string
        $method = 'POST';
        $fullPath = "/apps/{$this->appId}{$path}";
        $queryParams = [
            'auth_key' => $this->key,
            'auth_timestamp' => $timestamp,
            'auth_version' => '1.0',
            'body_md5' => $bodyMd5,
        ];
        ksort($queryParams);

        $queryString = http_build_query($queryParams);
        $signatureString = "{$method}\n{$fullPath}\n{$queryString}";

        // Generate HMAC SHA256 signature
        $signature = hash_hmac('sha256', $signatureString, $this->secret);
        $queryParams['auth_signature'] = $signature;

        $url = "https://api-{$this->cluster}.pusher.com{$fullPath}?" . http_build_query($queryParams);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $bodyJson,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($bodyJson),
            ],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError !== '') {
            error_log("[Pusher] cURL error: {$curlError}");
            return false;
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            error_log("[Pusher] HTTP {$httpCode}: {$response}");
            return false;
        }

        return true;
    }

    /**
     * Get the public application key (for client-side initialization).
     */
    public function getKey(): string
    {
        return $this->key;
    }

    /**
     * Get the cluster name.
     */
    public function getCluster(): string
    {
        return $this->cluster;
    }
}
