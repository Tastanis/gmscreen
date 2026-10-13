<?php
declare(strict_types=1);

/**
 * Storing and deleting the pictures people upload, in one place.
 *
 * The site's upload handlers were each written by hand, and most made the same three mistakes (the tester's
 * sweep and the audit that followed, October 14, 2026):
 *  - they kept the ENDING of the name the uploader gave the file, and judged what the file was by what the
 *    browser said it was. A file called x.php sent as "image/png" was stored as x.php;
 *  - they put a value from the request (an item's id, a hex's id) into the file's path as it came, so "../"
 *    in it walked out of the folder;
 *  - their folders had no rule against running what was stored in them.
 * And some deleted, or copied, whatever path was written in an item's "picture" field, which the same request
 * could set: any file the site could reach.
 *
 * Here a picture is judged by its content, named by the site, and stored in a folder that runs nothing; and
 * only a picture inside a handler's own folder is ever deleted or copied.
 */
final class PictureStore
{
    /** The kinds of picture taken, by the ending they are stored under. */
    public const KINDS = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    public const ENDINGS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    /** The rules every upload folder is given: the portraits folder's own, which the host accepts. */
    private const RULES = "# Uploaded pictures. Static images only: nothing in this folder is ever run.\n"
        . "# Written by dnd/includes/picture-store.php, the same way as dnd/portraits/.htaccess, which this host accepts.\n"
        . "Options -ExecCGI -Indexes\n"
        . "<FilesMatch \"(?i)\\.(php[0-9]?|phtml|phar|cgi|pl|py|sh|shtml)(\\.|$)\">\n"
        . "    Require all denied\n"
        . "</FilesMatch>\n"
        . "RemoveHandler .png .jpg .jpeg .gif .bmp .webp\n";

    /** The ending for the kind of picture a file really is, read from its content; null when it is not one. */
    public static function endingOf(string $path): ?string
    {
        if (!is_file($path) || !is_readable($path)) return null;
        $mime = null;
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) { $mime = finfo_file($finfo, $path) ?: null; finfo_close($finfo); }
        }
        $size = @getimagesize($path);
        $fromSize = is_array($size) ? ($size['mime'] ?? null) : null;
        // Both readings must call it a picture of a kind taken, and the same kind.
        if ($fromSize === null || !isset(self::KINDS[$fromSize])) return null;
        if ($mime !== null && $mime !== $fromSize) return null;
        return self::KINDS[$fromSize];
    }

    /** A value from a request as a piece of a file name: letters, digits, "_" and "-", or null. Never a folder. */
    public static function namePart($value, int $max = 100): ?string
    {
        if (is_int($value)) $value = (string) $value;
        if (!is_string($value) || preg_match('/^[A-Za-z0-9_-]{1,' . $max . '}$/D', $value) !== 1) return null;
        return $value;
    }

    /**
     * A record's id as a piece of a file name: everything but letters, digits, "_" and "-" dropped. For ids the
     * site made long ago, which a stricter check would turn away. Null when nothing is left.
     */
    public static function plainPart($value, int $max = 100): ?string
    {
        if (!is_string($value) && !is_int($value)) return null;
        $plain = substr((string) preg_replace('/[^A-Za-z0-9_-]/', '', (string) $value), 0, $max);
        return $plain === '' ? null : $plain;
    }

    /** The rule file's text, for the test that holds the folders' own copies to it. */
    public static function rules(): string
    {
        return self::RULES;
    }

    /** Puts the rule file in an upload folder, making the folder if need be. */
    public static function prepare(string $dir): void
    {
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException('The pictures folder could not be made.');
        $rules = rtrim($dir, '/\\') . '/.htaccess';
        if (!is_file($rules)) @file_put_contents($rules, self::RULES);
    }

    /**
     * Stores one uploaded picture in $dir as "<$name>.<its real ending>" and returns that file name.
     * $file is the entry of $_FILES; $name is the site's own name for it (a namePart, or pieces joined with "_").
     * Throws InvalidArgumentException with words fit to show when the upload is not a picture, is too big, or
     * $name is not a plain name.
     */
    public static function store(array $file, string $dir, string $name, int $maxBytes = 5242880): string
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null)) throw new InvalidArgumentException('The upload did not arrive.');
        if (!is_uploaded_file($file['tmp_name'])) throw new InvalidArgumentException('The upload did not arrive.');
        if ((int) ($file['size'] ?? 0) > $maxBytes || filesize($file['tmp_name']) > $maxBytes) throw new InvalidArgumentException('The picture is too large (the most is ' . (int) round($maxBytes / 1048576) . ' MB).');
        if (self::namePart($name, 200) === null) throw new InvalidArgumentException('That is not something a picture can be stored for.');
        $ending = self::endingOf($file['tmp_name']);
        if ($ending === null) throw new InvalidArgumentException('That file is not a picture (JPEG, PNG, GIF or WebP).');
        self::prepare($dir);
        $stored = $name . '.' . $ending;
        if (!move_uploaded_file($file['tmp_name'], rtrim($dir, '/\\') . '/' . $stored)) throw new RuntimeException('The picture could not be saved.');
        return $stored;
    }

    /**
     * The real path of a picture a handler's data points at, if it is a picture file inside that handler's own
     * folder; null otherwise. $stored is whatever is written in the data ("images/x.png", "/dnd/images/x.png",
     * a full path): only its last part is used, so nothing outside $dir can be named.
     */
    public static function owned(string $dir, $stored): ?string
    {
        if (!is_string($stored) || $stored === '') return null;
        $name = basename(str_replace('\\', '/', $stored));
        // (.bmp too: nothing new is stored as one, but older pictures were.)
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._ -]{0,180}\.(?:jpe?g|png|gif|webp|bmp)$/iD', $name) !== 1) return null;
        $folder = realpath($dir);
        $path = $folder === false ? false : realpath($folder . DIRECTORY_SEPARATOR . $name);
        if ($path === false || !is_file($path) || dirname($path) !== $folder) return null;
        return $path;
    }

    /** Deletes a picture a handler's data points at, if it is one of its own. True when a file was removed. */
    public static function remove(string $dir, $stored): bool
    {
        $path = self::owned($dir, $stored);
        return $path !== null && @unlink($path);
    }
}
