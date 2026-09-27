<?php
declare(strict_types=1);

/** Version transitive modules as well as entrypoints; no web-server rewrite needed. */
final class ModuleAssets
{
    public static function importMap(string $directory, int $build): array
    {
        $imports = [];
        $root = rtrim(str_replace('\\', '/', $directory), '/');
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)) as $file) {
            if (!$file->isFile() || !in_array($file->getExtension(), ['js','mjs'], true)) continue;
            $relative = substr(str_replace('\\', '/', $file->getPathname()), strlen($root) + 1);
            if (str_contains($relative, '__tests__/')) continue;
            $url = '/dnd/vtt/assets/js/' . $relative;
            $imports[$url] = $url . '?v=' . $build;
        }
        ksort($imports);
        return ['imports'=>$imports];
    }
}
