<?php
// One line added to one of the small logs beside the schedule's data (who loaded it, who saved what, week changes).
// They were added to on every request and never shortened. Past a quarter of a megabyte the older half is dropped,
// so the newest couple of thousand lines are always there and the file never grows beyond that.
function scheduleLogLine(string $file, string $line, int $limit = 262144): void
{
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return;
    }
    try {
        if (!flock($handle, LOCK_EX)) {
            return;
        }
        $size = (int) (fstat($handle)['size'] ?? 0);
        if ($size > $limit) {
            fseek($handle, $size - intdiv($limit, 2));
            $tail = (string) stream_get_contents($handle);
            $cut = strpos($tail, "\n");                           // from the start of a whole line
            $tail = $cut === false ? '' : substr($tail, $cut + 1);
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, $tail);
        }
        fseek($handle, 0, SEEK_END);
        fwrite($handle, $line);
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}
