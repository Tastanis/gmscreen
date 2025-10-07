<?php
declare(strict_types=1);

function renderVttTokenLibrary(): string
{
    ob_start();
    ?>
    <section class="vtt-token-library" data-module="vtt-token-library">
        <header class="vtt-token-library__header">
            <h2 class="vtt-token-library__title">Token Library</h2>
            <div class="vtt-token-library__actions">
                <label class="visually-hidden" for="token-search">Search tokens</label>
                <input id="token-search" type="search" placeholder="Search tokens" />
                <button class="btn btn--primary" type="button" data-action="create-token">Create Token</button>
            </div>
        </header>
        <div class="vtt-token-library__content">
            <ul id="token-template-list" class="token-template-list" aria-live="polite">
                <li class="token-template-list__empty">No tokens saved yet.</li>
            </ul>
        </div>
    </section>
    <?php
    return trim((string) ob_get_clean());
}
