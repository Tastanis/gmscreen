<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();
$settings = aslhub_dashboard_settings($pdo);
$mustChange = !empty($me['must_change_password']) || isset($_GET['change_pw']);

$counts = [];
for ($i = 1; $i <= 3; $i++) $counts[$i] = aslhub_target_count($pdo, $i);
$reportingBlocks = aslhub_reporting_blocks($pdo);
$calendarCounts = $pdo->query("SELECT COUNT(*) AS days, COALESCE(SUM(is_instructional),0) AS instructional FROM asl_calendar_days")->fetch();

aslhub_teacher_header($me, 'Settings', 'settings');
?>
    <?php if ($mustChange): ?>
        <div style="background:#fdf6e3;border:2px solid #e8b93e;border-radius:10px;padding:12px 16px;margin-bottom:14px;">
            <strong>Set your own password before doing anything else</strong> — your account still has its starter password.
        </div>
    <?php endif; ?>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start;">
        <div>
            <!-- My password -->
            <div class="rubric-panel" style="margin-bottom:18px;">
                <h3 style="color:#2d3748;">My Password</h3>
                <form id="pw-form" style="margin-top:10px;">
                    <div class="form-group"><label>Current password</label>
                        <input class="form-input" type="password" name="current_password" <?php echo $mustChange ? '' : 'required'; ?>></div>
                    <div class="form-group"><label>New password (min 8 characters)</label>
                        <input class="form-input" type="password" name="new_password" required></div>
                    <button type="submit" class="form-button">Change My Password</button>
                    <div id="pw-msg" style="margin-top:8px;font-size:.85rem;"></div>
                </form>
            </div>

            <?php if ($isAdmin): ?>
            <!-- Calendar, participation, and fixed pace outcomes -->
            <div class="rubric-panel" style="margin-bottom:18px;">
                <h3 style="color:#2d3748;">School Calendar &amp; Participation</h3>
                <p class="muted" style="font-size:.85rem;margin:6px 0 12px;">
                    Pace lines are fixed and spread evenly across the instructional days in the uploaded calendar.
                    Green finishes at all 3s (average 3.0); red finishes at 25% 2s and 75% 3s (average 2.75);
                    blue finishes at 25% 4s and 75% 3s (average 3.25).
                    Current skill counts: ASL 1 = <?php echo $counts[1]; ?>, ASL 2 = <?php echo $counts[2]; ?>, ASL 3 = <?php echo $counts[3]; ?>.
                </p>
                <form id="course-settings-form">
                    <div class="form-group"><label>Participation maximum per 10-day block</label>
                        <input class="form-input" type="number" min="1" max="1000" name="participation_max"
                            value="<?php echo (int)$settings['participation_max']; ?>">
                        <small class="muted">Blank participation cells count as this maximum. Finalized blocks keep the maximum they used.</small>
                    </div>
                    <div class="form-group"><label>Student signup code</label>
                        <input class="form-input" type="text" name="signup_code" value="<?php echo aslhub_h($settings['signup_code']); ?>"></div>
                    <button type="submit" class="form-button">Save Participation &amp; Signup Settings</button>
                    <div id="course-settings-msg" style="margin-top:8px;font-size:.85rem;"></div>
                </form>
                <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;">
                <h4 style="color:#2d3748;">Upload the shared school calendar</h4>
                <p class="muted" style="font-size:.84rem;margin:6px 0 10px;">
                    Current calendar: <strong><?php echo (int)$calendarCounts['instructional']; ?> instructional days</strong>
                    in <strong><?php echo count($reportingBlocks); ?> reporting blocks</strong>.
                    Every consecutive 10 instructional days becomes one block; the last/current block may be shorter.
                    Past blocks finalize automatically and cannot be remapped by a later calendar upload.
                </p>
                <details style="font-size:.82rem;margin-bottom:10px;">
                    <summary style="cursor:pointer;font-weight:600;">JSON format to give an LLM</summary>
                    <p>Ask it to return JSON only, with every calendar date needed for the school year. Dates must be unique and use YYYY-MM-DD. Use an IANA timezone.</p>
                    <pre style="white-space:pre-wrap;background:#f7fafc;padding:10px;border-radius:8px;">{
  "school_year": "2026-2027",
  "timezone": "America/Los_Angeles",
  "days": [
    {"date":"2026-08-24","instructional":true,"label":"First day"},
    {"date":"2026-09-07","instructional":false,"label":"Labor Day"},
    {"date":"2026-09-08","instructional":true,"label":""}
  ]
}</pre>
                </details>
                <form id="calendar-form">
                    <input type="file" id="calendar-file" accept=".json,application/json" required>
                    <button type="submit" class="form-button" style="width:auto;padding:10px 18px;margin-left:8px;">Preview Calendar</button>
                </form>
                <div id="calendar-preview" style="display:none;margin-top:12px;">
                    <h4>Preview — nothing has changed</h4>
                    <div id="calendar-summary" class="muted" style="font-size:.85rem;"></div>
                    <div id="calendar-blocks" style="font-size:.8rem;max-height:180px;overflow:auto;margin:8px 0;"></div>
                    <button type="button" class="form-button" style="width:auto;padding:10px 18px;" onclick="commitCalendar()">Apply This Calendar</button>
                </div>
                <div id="calendar-msg" style="margin-top:8px;font-size:.85rem;"></div>
            </div>

            <!-- Teacher passwords -->
            <div class="rubric-panel">
                <h3 style="color:#2d3748;">Teacher Passwords</h3>
                <p class="muted" style="font-size:.85rem;margin:6px 0 12px;">Set or reset the other teacher's password (e.g. Ms. Parks' account).</p>
                <form id="teacherpw-form">
                    <div class="form-row-2">
                        <div class="form-group"><label>Teacher</label>
                            <select class="form-input" name="teacher">
                                <?php foreach (aslhub_valid_teachers() as $key => $label): ?>
                                    <option value="<?php echo $key; ?>" <?php echo $key === 'parks' ? 'selected' : ''; ?>><?php echo $label; ?></option>
                                <?php endforeach; ?>
                            </select></div>
                        <div class="form-group"><label>New password</label>
                            <input class="form-input" type="text" name="new_password" required></div>
                    </div>
                    <button type="submit" class="form-button">Set Password</button>
                    <div id="teacherpw-msg" style="margin-top:8px;font-size:.85rem;"></div>
                </form>
            </div>
            <?php endif; ?>
        </div>

        <div>
            <?php if ($isAdmin): ?>
            <!-- Backup / export -->
            <div class="rubric-panel" style="margin-bottom:18px;">
                <h3 style="color:#2d3748;">Backup &amp; Export</h3>
                <p class="muted" style="font-size:.85rem;margin:6px 0 12px;">
                    Both downloads also leave a copy on the server (asl/backups/, newest 40 kept).
                    SQL is the complete disaster-recovery backup. Excel is the readable, portable
                    class-data format understood by the preview-first importer below. Keep encrypted
                    copies away from the web server according to school policy.
                </p>
                <p style="display:flex;gap:10px;flex-wrap:wrap;">
                    <a class="form-button" style="width:auto;padding:10px 18px;text-decoration:none;display:inline-block;" href="<?php echo $base; ?>/api/export.php">Download Excel Export</a>
                    <a class="form-button" style="width:auto;padding:10px 18px;text-decoration:none;display:inline-block;" href="<?php echo $base; ?>/api/backup.php">Download SQL Backup</a>
                </p>
            </div>

            <!-- Import -->
            <div class="rubric-panel" style="margin-bottom:18px;">
                <h3 style="color:#2d3748;">Import / Restore from Excel</h3>
                <p class="muted" style="font-size:.85rem;margin:6px 0 12px;">
                    Upload a workbook exported above. Step 1 shows a <strong>preview only</strong> —
                    nothing changes until you confirm. Import adds and updates; it never deletes,
                    and blank cells never overwrite existing data. An automatic backup is taken
                    right before the import applies.
                </p>
                <form id="import-form">
                    <input type="file" id="import-file" accept=".xlsx" required style="margin-bottom:10px;">
                    <button type="submit" class="form-button" style="width:auto;padding:10px 18px;">Preview Import</button>
                </form>
                <div id="import-preview" style="display:none;margin-top:12px;">
                    <h4 style="color:#2d3748;">Preview — nothing has been changed yet</h4>
                    <ul id="import-summary" style="margin:8px 0 8px 20px;font-size:.9rem;"></ul>
                    <div id="import-warnings" style="font-size:.82rem;color:#c05621;"></div>
                    <button type="button" class="form-button" style="width:auto;padding:10px 18px;margin-top:10px;" onclick="commitImport()">Apply This Import</button>
                </div>
                <div id="import-msg" style="margin-top:8px;font-size:.85rem;"></div>
            </div>

            <!-- Start fresh (temporary) -->
            <div class="danger-zone">
                <h3>Start Fresh (temporary tool)</h3>
                <p style="font-size:.85rem;margin:8px 0;">
                    Deletes <strong>every student account</strong> and all their scores, history, attendance,
                    participation, and legacy weekly logs. Teachers, rubrics, resources, calendar, and settings are kept.
                    A full SQL + Excel backup is saved automatically first. Type <strong>START FRESH</strong> to confirm.
                </p>
                <div style="display:flex;gap:8px;">
                    <input class="form-input" type="text" id="wipe-confirm" placeholder="Type START FRESH">
                    <button type="button" class="form-button btn-danger" style="width:auto;margin:0;padding:10px 16px;" onclick="startFresh()">Wipe Students</button>
                </div>
                <div id="wipe-msg" style="margin-top:8px;font-size:.85rem;"></div>
            </div>
            <?php else: ?>
            <div class="rubric-panel">
                <h3 style="color:#2d3748;">Your Access</h3>
                <p class="muted" style="font-size:.9rem;margin-top:8px;">
                    You have full control of your own students (grading, block attendance/participation, editing their info,
                    resetting their passwords). Whole-database tools — export, import, backups, year settings —
                    are managed by Mr. Harms.
                </p>
            </div>
            <?php endif; ?>
        </div>
    </div>

