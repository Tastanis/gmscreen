<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;

final class RetiredBoardEndpointTest extends TestCase
{
    /** @runInSeparateProcess @preserveGlobalState disabled */
    public function testRetiredEndpointRejectsWholeBoardWrites(): void
    {
        $_SERVER['REQUEST_METHOD'] = 'POST';
        ob_start();
        require __DIR__ . '/../dnd/vtt/api/state.php';
        $response = json_decode(ob_get_clean(), true, 512, JSON_THROW_ON_ERROR);
        self::assertSame(410, http_response_code());
        self::assertFalse($response['success']);
        self::assertSame('/dnd/vtt/api/v2/commands.php', $response['replacement']['commands']);
    }
}
