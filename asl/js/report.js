(() => {
    'use strict';
    document.querySelectorAll('.report-sheet').forEach(sheet => {
    const data = JSON.parse(sheet.querySelector('.report-data').textContent);
    const blocks = data.reporting_blocks;
    const samples = blocks.map((block, sourceIndex) => {
        const elapsed = ASLChartMath.paceDayFraction(blocks, {...block, sourceIndex}, 'ytd');
        const fraction = block.is_current ? elapsed : ASLChartMath.paceDayFraction(blocks, {...block, sourceIndex}, 'full');
        const points = data.progress[sourceIndex];
        return {fraction, points, date: block.is_current ? data.today : block.end_date,
            percent: block.instructional_days_elapsed > 0 ? ASLChartMath.pacePercent(points, data.target_count, elapsed) : null};
    });
    if (blocks[0]?.start_date <= data.today) samples.unshift({fraction:0,points:0,percent:0,date:blocks[0].start_date,baseline:true});
    const content = sheet.querySelector('.report-content');
    const fit = () => {
        content.style.zoom = 1;
        ASLPaceChart.render(sheet.querySelector('.report-progress-chart'), samples, {height: 200});
        const available = 10.2 * 96 - 2;
        if (content.scrollHeight > available) content.style.zoom = available / content.scrollHeight;
    };
    fit();
    window.addEventListener('beforeprint', fit);
    });
})();
