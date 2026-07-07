<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();

$buckets = $pdo->query("SELECT * FROM asl_skill_buckets WHERE active = 1 ORDER BY order_index")->fetchAll();
$standards = $pdo->query("SELECT * FROM asl_standards WHERE active = 1 ORDER BY order_index, standard_id")->fetchAll();
$resources = $pdo->query("SELECT * FROM asl_learning_target_resources WHERE standard_id IS NOT NULL ORDER BY standard_id, order_index, id")->fetchAll();

$byStandard = [];
foreach ($resources as $r) $byStandard[$r['standard_id']][] = $r;
$standardsByBucket = [];
foreach ($standards as $s) $standardsByBucket[$s['bucket_id']][] = $s;

aslhub_teacher_header($me, 'Resources', 'resources');
?>
    <p style="color:rgba(255,255,255,.9);margin-bottom:14px;">
        Resources attach to a <strong>standard</strong> and show on the student's rubric page.
        Leave level blank to show it to all ASL levels, or pick one level.
    </p>

    <?php foreach ($buckets as $b): ?>
        <div class="rubric-panel" style="margin-bottom:16px;">
            <h3 style="color:#2d3748;"><?php echo aslhub_h($b['code'] . ' — ' . $b['name']); ?></h3>
            <?php foreach ($standardsByBucket[$b['bucket_id']] ?? [] as $s): ?>
                <div style="border-top:1px solid #e2e8f0;padding:12px 0;">
                    <strong><?php echo aslhub_h($s['standard_id'] . ' — ' . $s['name']); ?></strong>
                    <div class="resource-list" data-standard="<?php echo aslhub_h($s['standard_id']); ?>">
                        <?php foreach ($byStandard[$s['standard_id']] ?? [] as $r): ?>
                            <div class="resource-item" data-id="<?php echo (int)$r['id']; ?>">
                                <div>
                                    <?php if ($r['resource_url']): ?>
                                        <a href="<?php echo aslhub_h($r['resource_url']); ?>" target="_blank" rel="noopener"><?php echo aslhub_h($r['resource_label']); ?></a>
                                    <?php else: ?>
                                        <strong><?php echo aslhub_h($r['resource_label']); ?></strong>
                                    <?php endif; ?>
                                    <?php if ($r['resource_description']): ?>
                                        <div class="muted" style="font-size:.82rem;"><?php echo aslhub_h($r['resource_description']); ?></div>
                                    <?php endif; ?>
                                </div>
                                <span>
                                    <span class="pill"><?php echo $r['asl_level'] ? 'ASL ' . (int)$r['asl_level'] : 'All levels'; ?></span>
                                    <button type="button" class="close-btn" style="font-size:18px;" title="Delete resource"
                                        onclick="deleteResource(<?php echo (int)$r['id']; ?>, this)">&times;</button>
                                </span>
                            </div>
                        <?php endforeach; ?>
                        <?php if (empty($byStandard[$s['standard_id']])): ?>
                            <div class="resource-empty">No resources yet.</div>
                        <?php endif; ?>
                    </div>
                    <form class="add-resource-form" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;"
                          data-standard="<?php echo aslhub_h($s['standard_id']); ?>">
                        <input class="cell-input" name="resource_label" placeholder="Name" required style="width:180px;">
                        <input class="cell-input" name="resource_url" placeholder="https://link (optional)" style="width:230px;">
                        <input class="cell-input" name="resource_description" placeholder="Description (optional)" style="width:220px;">
                        <select class="cell-input" name="asl_level" style="width:110px;">
                            <option value="">All levels</option>
                            <option value="1">ASL 1</option><option value="2">ASL 2</option><option value="3">ASL 3</option>
                        </select>
                        <button type="submit" class="form-button" style="width:auto;margin:0;padding:7px 14px;">Add</button>
                    </form>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endforeach; ?>

<script>
const CSRF = '<?php echo $csrf; ?>';
const API = '<?php echo $base; ?>/api/resource_save.php';

document.querySelectorAll('.add-resource-form').forEach(form => {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const body = new URLSearchParams({ csrf_token: CSRF, action: 'save', standard_id: form.dataset.standard, ...data });
        const out = await (await fetch(API, { method: 'POST', body })).json();
        if (out.success) location.reload();
        else alert(out.error || 'Save failed');
    });
});
async function deleteResource(id, btn) {
    if (!confirm('Delete this resource? (Students will no longer see it.)')) return;
    const body = new URLSearchParams({ csrf_token: CSRF, action: 'delete', id });
    const out = await (await fetch(API, { method: 'POST', body })).json();
    if (out.success) btn.closest('.resource-item').remove();
    else alert(out.error || 'Delete failed');
}
</script>
<?php aslhub_teacher_footer(); ?>
