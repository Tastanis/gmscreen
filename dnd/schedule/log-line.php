<?php
// One line added to one of the small logs beside the schedule's data (who loaded it, who saved what, week changes).
// They were added to on every request and never shortened. Past a quarter of a megabyte the older half is dropped
// (includes/capped-log.php), so the newest couple of thousand lines are always there and the file stops growing.
require_once __DIR__ . '/../includes/capped-log.php';

function scheduleLogLine(string $file, string $line, int $limit = 262144): void
{
    cappedLogLine($file, $line, $limit);
}
