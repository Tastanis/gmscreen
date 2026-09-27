"""Build a code-only VTT release archive; never read campaign storage or secrets."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[3]
EXCLUDED = {'storage', 'config', 'tests', '__tests__', 'tools', 'backups', 'backup'}


def build(output: Path):
    version = json.loads((ROOT / 'dnd/data/version.json').read_text(encoding='utf-8'))
    files = [p for p in (ROOT / 'dnd/vtt').rglob('*')
             if p.is_file() and not EXCLUDED.intersection(p.relative_to(ROOT / 'dnd/vtt').parts)
             and p.suffix in {'.php', '.js', '.mjs', '.css', '.svg', '.woff', '.woff2', '.png', '.jpg'}]
    files += [ROOT / name for name in ['dnd/data/version.json', 'docs/dungeon-alchemist-map-import.md',
                                       'docs/vtt-map-runtime-release.md']]
    manifest = {'version': version, 'scope': 'VTT code only; retain server config, database, uploads and other application areas.',
                'files': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for p in sorted(files):
            archive.write(p, p.relative_to(ROOT).as_posix())
        archive.writestr('map-runtime-manifest.json', json.dumps(manifest, indent=2))
    with zipfile.ZipFile(output) as archive:
        for name, digest in manifest['files'].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest
    print(json.dumps({'archive': str(output.resolve()), 'files': len(files), 'version': version['version']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    build(parser.parse_args().output)
