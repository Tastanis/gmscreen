<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$student = aslhub_require_student_scope($pdo, $me, (int)($_GET['id'] ?? 0), false);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();

aslhub_teacher_header($me, 'Manage Student', 'dashboard');
?>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start;">
        <!-- Edit fields -->
        <div class="rubric-panel">
            <h3 style="color:#2d3748;">Student Info</h3>
            <p class="muted" style="font-size:.85rem;margin-bottom:14px;">
                Fix anything the student entered wrong at signup. Changing level moves them to a
                different rubric set (their existing scores are kept, just hidden until switched back).
            </p>
            <form id="fields-form">
                <div class="form-row-2">
                    <div class="form-group"><label>First Name</label>
                        <input class="form-input" name="first_name" value="<?php echo aslhub_h($student['first_name']); ?>" required></div>
                    <div class="form-group"><label>Last Name</label>
                        <input class="form-input" name="last_name" value="<?php echo aslhub_h($student['last_name']); ?>" required></div>
                </div>
                <div class="form-group"><label>Email</label>
                    <input class="form-input" type="email" name="email" value="<?php echo aslhub_h($student['email']); ?>" required></div>
                <div class="form-row-3">
                    <div class="form-group"><label>Teacher</label>
                        <select class="form-input" name="teacher">
                            <?php foreach (aslhub_valid_teachers() as $key => $label): ?>
                                <option value="<?php echo $key; ?>" <?php echo ($student['teacher'] ?? '') === $key ? 'selected' : ''; ?>><?php echo $label; ?></option>
                            <?php endforeach; ?>
                        </select></div>
                    <div class="form-group"><label>Period</label>
                        <select class="form-input" name="class_period">
                            <?php for ($i = 1; $i <= 6; $i++): ?>
                                <option value="<?php echo $i; ?>" <?php echo (int)$student['class_period'] === $i ? 'selected' : ''; ?>>Period <?php echo $i; ?></option>
                            <?php endfor; ?>
                        </select></div>
                    <div class="form-group"><label>ASL Level</label>
                        <select class="form-input" name="level">
                            <?php for ($i = 1; $i <= 3; $i++): ?>
                                <option value="<?php echo $i; ?>" <?php echo (int)$student['level'] === $i ? 'selected' : ''; ?>>ASL <?php echo $i; ?></option>
                            <?php endfor; ?>
                        </select></div>
                </div>
                <button type="submit" class="form-button">Save Changes</button>
                <div id="fields-msg" style="margin-top:8px;font-size:.85rem;"></div>
            </form>
        </div>

        <!-- Actions -->
        <div>
            <div class="rubric-panel" style="margin-bottom:18px;">
                <h3 style="color:#2d3748;">Quick Actions</h3>
                <p style="margin:12px 0;">
                    <a class="form-button" style="display:inline-block;width:auto;padding:10px 20px;text-decoration:none;"
                       href="<?php echo $base; ?>/dashboard.php?student_id=<?php echo (int)$student['id']; ?>">
                        View dashboard as this student &rarr;</a>
                </p>
                <div class="form-group">
                    <label>Reset Password</label>
                    <div style="display:flex;gap:8px;">
                        <input class="form-input" type="text" id="new-password" placeholder="New password (min 6 chars)">
                        <button type="button" class="form-button" style="width:auto;margin:0;padding:10px 16px;" onclick="resetPassword()">Set</button>
                    </div>
                    <div id="pw-msg" style="margin-top:6px;font-size:.85rem;"></div>
                </div>
                <div class="form-group" style="margin-top:14px;">
                    <label>Account Status:
                        <?php echo (int)$student['is_active'] ? '<span style="color:#2f855a;">Active</span>' : '<span style="color:#c53030;">Deactivated</span>'; ?>
                    </label>
                    <?php if ((int)$student['is_active']): ?>
                        <button type="button" class="form-button" style="width:auto;padding:8px 16px;" onclick="setActive('deactivate')">Deactivate (keeps all data, blocks login)</button>
                    <?php else: ?>
                        <button type="button" class="form-button" style="width:auto;padding:8px 16px;" onclick="setActive('reactivate')">Reactivate</button>
                    <?php endif; ?>
                </div>
            </div>

            <div class="danger-zone">
                <h3>Danger Zone</h3>
                <p style="font-size:.85rem;margin:8px 0;">Permanently deletes this student and ALL their
                scores, history, and weekly logs. Prefer <em>Deactivate</em>. Export a backup first
                (Settings &rarr; Export). Type <strong>DELETE</strong> to confirm.</p>
                <div style="display:flex;gap:8px;">
                    <input class="form-input" type="text" id="delete-confirm" placeholder="Type DELETE">
                    <button type="button" class="form-button btn-danger" style="width:auto;margin:0;padding:10px 16px;" onclick="hardDelete()">Delete Forever</button>
                </div>
                <div id="del-msg" style="margin-top:6px;font-size:.85rem;"></div>
            </div>
        </div>
    </div>

<script>
const CSRF = '<?php echo $csrf; ?>';
const STUDENT_ID = <?php echo (int)$student['id']; ?>;
const API = '<?php echo $base; ?>/api/student_update.php';

async function post(data) {
    const body = new URLSearchParams({ csrf_token: CSRF, student_id: STUDENT_ID, ...data });
    const res = await fetch(API, { method: 'POST', body });
    return res.json();
}
document.getElementById('fields-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const out = await post({ action: 'update_fields', ...Object.fromEntries(f) });
    const el = document.getElementById('fields-msg');
    el.textContent = out.success ? '✓ Saved' : ('✗ ' + (out.error || 'Failed'));
    el.style.color = out.success ? '#2f855a' : '#c53030';
});
async function resetPassword() {
    const pw = document.getElementById('new-password').value;
    const out = await post({ action: 'reset_password', new_password: pw });
    const el = document.getElementById('pw-msg');
    el.textContent = out.success ? '✓ Password updated — tell the student their new password' : ('✗ ' + (out.error || 'Failed'));
    el.style.color = out.success ? '#2f855a' : '#c53030';
}
async function setActive(action) {
    const out = await post({ action });
    if (out.success) location.reload();
    else alert(out.error || 'Failed');
}
async function hardDelete() {
    const out = await post({ action: 'hard_delete', confirm_text: document.getElementById('delete-confirm').value });
    const el = document.getElementById('del-msg');
    if (out.success) { window.location = 'dashboard.php'; return; }
    el.textContent = '✗ ' + (out.error || 'Failed');
    el.style.color = '#c53030';
}
</script>
<?php aslhub_teacher_footer(); ?>
