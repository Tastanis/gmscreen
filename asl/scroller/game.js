class ScrollerGame {
    constructor() {
        this.api=document.body.dataset.api; this.isTeacher=document.body.dataset.teacher==='1'; this.level=Number(document.body.dataset.level)||0;
        this.wordLists=[]; this.selectedWords=[]; this.gameWords=[]; this.effects=null; this.abortController=null; this.loadGeneration=0; this.timers=new Set(); this.animationFrames=new Set(); this.cancelled=false;
        this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches; this.bind(); this.loadWordLists();
    }
    bind() {
        const $=id=>document.getElementById(id);
        $('use-custom-words').addEventListener('change',e=>$('custom-words').disabled=!e.target.checked);
        $('word-count').addEventListener('input',e=>$('word-count-display').textContent=e.target.value);
        $('level-filter')?.addEventListener('change',()=>this.loadWordLists());
        $('start-btn').addEventListener('click',()=>this.startGame()); $('play-again-btn').addEventListener('click',()=>this.playAgain());
        $('adjust-settings-btn').addEventListener('click',()=>this.showScreen('menu-screen')); $('main-menu-btn').addEventListener('click',()=>{this.clearSelections();this.showScreen('menu-screen');});
        $('exit-game').addEventListener('click',()=>this.exitGame());
        document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('game-screen').classList.contains('active'))this.exitGame();else if($('results-screen').classList.contains('active'))this.showScreen('menu-screen');});
    }
    async loadWordLists() {
        const generation=++this.loadGeneration; this.abortController?.abort(); this.abortController=new AbortController();
        const container=document.getElementById('wordlist-container'); container.innerHTML='<div class="loading">Loading word banks…</div>'; this.showError('');
        const requested=this.isTeacher?Number(document.getElementById('level-filter')?.value||0):this.level;
        try {
            const response=await fetch(`${this.api}${requested?`?level=${requested}`:''}`,{signal:this.abortController.signal,headers:{Accept:'application/json'}});
            let data;try{data=await response.json();}catch(_){throw new Error('The server returned an unreadable response.');}
            if(!response.ok||data.success===false)throw new Error(data.error||'Word banks could not be loaded.');
            if(generation!==this.loadGeneration)return;this.wordLists=Array.isArray(data.wordlists)?data.wordlists:[];this.renderWordLists();
        } catch(error) {if(error.name==='AbortError'||generation!==this.loadGeneration)return;this.wordLists=[];container.innerHTML='<div class="loading">Word banks could not be loaded. Custom words are still available.</div>';this.enableCustomWords();this.showError(error.message);}
    }
    renderWordLists() {
        const container=document.getElementById('wordlist-container'); container.replaceChildren();
        if(!this.wordLists.length){container.innerHTML='<div class="loading">No word banks are available. Use custom words instead.</div>';this.enableCustomWords();return;}
        for(const bank of this.wordLists){const row=document.createElement('div');row.className='wordlist-item';const input=document.createElement('input');input.type='checkbox';input.id=`wordlist-${bank.id}`;input.value=bank.id;const label=document.createElement('label');label.htmlFor=input.id;label.textContent=bank.name;const meta=document.createElement('small');meta.textContent=`${bank.words.length} words`;row.append(input,label,meta);container.append(row);
            input.addEventListener('change',()=>{if(!input.checked)return;document.getElementById('speed-select').value=String(bank.speed);document.getElementById('word-count').value=String(bank.word_count);document.getElementById('word-count-display').textContent=String(bank.word_count);});}
    }
    enableCustomWords(){const box=document.getElementById('use-custom-words');box.checked=true;document.getElementById('custom-words').disabled=false;}
    parseWords(raw){return raw.split(/[\r\n,]+/u).map(v=>v.trim().replace(/\s+/gu,' ')).filter(Boolean);}
    collectSelectedWords() {
        const all=[];for(const box of document.querySelectorAll('#wordlist-container input:checked')){const bank=this.wordLists.find(v=>v.id===Number(box.value));if(bank&&Array.isArray(bank.words))all.push(...bank.words);}
        if(document.getElementById('use-custom-words').checked)all.push(...this.parseWords(document.getElementById('custom-words').value));
        const seen=new Set();this.selectedWords=all.filter(word=>{const key=String(word).trim().toLocaleLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;});return this.selectedWords.length>0;
    }
    shuffle(words){const result=[...words];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
    showError(text){const el=document.getElementById('menu-error');el.textContent=text;el.classList.toggle('show',Boolean(text));}
    startGame(){if(!this.collectSelectedWords()){this.showError('Choose a word bank or enter custom words.');return;}this.showError('');const count=Number(document.getElementById('word-count').value);this.speed=Number(document.getElementById('speed-select').value);this.gameWords=this.shuffle(this.selectedWords).slice(0,Math.min(count,this.selectedWords.length));this.beginRound();}
    playAgain(){if(!this.selectedWords.length)return this.showScreen('menu-screen');this.gameWords=this.shuffle(this.selectedWords).slice(0,Math.min(Number(document.getElementById('word-count').value),this.selectedWords.length));this.beginRound();}
    beginRound(){this.cleanupRound();this.cancelled=false;this.showScreen('game-screen');document.getElementById('game-area').replaceChildren();this.effects=new ScrollerEffects(document.getElementById('stars-canvas'),document.getElementById('particles-canvas'),this.reducedMotion);this.effects.start();this.startCountdown();}
    later(fn,delay){const id=setTimeout(()=>{this.timers.delete(id);if(!this.cancelled)fn();},delay);this.timers.add(id);return id;}
    startCountdown(){const el=document.getElementById('countdown');let count=this.reducedMotion?3:5;el.textContent=count;const audio=document.getElementById('countdown-sound');if(!this.reducedMotion){audio.currentTime=0;audio.play().catch(()=>{});}const tick=()=>{count--;if(count>0){el.textContent=count;this.later(tick,1000);}else{el.textContent='';this.startScrolling();}};this.later(tick,1000);}
    startScrolling(){const duration=(this.reducedMotion?6500:10000)/this.speed;const delay=duration/3;this.gameWords.forEach((word,index)=>this.later(()=>this.createWord(word,duration,index===this.gameWords.length-1),index*delay));}
    createWord(word,duration,isLast){const el=document.createElement('div');el.className='scroll-word flashing';el.textContent=word;document.getElementById('game-area').append(el);this.later(()=>el.classList.remove('flashing'),300);const start=performance.now();
        const animate=now=>{if(this.cancelled)return;const progress=Math.min(1,(now-start)/duration);el.style.bottom=`${innerHeight*progress}px`;if(progress<1){const id=requestAnimationFrame(t=>{this.animationFrames.delete(id);animate(t);});this.animationFrames.add(id);return;}el.classList.add('double-flash');const rect=el.getBoundingClientRect();this.effects?.burst(rect.left+rect.width/2,rect.top+rect.height/2,isLast);this.later(()=>el.remove(),700);if(isLast)this.later(()=>this.showResults(),this.reducedMotion?500:2200);};
        const id=requestAnimationFrame(t=>{this.animationFrames.delete(id);animate(t);});this.animationFrames.add(id);
    }
    showResults(){this.cleanupRound();const list=document.getElementById('words-list');list.replaceChildren();this.gameWords.forEach((word,index)=>{const item=document.createElement('div');item.className='word-item';item.textContent=`${index+1}. ${word}`;list.append(item);});this.showScreen('results-screen');}
    cleanupRound(){this.cancelled=true;for(const id of this.timers)clearTimeout(id);this.timers.clear();for(const id of this.animationFrames)cancelAnimationFrame(id);this.animationFrames.clear();this.effects?.destroy();this.effects=null;const audio=document.getElementById('countdown-sound');audio.pause();audio.currentTime=0;document.getElementById('countdown').textContent='';document.getElementById('game-area').replaceChildren();}
    exitGame(){this.cleanupRound();this.showScreen('menu-screen');}
    clearSelections(){document.querySelectorAll('#wordlist-container input[type=checkbox]').forEach(v=>v.checked=false);document.getElementById('use-custom-words').checked=false;document.getElementById('custom-words').value='';document.getElementById('custom-words').disabled=true;}
    showScreen(id){document.querySelectorAll('.screen').forEach(v=>v.classList.remove('active'));document.getElementById(id).classList.add('active');}
}
document.addEventListener('DOMContentLoaded',()=>new ScrollerGame());

