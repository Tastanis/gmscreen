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
        const expected = paceEndpoint(targetCount, 2) * fraction;
        return points == null || expected <= 0 ? null : Number(points) / expected * 100;
    }

    // Early blocks are fixed growth goals; later goals share the remaining school days.
    function expectedGrowth(blocks, targetCount, endIndex, elapsedOnly = true) {
        const annual = Math.max(0, Number(targetCount) * 2);
        const start = [0, 8, 8, 10];
        const earlyTotal = blocks.slice(0, 4).reduce((sum, _, i) => sum + start[i], 0);
        const scale = earlyTotal ? Math.min(1, annual / earlyTotal) : 1;
        const remainingDays = totalInstructionalDays(blocks.slice(4));
        let expected = 0;
        blocks.forEach((block, i) => {
            if (i > endIndex) return;
            const days = Number(block.instructional_days || 0);
            const goal = i < 4 ? start[i] * scale : (remainingDays ? Math.max(0, annual - earlyTotal) * days / remainingDays : 0);
            const elapsed = elapsedOnly ? Math.max(0, Math.min(days, Number(block.instructional_days_elapsed || 0))) : days;
            expected += days ? goal * elapsed / days : 0;
        });
        return expected;
    }

    function scheduledPacePercent(points, blocks, targetCount, endIndex) {
        const expected = expectedGrowth(blocks, targetCount, endIndex);
        return points == null || expected <= 0 ? null : Number(points) / expected * 100;
    }

    function focusedPosition(percent, upper = 140) {
        const p = Math.max(0, Number(percent));
        if (p < 50) return .1 * p / 50;
        if (p <= 100) return .1 + .8 * (p - 50) / 50;
        return .9 + .1 * (p - 100) / (Math.max(140, upper) - 100);
    }

    return { expectedGrowth, scheduledPacePercent, totalInstructionalDays, paceDayFraction, paceEndpoint, pacePercent, focusedPosition };
});
