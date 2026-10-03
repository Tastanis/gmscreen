(() => {

    'use strict';

    document.querySelectorAll('.report-sheet').forEach(sheet => {

    const data = JSON.parse(sheet.querySelector('.report-data').textContent);

    const blocks = data.reporting_blocks;

    const samples = blocks.map((block, sourceIndex) => {

        const elapsed = ASLChartMath.paceDayFraction(blocks, {...block, sourceIndex}, 'ytd');

        const fraction = block.is_current ? elapsed : ASLChartMath.paceDayFraction(blocks, {...block, sourceIndex}, 'full');

        const points = data.progress[sourceIndex];

        return {fraction, points, noExpectation: block.instructional_days_elapsed > 0 && points != null && ASLChartMath.expectedGrowth(blocks, data.target_count, sourceIndex) === 0, date: block.is_current ? data.today : block.end_date,

            percent: block.instructional_days_elapsed > 0 ? ASLChartMath.scheduledPacePercent(points, blocks, data.target_count, sourceIndex) : null};

    });

    if (blocks[0]?.start_date <= data.today) samples.unshift({fraction:0,points:0,percent:0,date:blocks[0].start_date,baseline:true});

    const renderParticipation = () => {

        const svg = sheet.querySelector('.report-participation-chart');

        const width = 720, height = 150, left = 55, right = 40, top = 14, bottom = 34;

        const percentages = data.participation.percent;
        const indexes = blocks.map((b,i)=>i).filter(i=>blocks[i].instructional_days_elapsed > 0);
        const x = i => left + (indexes.length > 1 ? i/(indexes.length-1) : .5)*(width-left-right);
        const y = v => height-bottom-Number(v)/100*(height-top-bottom);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        let html = `<line x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}" stroke="black"/><line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" stroke="black"/>`;
        for (const value of [0,50,100]) html += `<text x="${left-5}" y="${y(value)+4}" text-anchor="end" class="chart-label">${value}%</text>`;
        let segment=[];
        const flush=()=> {if(segment.length) html+=`<polyline points="${segment.join(' ')}" fill="none" stroke="black" stroke-width="1.5"/>`; segment=[];};
        indexes.forEach((index,i)=> {
            const value=percentages[index]; if(value==null){flush();return;}
            segment.push(`${x(i)},${y(value)}`);
            html+=`<circle cx="${x(i)}" cy="${y(value)}" r="3" fill="white" stroke="black"><title>Block ${index+1}: ${Number(value)}%</title></circle>`;
            if(indexes.length<=6) html+=`<text x="${x(i)}" y="${y(value)+14}" text-anchor="middle" class="chart-label">${Number(value)}%</text>`;
        }); flush();
        indexes.forEach((index,i)=> {if(i===0 || i===indexes.length-1 || indexes.length<=6) html+=`<text x="${x(i)}" y="${height-bottom+28}" text-anchor="middle" class="chart-label">Block ${index+1}</text>`;});
        svg.innerHTML=html;

    };

    const content = sheet.querySelector('.report-content');

    const fit = () => {

        content.style.zoom = 1;

        renderParticipation();

        content.querySelectorAll('.improvement-row, .improvement-group').forEach(el => el.hidden = false);

        sheet.querySelector('.report-omitted')?.remove();

        ASLPaceChart.render(sheet.querySelector('.report-progress-chart'), samples, {height: 300});

        const available = 10.2 * 96 - 2;

        const rows = [...content.querySelectorAll('.improvement-row')];

        let omitted = 0;

        const note = document.createElement('p');

        note.className = 'report-omitted';

        while (content.scrollHeight > available && rows.length) {

            const row = rows.pop(); row.hidden = true; omitted++;

            const group = row.closest('.improvement-group');

            if (![...group.querySelectorAll('.improvement-row')].some(el => !el.hidden)) group.hidden = true;

            note.textContent = `${omitted} additional improved skills omitted from this printed page.`;

            content.querySelector('.report-improvements').append(note);

        }

    };

    fit();

    window.addEventListener('beforeprint', fit);

    });

})();
