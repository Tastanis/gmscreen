<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/lib/data.php';
require_once dirname(__DIR__) . '/lib/teacher_layout.php';

$me = aslhub_require_teacher($pdo);
$isAdmin = aslhub_is_admin($me);
$csrf = aslhub_csrf_token();
$base = aslhub_base_url();
$metric = ($_GET['metric'] ?? 'participation') === 'attendance' ? 'attendance' : 'participation';
$filters = [
    'teacher' => $_GET['teacher'] ?? ($isAdmin ? $me['teacher'] : null),
    'period' => $_GET['period'] ?? 'all',
    'level' => $_GET['level'] ?? 'all',
];
$students = aslhub_scoped_students($pdo, $me, $filters);
$studentFilter = max(0, (int)($_GET['student_id'] ?? 0));
if ($studentFilter) {
    $students = [aslhub_require_student_scope($pdo, $me, $studentFilter, false)];
}
$allBlocks = aslhub_reporting_blocks($pdo);
$blocks = array_values(array_filter($allBlocks, fn($b) => $b['instructional_days_elapsed'] > 0));
$focusBlockId = null;
foreach ($blocks as $block) if ($block['is_complete']) $focusBlockId = $block['id'];
if ($focusBlockId === null && $blocks) $focusBlockId = $blocks[count($blocks) - 1]['id'];

$rows = [];
if ($students && $blocks) {
    $studentIds = array_map(fn($s) => (int)$s['id'], $students);
    $blockIds = array_column($blocks, 'id');
    $sIn = implode(',', array_fill(0, count($studentIds), '?'));
    $bIn = implode(',', array_fill(0, count($blockIds), '?'));
    $stmt = $pdo->prepare("SELECT * FROM asl_student_block_metrics WHERE user_id IN ($sIn) AND block_id IN ($bIn)");
    $stmt->execute(array_merge($studentIds, $blockIds));
    foreach ($stmt->fetchAll() as $row) $rows[(int)$row['user_id']][(int)$row['block_id']] = $row;
}

aslhub_teacher_header($me, 'Attendance & Participation', 'weekly');
?>
<form class="filters-bar" method="GET" id="block-filters">
    <input type="hidden" name="metric" value="<?php echo aslhub_h($metric); ?>">
    <?php if ($studentFilter): ?><input type="hidden" name="student_id" value="<?php echo $studentFilter; ?>"><?php endif; ?>
    <?php if ($isAdmin): ?>
    <select name="teacher" onchange="this.form.submit()">
        <option value="all" <?php echo $filters['teacher'] === 'all' ? 'selected' : ''; ?>>All teachers</option>
        <?php foreach (aslhub_valid_teachers() as $key => $label): ?>
            <option value="<?php echo $key; ?>" <?php echo $filters['teacher'] === $key ? 'selected' : ''; ?>><?php echo $label; ?></option>
        <?php endforeach; ?>
    </select>
    <?php endif; ?>
    <select name="period" onchange="this.form.submit()">
        <option value="all">All periods</option>
        <?php for ($i=1;$i<=6;$i++): ?><option value="<?php echo $i; ?>" <?php echo (string)$filters['period']===(string)$i?'selected':''; ?>>Period <?php echo $i; ?></option><?php endfor; ?>
    </select>
    <select name="level" onchange="this.form.submit()">
        <option value="all">All levels</option>
        <?php for ($i=1;$i<=3;$i++): ?><option value="<?php echo $i; ?>" <?php echo (string)$filters['level']===(string)$i?'selected':''; ?>>ASL <?php echo $i; ?></option><?php endfor; ?>
    </select>
    <span class="muted" style="font-size:.82rem;">Each block is 10 instructional days. Blank attendance = 0 absences; blank participation = the block maximum. A blank finalized cell still accepts its first late entry; changing an existing finalized value requires correction mode.</span>
</form>

<?php if (!$allBlocks): ?>
    <div class="rubric-panel"><h3>No school calendar yet</h3><p class="muted">Upload and apply the shared calendar in Settings before entering attendance or participation.</p></div>
