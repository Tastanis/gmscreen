<?php
declare(strict_types=1);

/** Replace one JSON document without exposing a truncated destination to readers. */
final class AtomicJsonFile
{
    public static function write(string $path, array $data): bool
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        $temporary = tempnam(dirname($path), '.character-save-');
        if ($temporary === false) throw new RuntimeException('Cannot create character save file.');
        $stream = null;
        try {
            if (realpath(dirname($temporary)) !== realpath(dirname($path))) throw new RuntimeException('Character save must use the destination directory.');
            $stream = fopen($temporary, 'wb');
            if ($stream === false) throw new RuntimeException('Cannot open character save file.');
            $offset = 0;
            while ($offset < strlen($json)) {
                $written = fwrite($stream, substr($json, $offset));
                if ($written === false || $written === 0) throw new RuntimeException('Cannot finish character save.');
                $offset += $written;
            }
            if (!fflush($stream) || (function_exists('fsync') && !fsync($stream))) throw new RuntimeException('Cannot flush character save.');
            fclose($stream); $stream = null;
            if (is_file($path)) @chmod($temporary, fileperms($path) & 0777);
            if (!rename($temporary, $path)) throw new RuntimeException('Cannot replace character save.');
            return true;
        } finally {
            if (is_resource($stream)) fclose($stream);
            if (is_file($temporary)) unlink($temporary);
        }
    }
}
