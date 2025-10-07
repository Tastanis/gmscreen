<?php
declare(strict_types=1);

function renderVttChatPanel(): string
{
    ob_start();
    ?>
    <aside class="vtt-panel vtt-panel--chat" data-module="vtt-chat">
        <header class="vtt-panel__header">
            <h2 class="vtt-panel__title">VTT Chat</h2>
            <button type="button" class="vtt-panel__toggle" data-action="toggle-chat" aria-expanded="false">
                <span class="visually-hidden">Toggle VTT chat</span>
            </button>
        </header>
        <div class="vtt-panel__body">
            <div id="vtt-chat-log" class="chat-log" aria-live="polite"></div>
            <form id="vtt-chat-form" class="chat-form" autocomplete="off">
                <label class="visually-hidden" for="vtt-chat-input">Message</label>
                <textarea id="vtt-chat-input" name="message" rows="3" placeholder="Send a message..." required></textarea>
                <div class="chat-form__actions">
                    <button type="submit" class="btn btn--primary">Send</button>
                </div>
            </form>
        </div>
    </aside>
    <?php
    return trim((string) ob_get_clean());
}
