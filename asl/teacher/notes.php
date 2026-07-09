<?php
require_once dirname(__DIR__).'/config.php';
require_once dirname(__DIR__).'/lib/data.php';
require_once dirname(__DIR__).'/lib/teacher_layout.php';
$me=aslhub_require_teacher($pdo);$isAdmin=aslhub_is_admin($me);$csrf=aslhub_csrf_token();$base=aslhub_base_url();
$date=$_GET['date']??date('Y-m-d'); if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date))$date=date('Y-m-d');
$filters=['teacher'=>$_GET['teacher']??($isAdmin?$me['teacher']:null),'period'=>$_GET['period']??'all','level'=>$_GET['level']??'all'];
$students=aslhub_scoped_students($pdo,$me,$filters);$rows=[];
if($students){$ids=implode(',',array_map(fn($s)=>(int)$s['id'],$students));$stmt=$pdo->prepare("SELECT user_id,notes FROM asl_student_meetings WHERE meeting_date=? AND user_id IN ($ids)");$stmt->execute([$date]);foreach($stmt->fetchAll() as $r)$rows[(int)$r['user_id']]=$r['notes'];}
aslhub_teacher_header($me,'Dated Notes','notes');
?>
<form class="filters-bar" method="GET"><label>Date <input type="date" name="date" value="<?php echo aslhub_h($date); ?>" onchange="this.form.submit()"></label>
<?php if($isAdmin): ?><select name="teacher" onchange="this.form.submit()"><option value="all">All teachers</option><?php foreach(aslhub_valid_teachers() as $k=>$v): ?><option value="<?php echo $k; ?>" <?php echo $filters['teacher']===$k?'selected':''; ?>><?php echo aslhub_h($v); ?></option><?php endforeach; ?></select><?php endif; ?>
<select name="period" onchange="this.form.submit()"><option value="all">All periods</option><?php for($i=1;$i<=6;$i++): ?><option value="<?php echo $i; ?>" <?php echo (string)$filters['period']===(string)$i?'selected':''; ?>>Period <?php echo $i; ?></option><?php endfor; ?></select>
<select name="level" onchange="this.form.submit()"><option value="all">All levels</option><?php for($i=1;$i<=3;$i++): ?><option value="<?php echo $i; ?>" <?php echo (string)$filters['level']===(string)$i?'selected':''; ?>>ASL <?php echo $i; ?></option><?php endfor; ?></select></form>
<div style="display:flex;justify-content:flex-end;gap:10px;margin:10px 0"><span id="state" class="muted"></span><button id="save" type="button" class="form-button" style="width:auto;padding:9px 18px">Save All Notes</button></div>
<div class="grading-grid-wrap"><table class="grading-grid" style="width:100%"><thead><tr><th class="sticky-col">Student</th><th>Note for <?php echo aslhub_h($date); ?></th></tr></thead><tbody>
<?php foreach($students as $s):$id=(int)$s['id']; ?><tr><td class="sticky-col"><?php echo aslhub_h($s['last_name'].', '.$s['first_name']); ?></td><td><textarea class="note" data-student="<?php echo $id; ?>" rows="2" style="width:100%" placeholder="Optional note"><?php echo aslhub_h($rows[$id]??''); ?></textarea></td></tr><?php endforeach; ?>
</tbody></table></div>
<script>
const CSRF=<?php echo json_encode($csrf); ?>,DATE=<?php echo json_encode($date); ?>,KEY='asl-note-draft:'+DATE+':'+<?php echo json_encode(($filters['teacher']??'').':'.$filters['period'].':'.$filters['level']); ?>;
const notes=[...document.querySelectorAll('.note')],dirty=new Set();let saving=false;let drafts={};try{drafts=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){drafts={}}
function k(n){return n.dataset.student}function persist(){const o={};dirty.forEach(id=>{const n=notes.find(x=>k(x)===id);if(n)o[id]=n.value});Object.keys(o).length?localStorage.setItem(KEY,JSON.stringify(o)):localStorage.removeItem(KEY);state()}
function state(t){document.getElementById('state').textContent=t||(dirty.size?dirty.size+' unsaved':'All notes saved');document.getElementById('save').disabled=saving||!dirty.size}
notes.forEach(n=>{n.dataset.initial=n.value;if(Object.hasOwn(drafts,k(n))){n.value=drafts[k(n)];dirty.add(k(n))}n.oninput=()=>{n.value===n.dataset.initial?dirty.delete(k(n)):dirty.add(k(n));persist()}});state();
async function save(confirmBlank=false){if(saving||!dirty.size)return;saving=true;state('Saving…');const changed=notes.filter(n=>dirty.has(k(n))).map(n=>({student_id:Number(k(n)),notes:n.value}));try{const out=await(await fetch(<?php echo json_encode($base.'/api/save_notes_batch.php'); ?>,{method:'POST',body:new URLSearchParams({csrf_token:CSRF,date:DATE,changes:JSON.stringify(changed),confirm_blank:confirmBlank?'1':''})})).json();if(out.needs_confirm&&!confirmBlank){saving=false;if(confirm('This clears one or more existing notes. Continue?'))return save(true);state();return}if(!out.success)throw new Error(out.error||'Save failed');changed.forEach(c=>{const n=notes.find(x=>Number(k(x))===c.student_id);n.dataset.initial=n.value;dirty.delete(k(n))});persist();state('✓ saved')}catch(e){state('✕ '+e.message)}finally{saving=false;document.getElementById('save').disabled=!dirty.size}}
document.getElementById('save').onclick=()=>save();window.addEventListener('beforeunload',e=>{if(dirty.size&&!saving){e.preventDefault();e.returnValue=''}});
</script>
<?php aslhub_teacher_footer(); ?>
