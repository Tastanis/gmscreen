<?php
// One line added to a small log that must not grow for ever. Past its limit the older half of the file is dropped,
// from the start of a whole line, so the newest lines are always there in order.
function cappedLogLine(string $file, string $line, int $limit = 262144): void
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
            $cut = strpos($tail, "\n");
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
