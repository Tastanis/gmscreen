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
            </div>
        </header>
        <div class="vtt-token-library__content">
            <section class="token-maker" data-module="vtt-token-maker" aria-label="Token image builder">
                <div class="token-maker__preview" data-token-preview>
                    <span class="token-maker__preview-hint" data-token-placeholder>Drop an image or browse to begin.</span>
                    <img
                        class="token-maker__preview-image"
                        data-token-image
                        alt=""
                        hidden
                    />
                </div>
                <div class="token-maker__controls">
                    <div class="token-maker__dropzone" data-token-dropzone>
                        <p class="token-maker__dropzone-title">Drag &amp; Drop</p>
                        <p class="token-maker__dropzone-hint">PNG or JPG up to 10MB</p>
                    </div>
                    <input
                        id="token-image-input"
                        class="visually-hidden"
                        type="file"
                        accept="image/*"
                        data-token-input
                    />
                    <button class="btn" type="button" data-action="browse-token-image">Browse Images</button>
                    <p class="token-maker__controls-hint">
                        Scroll to zoom. Right-click and drag inside the circle to reposition.
                    </p>
                    <div class="token-maker__field">
                        <label for="token-name-input">Token Name</label>
                        <input
                            id="token-name-input"
                            type="text"
                            name="token-name"
                            placeholder="Name this token"
                            autocomplete="off"
                            data-token-name-input
                        />
                    </div>
                    <div class="token-maker__field token-maker__field--inline">
                        <div class="token-maker__field-group">
                            <label for="token-folder-select">Folder</label>
                            <select id="token-folder-select" name="token-folder" data-token-folder-select>
                                <option value="">Unsorted</option>
                            </select>
                            <p class="token-maker__hint">Keep tokens organized by adventure or encounter.</p>
                        </div>
                        <button class="btn" type="button" data-action="create-token-folder">New Folder</button>
                    </div>
                    <div class="token-maker__actions">
                        <button class="btn btn--primary" type="button" data-action="create-token">Create Token</button>
                        <p class="token-maker__feedback" data-token-feedback hidden></p>
                    </div>
                </div>
            </section>
            <ul id="token-template-list" class="token-template-list" aria-live="polite">
                <li class="token-template-list__empty">No tokens saved yet.</li>
            </ul>
        </div>
    </section>
    <?php
    return trim((string) ob_get_clean());
}
