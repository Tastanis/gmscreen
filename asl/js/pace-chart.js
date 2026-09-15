(function () {
    'use strict';
    const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.ASLPaceChart = {
        render(svg, samples) {
            const width = Math.max(280, svg.clientWidth), height = 510;
            const left=58, right=76, top=40, bottom=52, w=width-left-right, h=height-top-bottom;
            const finite=samples.filter(s=>s.percent!==null);
            const upper=Math.max(140,...finite.map(s=>Math.ceil(s.percent/20)*20));
            const y=p=>top+h*(1-ASLChartMath.focusedPosition(p,upper));
            const x=s=>left+w*s.fraction;
            svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
            svg.style.height=height+'px';
            svg.setAttribute('aria-label','Percentage of expected progress over time. Uneven vertical scale: 50 to 100 percent expanded; values below 50 and above 100 compressed.');
            let markup=`<rect width="${width}" height="${height}" class="chart-bg"/><text x="${left}" y="20" class="chart-axis-label">% of expected progress</text>
                <polygon points="${left},${y(0)} ${left},${y(60)} ${left+w},${y(60)} ${left+w},${y(0)}" fill="#f9e8e7"/>`;
            for(const p of [0,50,60,70,80,90,100,upper]) markup+=`<line x1="${left}" x2="${left+w}" y1="${y(p)}" y2="${y(p)}" stroke="#e3e7eb"/><text x="${left-8}" y="${y(p)+4}" text-anchor="end" class="chart-label">${p}%</text>`;
            for(const [p,label,color,dash] of [[100,'A · 100%','#458663',''],[83,'B · 83%','#507ba2','7 5'],[73,'C · 73%','#938052','5 5'],[63,'D · 63%','#a66c69','3 5']]) {
                markup+=`<polyline points="${left},${y(p)} ${left+w},${y(p)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}"/><text x="${left+w+8}" y="${y(p)+4}" class="chart-label">${label}</text>`;
            }
            markup+=`<line x1="${left}" x2="${left}" y1="${top}" y2="${y(0)}" class="chart-axis"/>`;
            for(const p of [50,100]) markup+=`<path d="M ${left-5} ${y(p)+8} l 10 -5 m -10 11 l 10 -5" stroke="#667381" fill="none"/>`;
            let lastLabel='',lastX=-Infinity;
            samples.forEach(s=>{
                const label=new Date(s.date+'T12:00:00').toLocaleDateString(undefined,{month:'short'});
                if(label===lastLabel || x(s)-lastX<(width<480?65:45))return;
                lastLabel=label;lastX=x(s);
                markup+=`<text x="${x(s)}" y="${height-18}" text-anchor="${s.fraction>.95?'end':'middle'}" class="chart-label">${esc(label)}</text>`;
            });
            let previous=null;
            samples.forEach(s=>{
                if(s.percent===null){previous=null;return;}
                if(previous){
                    // Preserve the bends where a segment crosses a compressed-scale boundary.
                    const cuts=[50,100].filter(p=>p>Math.min(previous.percent,s.percent)&&p<Math.max(previous.percent,s.percent))
                        .map(p=>({percent:p,fraction:previous.fraction+(s.fraction-previous.fraction)*(p-previous.percent)/(s.percent-previous.percent)}))
                        .sort((a,b)=>a.fraction-b.fraction);
                    markup+=`<polyline points="${[previous,...cuts,s].map(p=>`${x(p)},${y(p.percent)}`).join(' ')}" class="chart-line" fill="none"/>`;
                }
                const label=`${s.date}: ${s.percent.toFixed(1)}% of expected progress; ${s.points} points earned`;
                markup+=`<circle cx="${x(s)}" cy="${y(s.percent)}" r="4" class="chart-dot"/><circle cx="${x(s)}" cy="${y(s.percent)}" r="12" fill="transparent" aria-label="${esc(label)}"><title>${esc(label)}</title></circle>`;
                previous=s;
            });
            svg.innerHTML=markup;
        }
    };
})();