<?php else: ?>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px;">
    <a class="form-button" style="width:auto;padding:9px 15px;text-decoration:none;<?php echo $metric==='attendance'?'':'background:#edf2f7;color:#2d3748;'; ?>" href="?<?php echo http_build_query(array_merge($filters,['metric'=>'attendance','student_id'=>$studentFilter ?: null])); ?>">Attendance</a>
    <a class="form-button" style="width:auto;padding:9px 15px;text-decoration:none;<?php echo $metric==='participation'?'':'background:#edf2f7;color:#2d3748;'; ?>" href="?<?php echo http_build_query(array_merge($filters,['metric'=>'participation','student_id'=>$studentFilter ?: null])); ?>">Participation</a>
    <button type="button" class="form-button" id="correction-btn" style="width:auto;padding:9px 15px;background:#805ad5;">Correct a finalized block</button>
    <button type="button" class="form-button" id="save-all" style="width:auto;padding:9px 18px;margin-left:auto;">Save All Changes</button>
    <span id="save-state" class="muted" aria-live="polite"></span>
</div>

<div class="grading-grid-wrap" id="block-grid-wrap" style="max-height:72vh;overflow:auto;">
<table class="grading-grid" id="block-grid" style="min-width:max-content;">
    <thead><tr><th class="sticky-col">Student</th>
    <?php foreach ($blocks as $block): ?>
        <th id="block-<?php echo $block['id']; ?>" style="min-width:112px;<?php echo $block['id']===$focusBlockId?'background:#ebf8ff;':''; ?>">
            <?php echo aslhub_h($block['label']); ?><br><small><?php echo aslhub_h($block['month_label']); ?> · <?php echo $block['instructional_days']; ?> days</small><br>
            <small><?php echo aslhub_h($block['start_date']); ?>–<?php echo aslhub_h($block['end_date']); ?></small>
            <?php if ($block['is_finalized']): ?><br><small title="Requires correction mode">🔒 finalized</small><?php elseif ($block['is_current']): ?><br><small>current · <?php echo $block['instructional_days_elapsed']; ?> days so far</small><?php endif; ?>
        </th>
    <?php endforeach; ?></tr></thead>
    <tbody>
    <?php foreach ($students as $student): $sid=(int)$student['id']; ?>
        <tr data-student="<?php echo $sid; ?>">
            <td class="sticky-col"><?php echo aslhub_h($student['last_name'].', '.$student['first_name']); ?><br><small class="muted">ASL <?php echo (int)$student['level']; ?> · P<?php echo (int)$student['class_period']; ?></small></td>
            <?php foreach ($blocks as $block): $row=$rows[$sid][$block['id']]??null;
                $field=$metric==='attendance'?'absences':'participation_points';
                $value=$row&&$row[$field]!==null?(int)$row[$field]:'';
                $placeholder=$metric==='attendance'?'0':(string)$block['participation_max']; ?>
                <td style="text-align:center;">
                    <input type="number" min="0" max="<?php echo $metric==='attendance'?$block['instructional_days']:$block['participation_max']; ?>"
                        class="cell-input block-cell" style="width:72px;text-align:center;"
                        data-student="<?php echo $sid; ?>" data-block="<?php echo $block['id']; ?>"
                        data-version="<?php echo $row?(int)$row['version']:0; ?>" data-finalized="<?php echo ($block['is_finalized'] && $row)?'1':'0'; ?>"
                        value="<?php echo $value; ?>" placeholder="<?php echo $placeholder; ?>" <?php echo ($block['is_finalized'] && $row)?'disabled':''; ?>>
                </td>
            <?php endforeach; ?>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table>
</div>
<p class="muted" style="font-size:.82rem;margin-top:8px;">Tab moves right. Enter moves to the student below in the same block. Unsaved edits are kept in this browser and restored after reload.</p>
<?php endif; ?>

