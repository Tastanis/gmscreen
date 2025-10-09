<?php
declare(strict_types=1);

function renderVttChatPanel(bool $isGm = false): string
{
    ob_start();
    ?>
    <aside
        id="chat-panel"
        class="chat-panel chat-panel--closed"
        aria-hidden="true"
        data-module="vtt-chat"
    >
        <div class="chat-panel__header">
            <h3 class="chat-panel__title">VTT Chat</h3>
            <div class="chat-panel__actions">
                <?php if ($isGm): ?>
                    <button
                        type="button"
                        id="chat-clear-btn"
                        class="chat-panel__clear"
                        data-action="clear-chat"
                    >
                        Clear Chat
                    </button>
                <?php endif; ?>
                <button
                    type="button"
                    id="chat-panel-close"
                    class="chat-panel__close"
                    aria-label="Close chat"
                    data-action="close-chat"
                >&times;</button>
            </div>
        </div>
        <div id="chat-message-list" class="chat-panel__history" role="log" aria-live="polite"></div>
        <div id="chat-whisper-targets" class="chat-panel__whispers" role="group" aria-label="Whisper targets"></div>
        <form id="chat-input-form" class="chat-panel__input" autocomplete="off">
            <textarea
                id="chat-input"
                class="chat-panel__textarea"
                rows="2"
                placeholder="Type a message..."
            ></textarea>
            <button type="submit" id="chat-send-btn" class="chat-panel__send">Send</button>
        </form>
        <div
            id="chat-drop-target"
            class="chat-drop-target"
            data-drop-scope="panel"
            hidden
            aria-hidden="true"
        >
            Drop images or image links to share
        </div>
    </aside>
    <button
        id="chat-panel-toggle"
        class="chat-panel-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="chat-panel"
        data-action="toggle-chat"
    >
        Open Chat
    </button>
    <div id="chat-whisper-popouts" class="chat-whisper-popouts" aria-live="polite" aria-atomic="false"></div>
    <div id="chat-whisper-alerts" class="chat-whisper-alerts" aria-live="assertive" aria-atomic="true"></div>
    <?php
    return trim((string) ob_get_clean());
}