<script>
const CSRF = '<?php echo $csrf; ?>';
const API = '<?php echo $base; ?>/api/settings_save.php';

function show(id, out, okText) {
    const el = document.getElementById(id);
    el.textContent = out.success ? ('✓ ' + (okText || 'Saved')) : ('✗ ' + (out.error || 'Failed'));
    el.style.color = out.success ? '#2f855a' : '#c53030';
}
async function post(url, data) {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ csrf_token: CSRF, ...data }) });
    return res.json();
}
document.getElementById('pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const out = await post(API, { action: 'change_own_password', ...Object.fromEntries(new FormData(e.target)) });
    show('pw-msg', out, 'Password changed');
    if (out.success) e.target.reset();
});
<?php if ($isAdmin): ?>
document.getElementById('course-settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const out = await post(API, { action: 'save_course_settings', ...Object.fromEntries(new FormData(e.target)) });
    show('course-settings-msg', out, 'Saved');
});
let calendarToken = null;
document.getElementById('calendar-form').addEventListener('submit', async e => {
    e.preventDefault();
    const file = document.getElementById('calendar-file').files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('csrf_token', CSRF); fd.append('mode', 'preview'); fd.append('calendar', file);
    document.getElementById('calendar-msg').textContent = 'Checking calendar…';
    try {
        const out = await (await fetch('<?php echo $base; ?>/api/calendar_import.php', { method: 'POST', body: fd })).json();
        if (!out.success) { show('calendar-msg', out); return; }
        calendarToken = out.token;
        const s = out.summary;
        document.getElementById('calendar-summary').textContent =
            `${s.instructional_days} instructional days, ${s.non_instructional_days} non-school days, ${s.reporting_blocks} blocks, ` +
            `${s.first_instructional_day} through ${s.last_instructional_day}. Timezone: ${s.timezone}.`;
        const blockList = document.getElementById('calendar-blocks');
        blockList.textContent = out.blocks.map(b => `${b.label}: ${b.start_date} – ${b.end_date} (${b.instructional_days} school days)`).join('\n');
        blockList.style.whiteSpace = 'pre-line';
        document.getElementById('calendar-preview').style.display = 'block';
        document.getElementById('calendar-msg').textContent = '';
    } catch (err) { show('calendar-msg', { success: false, error: err.message }); }
});
async function commitCalendar() {
    if (!calendarToken || !confirm('Apply this shared calendar and reporting-block schedule?')) return;
    const out = await post('<?php echo $base; ?>/api/calendar_import.php', { mode: 'commit', token: calendarToken });
    if (out.success) {
        show('calendar-msg', out, 'Calendar applied');
        document.getElementById('calendar-preview').style.display = 'none';
        setTimeout(() => location.reload(), 600);
    } else show('calendar-msg', out);
}
document.getElementById('teacherpw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const out = await post(API, { action: 'set_teacher_password', ...Object.fromEntries(new FormData(e.target)) });
    show('teacherpw-msg', out, 'Password set');
});