<script>
const CSRF = <?php echo json_encode($csrf); ?>;
const API = <?php echo json_encode($base . '/api/save_block_metrics.php'); ?>;
const FIELD = <?php echo json_encode($metric === 'attendance' ? 'absences' : 'participation_points'); ?>;
const DRAFT_KEY = 'asl-block-draft:' + FIELD + ':' + <?php echo json_encode(($filters['teacher']??'').':'.$filters['period'].':'.$filters['level']); ?>;
const cells = [...document.querySelectorAll('.block-cell')];
let dirty = new Set();
let saving = false;

function key(cell) { return cell.dataset.student + ':' + cell.dataset.block; }
function readDrafts() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; } }
function writeDrafts() {
    const out = {}; dirty.forEach(k => { const c=cells.find(x=>key(x)===k); if(c) out[k]=c.value; });
    if (Object.keys(out).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(out)); else localStorage.removeItem(DRAFT_KEY);
}
function updateState(text) {
    const state = document.getElementById('save-state');
    const button = document.getElementById('save-all');
    if (state) state.textContent = text || (dirty.size ? `${dirty.size} unsaved` : 'All changes saved');
    if (button) button.disabled = saving || !dirty.size;
}
const restored = readDrafts();
cells.forEach(cell => {
    cell.dataset.initial = cell.value;
    if (Object.prototype.hasOwnProperty.call(restored, key(cell))) {
        cell.value = restored[key(cell)]; dirty.add(key(cell)); cell.classList.add('dirty');
    }
    cell.addEventListener('input', () => {
        if (cell.value === cell.dataset.initial) { dirty.delete(key(cell)); cell.classList.remove('dirty'); }
        else { dirty.add(key(cell)); cell.classList.add('dirty'); }
        writeDrafts(); updateState();
    });
    cell.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const sameColumn = cells.filter(c => c.dataset.block === cell.dataset.block && !c.disabled);
        const next = sameColumn[sameColumn.indexOf(cell)+1];
        if (next) { next.focus(); next.select(); }
    });
});
updateState();

document.getElementById('correction-btn')?.addEventListener('click', () => {
    cells.filter(c => c.dataset.finalized === '1').forEach(c => c.disabled = false);
    document.getElementById('correction-btn').textContent = 'Correction mode enabled';
});

document.getElementById('save-all')?.addEventListener('click', saveAll);
async function saveAll() {
    if (saving || !dirty.size) return;
    const dirtyCells = cells.filter(c => dirty.has(key(c)));
    const finalizedDirty = dirtyCells.some(c => c.dataset.finalized === '1');
    const changes = dirtyCells.map(c => ({
        student_id: Number(c.dataset.student), block_id: Number(c.dataset.block), version: Number(c.dataset.version),
        [FIELD]: c.value === '' ? null : Number(c.value)
    }));
    saving = true; updateState('Saving…');
    try {
        const body = new URLSearchParams({ csrf_token: CSRF, changes: JSON.stringify(changes),
            correction: finalizedDirty ? '1' : '' });
        const out = await (await fetch(API, { method:'POST', body })).json();
        if (!out.success) throw new Error(out.error || 'Save failed');
        (out.saved || []).forEach(saved => {
            const c = cells.find(x => Number(x.dataset.student)===saved.student_id && Number(x.dataset.block)===saved.block_id);
            if (!c) return;
            c.dataset.version = saved.version; c.dataset.initial = c.value; dirty.delete(key(c)); c.classList.remove('dirty');
        });
        writeDrafts(); updateState('✓ saved');
        setTimeout(() => updateState(), 1800);
    } catch (err) { updateState('✗ ' + err.message); }
    finally { saving=false; const button=document.getElementById('save-all'); if(button) button.disabled=!dirty.size; }
}
window.addEventListener('beforeunload', e => { if (dirty.size && !saving) { e.preventDefault(); e.returnValue=''; } });
const focus = document.getElementById('block-<?php echo (int)($focusBlockId ?? 0); ?>');
if (focus) setTimeout(() => focus.scrollIntoView({behavior:'instant',block:'nearest',inline:'center'}), 0);
</script>
<?php aslhub_teacher_footer(); ?>
