<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/scroller.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
aslhub_scroller_ensure_schema($pdo);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();
aslhub_teacher_header($me, 'Scroller', 'scroller');
?>
<style>
    .scroller-shell{display:grid;grid-template-columns:minmax(280px,390px) 1fr;gap:18px;align-items:start}
    .scroller-card{background:rgba(255,255,255,.96);border:1px solid rgba(226,232,240,.9);border-radius:20px;padding:20px;box-shadow:0 14px 36px rgba(45,55,72,.08)}
    .scroller-card h2{color:#1d1d1f;margin:0 0 6px}.scroller-muted{color:#6e6e73;font-size:.9rem}
    .scroller-form label{display:block;color:#3a3a3c;font-weight:650;font-size:.88rem;margin:14px 0 6px}
    .scroller-form input[type=text],.scroller-form input[type=number],.scroller-form textarea{width:100%;border:1px solid #d2d2d7;border-radius:12px;padding:10px 12px;font:inherit;background:#fff;color:#1d1d1f}
    .scroller-form textarea{min-height:210px;resize:vertical}.scroller-form input:focus,.scroller-form textarea:focus{outline:3px solid rgba(0,122,255,.18);border-color:#007aff}
    .scroller-row{display:flex;gap:10px;flex-wrap:wrap}.scroller-row>div{flex:1;min-width:125px}.level-checks{display:flex;gap:12px;flex-wrap:wrap;padding:9px 0}.level-checks label{margin:0;font-weight:500}
    .scroller-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.scroller-button{appearance:none;border:0;border-radius:999px;padding:9px 16px;font-weight:700;cursor:pointer;background:#e8e8ed;color:#1d1d1f;text-decoration:none}.scroller-button.primary{background:#007aff;color:white}.scroller-button.danger{background:#fff0f0;color:#b42318}.scroller-button:disabled{opacity:.5;cursor:wait}
    .bank-list{display:grid;gap:10px;margin-top:16px}.bank{border:1px solid #e5e5ea;border-radius:16px;padding:14px;display:flex;gap:14px;justify-content:space-between;align-items:center}.bank.archived{opacity:.58}.bank h3{margin:0 0 4px;color:#1d1d1f}.bank-meta{font-size:.82rem;color:#6e6e73}.bank-buttons{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.empty-bank{border:1px dashed #c7c7cc;border-radius:16px;padding:28px;text-align:center;color:#6e6e73}
    .scroller-message{display:none;padding:10px 12px;border-radius:12px;margin-bottom:12px}.scroller-message.show{display:block}.scroller-message.error{background:#fff0f0;color:#b42318}.scroller-message.success{background:#eaf8ef;color:#167543}
    @media(max-width:850px){.scroller-shell{grid-template-columns:1fr}}
</style>

<div id="scroller-message" class="scroller-message" role="status" aria-live="polite"></div>
<div class="scroller-shell">
    <section class="scroller-card">
        <h2 id="form-title">New word bank</h2>
        <p class="scroller-muted">Paste one word or phrase per line, or separate entries with commas.</p>
        <form id="bank-form" class="scroller-form">
            <input type="hidden" name="id" id="bank-id" value="">
            <label for="bank-name">Word bank name</label>
            <input id="bank-name" name="name" type="text" maxlength="120" required placeholder="Unit 4 vocabulary">
            <label for="bank-words">Words and phrases</label>
            <textarea id="bank-words" name="words" required placeholder="hello&#10;nice to meet you&#10;where"></textarea>
            <div class="scroller-row">
                <div><label for="bank-speed">Default speed</label><input id="bank-speed" name="speed" type="number" min="0.5" max="2" step="0.1" value="1.0" required></div>
                <div><label for="bank-count">Default words</label><input id="bank-count" name="word_count" type="number" min="5" max="50" value="10" required></div>
            </div>
            <label>Available to</label>
            <div class="level-checks">
                <label><input type="checkbox" name="levels[]" value="1" checked> ASL 1</label>
                <label><input type="checkbox" name="levels[]" value="2"> ASL 2</label>
                <label><input type="checkbox" name="levels[]" value="3"> ASL 3</label>
            </div>
            <label><input id="bank-enabled" type="checkbox" name="enabled" value="1" checked> Show this bank in the game</label>
            <div class="scroller-actions">
                <button class="scroller-button primary" type="submit" id="save-bank">Save word bank</button>
                <button class="scroller-button" type="button" id="cancel-edit" hidden>Cancel edit</button>
            </div>
        </form>
    </section>
    <section class="scroller-card">
        <div style="display:flex;gap:12px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap">
            <div><h2>Word banks</h2><p class="scroller-muted">Archived banks stay recoverable and do not appear in the game.</p></div>
            <a class="scroller-button primary" href="<?php echo $base; ?>/scroller/index.php" target="_blank" rel="noopener">Launch game</a>
        </div>
        <div id="bank-list" class="bank-list" aria-live="polite"><div class="empty-bank">Loading word banks…</div></div>
    </section>
</div>

<script>
(() => {
    const API = <?php echo json_encode($base . '/api/scroller_wordlists.php'); ?>;
    const CSRF = <?php echo json_encode($csrf); ?>;
    const list = document.getElementById('bank-list');
    const form = document.getElementById('bank-form');
    const message = document.getElementById('scroller-message');
    let banks = [];

    function showMessage(text, type='success') {
        message.textContent = text; message.className = `scroller-message show ${type}`;
    }
    async function jsonFetch(url, options={}) {
        const response = await fetch(url, options);
        let data; try { data = await response.json(); } catch (_) { throw new Error('The server returned an unreadable response.'); }
        if (!response.ok || data.success === false) throw new Error(data.error || 'Request failed.');
        return data;
    }
    function escapeHtml(value) { const el=document.createElement('span'); el.textContent=String(value); return el.innerHTML; }
    function render() {
        if (!banks.length) { list.innerHTML = '<div class="empty-bank">No word banks yet. Create the first one on the left.</div>'; return; }
        list.innerHTML = banks.map(bank => {
            const levels = bank.levels.map(v => `ASL ${v}`).join(' · ');
            const owner = bank.owner_first_name ? ` · ${escapeHtml(bank.owner_first_name)} ${escapeHtml(bank.owner_last_name || '')}` : '';
            return `<article class="bank ${bank.active ? '' : 'archived'}">
                <div><h3>${escapeHtml(bank.name)}</h3><div class="bank-meta">${bank.words.length} words · ${levels} · ${bank.speed}× · ${bank.word_count} per game${owner}${bank.enabled ? '' : ' · hidden'}${bank.active ? '' : ' · archived'}</div></div>
                <div class="bank-buttons">${bank.active ? `<button class="scroller-button edit" data-id="${bank.id}">Edit</button><button class="scroller-button danger archive" data-id="${bank.id}">Archive</button>` : `<button class="scroller-button restore" data-id="${bank.id}">Restore</button>`}</div>
            </article>`;
        }).join('');
    }
    async function load() {
        try { const data=await jsonFetch(`${API}?manage=1`); banks=data.wordlists; render(); }
        catch (error) { list.innerHTML=`<div class="empty-bank">${escapeHtml(error.message)}</div>`; }
    }
    function resetForm() {
        form.reset(); document.getElementById('bank-id').value=''; document.getElementById('bank-speed').value='1.0'; document.getElementById('bank-count').value='10';
        document.querySelector('input[name="levels[]"][value="1"]').checked=true;
        document.getElementById('form-title').textContent='New word bank'; document.getElementById('cancel-edit').hidden=true;
    }
    function editBank(id) {
        const bank=banks.find(v=>v.id===id); if(!bank) return;
        document.getElementById('bank-id').value=bank.id; document.getElementById('bank-name').value=bank.name;
        document.getElementById('bank-words').value=bank.words.join('\n'); document.getElementById('bank-speed').value=bank.speed;
        document.getElementById('bank-count').value=bank.word_count; document.getElementById('bank-enabled').checked=bank.enabled;
        document.querySelectorAll('input[name="levels[]"]').forEach(input => input.checked=bank.levels.includes(Number(input.value)));
        document.getElementById('form-title').textContent='Edit word bank'; document.getElementById('cancel-edit').hidden=false;
        document.getElementById('bank-name').focus(); window.scrollTo({top:0,behavior:'smooth'});
    }
    async function setArchived(id, restore) {
        const body=new FormData(); body.set('csrf_token',CSRF); body.set('action',restore?'restore':'archive'); body.set('id',id);
        await jsonFetch(API,{method:'POST',body}); showMessage(restore?'Word bank restored.':'Word bank archived.'); await load();
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); const button=document.getElementById('save-bank'); button.disabled=true;
        try { const body=new FormData(form); body.set('csrf_token',CSRF); body.set('action','save'); await jsonFetch(API,{method:'POST',body}); showMessage('Word bank saved.'); resetForm(); await load(); }
        catch(error){showMessage(error.message,'error');} finally {button.disabled=false;}
    });
    list.addEventListener('click', async event => {
        const button=event.target.closest('button[data-id]'); if(!button) return; const id=Number(button.dataset.id);
        if(button.classList.contains('edit')) return editBank(id);
        if(button.classList.contains('archive') && !confirm('Archive this word bank? You can restore it later.')) return;
        button.disabled=true; try{await setArchived(id,button.classList.contains('restore'));}catch(error){showMessage(error.message,'error');button.disabled=false;}
    });
    document.getElementById('cancel-edit').addEventListener('click',resetForm);
    load();
})();
</script>
<?php aslhub_teacher_footer(); ?>