let importToken = null;
document.getElementById('import-form').addEventListener('submit', async e => {
    e.preventDefault();
    const file = document.getElementById('import-file').files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('csrf_token', CSRF);
    fd.append('mode', 'dryrun');
    fd.append('workbook', file);
    document.getElementById('import-msg').textContent = 'Analyzing…';
    const out = await (await fetch('<?php echo $base; ?>/api/import.php', { method: 'POST', body: fd })).json();
    document.getElementById('import-msg').textContent = '';
    if (!out.success) { show('import-msg', out); return; }
    importToken = out.token;
    document.getElementById('import-summary').innerHTML =
        Object.entries(out.summary).map(([sheet, txt]) => `<li><strong>${sheet}:</strong> ${txt}</li>`).join('');
    document.getElementById('import-warnings').innerHTML =
        (out.warnings || []).map(w => `⚠ ${w}`).join('<br>');
    document.getElementById('import-preview').style.display = 'block';
});
async function commitImport() {
    if (!importToken) return;
    if (!confirm('Apply this import? A backup is taken automatically first.')) return;
    const out = await post('<?php echo $base; ?>/api/import.php', { mode: 'commit', token: importToken });
    document.getElementById('import-preview').style.display = 'none';
    show('import-msg', out, 'Import applied');
}
async function startFresh() {
    const out = await post('<?php echo $base; ?>/api/wipe.php', { confirm_text: document.getElementById('wipe-confirm').value });
    if (out.success) {
        document.getElementById('wipe-msg').style.color = '#2f855a';
        document.getElementById('wipe-msg').textContent =
            `✓ Removed ${out.deleted_students} students. Backups saved: ${out.backups.join(', ')}`;
    } else {
        show('wipe-msg', out);
    }
}
<?php endif; ?>
</script>
<?php aslhub_teacher_footer(); ?>
