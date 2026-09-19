(function () {
    'use strict';
    const selection = { standard: null, element: null, mode: 'expression', scale: false };
    const levelNames = {1:'Beginning', 2:'Developing', 3:'Proficient', 4:'Advanced'};
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function phrase(parts, element) {
        return parts.map(p => p.slot ? `<strong><u>${escape(element ?? p.text)}</u></strong>` : escape(p.text)).join('');
    }
    window.ASLCompetencies = {
        clear() { selection.standard=null; selection.element=null; selection.scale=false; },
        render(data, onScope, onGrade, onSelfAssess) {
            const standards = (data.taxonomy || []).flatMap(b => b.standards || []).filter(s => s.competency);
            if (!standards.length) return false;
            const section = document.querySelector('.curriculum-section');
            let root = document.getElementById('competency-browser');
            if (!root) {
                section.querySelectorAll(':scope > *').forEach(el => el.hidden = true);
                section.removeAttribute('aria-labelledby'); section.setAttribute('aria-label','Competencies');
                section.querySelector('#curriculum-heading')?.removeAttribute('id');
                root = document.createElement('div'); root.id = 'competency-browser'; section.append(root);
            }
            const standard = standards.find(s => s.standard_id === selection.standard);
            const c = standard?.competency;
            const element = c?.elements.find(e => e.key === selection.element);
            const modes = c?.modes || [];
            if (c && !modes.includes(selection.mode)) selection.mode = modes[0];
            const index = c?.elements.length ? c.elements.findIndex(e => e.key === selection.element) : 0;
            const target = standard?.targets.find(t => Number(t.order_index) === index && t.sub_code === selection.mode[0].toUpperCase());
            root.className = `competency-browser ${standard ? 'has-selection' : ''} ${selection.scale ? 'show-scale' : ''}`;
            section.classList.toggle('competency-initial', !standard);
            root.innerHTML = `
                ${selection.scale ? '<button type="button" class="competency-return" aria-label="Return to competencies" title="Return to competencies">←</button>' : `
                <div class="competency-list"><h2 id="curriculum-heading">Competencies</h2>${standards.map(s => {
                    const points = s.targets.reduce((sum,t) => sum + Number(data.scores?.[t.id] || 0),0);
                    const fill = Math.max(0,Math.min(100,100*points/(s.targets.length*3 || 1)));
                    return `<button type="button" data-competency="${escape(s.standard_id)}" aria-pressed="${s === standard}" style="--competency-progress:${fill}%"><span>${s.competency.number}.</span> ${escape(s.name)}</button>`;
                }).join('')}</div>`}
                ${c ? `<div class="competency-detail"><h3>${escape(c.title)}</h3><p class="competency-statement">${phrase(c.text, element?.replacement ?? element?.label)}</p>
                    ${c.notes.map(n => `<p>${escape(n)}</p>`).join('')}
                    ${c.elements.length ? `<h4>Elements</h4><div class="competency-elements">${c.elements.map(e => `<button type="button" data-element="${escape(e.key)}" aria-pressed="${e === element}">${escape(e.label)}</button>`).join('')}</div>` : ''}
                    ${element?.notes.map(n => `<p class="element-note">${escape(n)}</p>`).join('') || ''}
                    ${!selection.scale ? `<button type="button" class="open-scale" ${target ? '' : 'disabled'}>Proficiency scale →</button>` : ''}
                </div>` : ''}
                ${selection.scale && target ? `<div class="competency-scale"><h3>Proficiency scale</h3>
                    ${modes.length > 1 ? `<div class="competency-modes" aria-label="Assessment mode">${modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="${m === selection.mode}">${m[0].toUpperCase()+m.slice(1)}</button>`).join('')}</div>` : ''}
                    <div class="competency-levels">${Object.entries(target.rubric).sort((a,b) => Number(a[0])-Number(b[0])).map(([score,descriptor]) => {
                        const graded = Number(data.scores?.[target.id]) === Number(score);
                        const self = Number(data.self_assessments?.[target.id]) === Number(score);
                        const clickable = onGrade || onSelfAssess;
                        return `<${clickable ? 'button type="button"' : 'div'} class="competency-level level-${score} ${graded ? 'selected' : ''} ${self ? 'self-selected' : ''}" ${clickable ? `${onGrade ? 'data-score' : 'data-self-score'}="${score}" aria-pressed="${onGrade ? graded : self}"` : ''}><span class="competency-level-heading"><span class="competency-score">${score}</span><span class="competency-level-name">${levelNames[score] || ''}</span></span><span>${escape(descriptor)}</span></${clickable ? 'button' : 'div'}>`;
                    }).join('')}</div>
                </div>` : ''}`;
            const rerender = () => { onScope(selection.standard); this.render(data,onScope,onGrade,onSelfAssess); };
            root.querySelectorAll('[data-competency]').forEach(b => b.onclick = () => { selection.standard=selection.standard === b.dataset.competency ? null : b.dataset.competency; selection.element=null; selection.scale=false; rerender(); });
            root.querySelectorAll('[data-element]').forEach(b => b.onclick = () => { selection.element=b.dataset.element; rerender(); });
            root.querySelector('.open-scale')?.addEventListener('click', () => { selection.scale=true; rerender(); });
            root.querySelector('.competency-return')?.addEventListener('click', () => { selection.standard=null; selection.element=null; selection.scale=false; rerender(); });
            root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { selection.mode=b.dataset.mode; rerender(); });
            root.querySelectorAll('[data-score]').forEach(b => b.onclick = () => onGrade(target.id,Number(b.dataset.score),b));
            root.querySelectorAll('[data-self-score]').forEach(b => b.onclick = () => onSelfAssess(target.id,Number(b.dataset.selfScore),b));
            return true;
        }
    };
})();
