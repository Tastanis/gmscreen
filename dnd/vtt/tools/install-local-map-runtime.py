"""Install a verified code archive into a marked local fixture; preserve all state."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[3]


def install(package: Path, app: Path, sandbox_version=None, sandbox_build=None):
    app = app.resolve()
    if not app.is_relative_to((ROOT / '.playwright-mcp').resolve()) or not (app / '.gmscreen-test-app').is_file():
        raise ValueError('Target must be a marked disposable/local runtime under .playwright-mcp.')
    current_path = app / 'dnd/data/version.json'
    current = json.loads(current_path.read_text()) if current_path.exists() else {}
    if sandbox_build is not None and sandbox_build < current.get('build_number', 0):
        raise ValueError('Refusing to lower the sandbox build.')
    with zipfile.ZipFile(package) as archive:
        manifest = json.loads(archive.read('map-runtime-manifest.json'))
        entries = []
        for name, digest in manifest['files'].items():
            relative = Path(name)
            target = (app / relative).resolve()
            if not target.is_relative_to(app) or {'storage', 'config', 'backups'}.intersection(relative.parts):
                raise ValueError('Archive contains a protected path.')
            if not (name.startswith('dnd/vtt/') or name.startswith('docs/') or name == 'dnd/data/version.json'):
                raise ValueError('Archive contains an unsupported path.')
            data = archive.read(name)
            if hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Archive checksum mismatch: ' + name)
            entries.append((target, data))
        for target, data in entries:
            if target == app / 'dnd/data/version.json' and sandbox_version:
                version = json.loads(data)
                current = json.loads(target.read_text()) if target.exists() else {}
                if sandbox_build < current.get('build_number', 0):
                    raise ValueError('Refusing to lower the sandbox build.')
                version.update(version=sandbox_version, build_number=sandbox_build)
                data = (json.dumps(version, indent=2) + '\n').encode()
            # Unchanged PHP endpoints may be open in the running local server.
            # Avoid replacing them; changed files still use atomic replacement.
            if target.is_file() and target.read_bytes() == data:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + '.install-part')
            temporary.write_bytes(data)
            temporary.replace(target)
    print(json.dumps({'app': str(app), 'files': len(entries), 'state': 'database, uploads and config untouched'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--sandbox-version')
    parser.add_argument('--sandbox-build', type=int)
    args = parser.parse_args()
    if bool(args.sandbox_version) != (args.sandbox_build is not None):
        parser.error('Specify both sandbox version and build, or neither.')
    install(args.package, args.app, args.sandbox_version, args.sandbox_build)
