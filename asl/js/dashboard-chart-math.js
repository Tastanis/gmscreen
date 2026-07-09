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

    return { totalInstructionalDays, paceDayFraction, paceEndpoint };
});
