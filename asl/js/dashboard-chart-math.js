(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ASLChartMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function totalInstructionalDays(blocks) {
        return blocks.reduce((sum, block) => sum + Number(block.instructional_days || 0), 0);
    }

    function paceDayFraction(blocks, block, range) {
        const total = totalInstructionalDays(blocks);
        if (!total || !block) return 0;
        const endIndex = Number.isInteger(block.sourceIndex) ? block.sourceIndex : blocks.indexOf(block);
        if (endIndex < 0) return 0;
        let elapsed = 0;
        for (let index = 0; index <= endIndex; index++) {
            const candidate = blocks[index];
            let days = Number(candidate.instructional_days || 0);
            if (range !== 'full' && candidate.is_current) {
                days = Number(candidate.instructional_days_elapsed || 0);
            }
            elapsed += days;
        }
        return Math.min(1, elapsed / total);
    }

    function paceEndpoint(targetCount, averageScore) {
        return Number(targetCount || 0) * Number(averageScore || 0);
    }

    function pacePercent(points, targetCount, fraction) {
        const expected = paceEndpoint(targetCount, 3) * fraction;
        return points == null || expected <= 0 ? null : Number(points) / expected * 100;
    }

    function focusedPosition(percent, upper = 140) {
        const p = Math.max(0, Number(percent));
        if (p < 50) return .1 * p / 50;
        if (p <= 100) return .1 + .8 * (p - 50) / 50;
        return .9 + .1 * (p - 100) / (Math.max(140, upper) - 100);
    }

    return { totalInstructionalDays, paceDayFraction, paceEndpoint, pacePercent, focusedPosition };
});
