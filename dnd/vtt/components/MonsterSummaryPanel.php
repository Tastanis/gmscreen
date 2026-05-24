<?php
declare(strict_types=1);

/**
 * Compatibility shim for deployments that briefly referenced a monster
 * summary panel during the reverted monster automation work.
 */
function renderVttMonsterSummaryPanel(): string
{
    return '';
}
