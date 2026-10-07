"""Capture live D&D storage, verify matching source, and prepare an isolated sandbox.

No requests are sent to gameplay endpoints. No production writes or deploys.
Requires Python 3.10+; the local server additionally needs PHP with SQLite.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import datetime as dt
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid

SCHEMA = 'gmscreen-sandbox-capture/v1'
REPO = Path(__file__).resolve().parents[2]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def relative_path(value: str) -> Path:
    parts = value.split('/')
    if not value.startswith('dnd/') or any(
        p in ('', '.', '..') or p.startswith('.') or p.endswith((' ', '.'))
        or re.search(r'[\\:\x00-\x1f<>"|?*]', p)
        or re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', p)
        for p in parts
    ):
        raise ValueError('Unsafe capture path')
    return Path(*parts)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def matching_code(path: Path, expected: str) -> bytes:
    data = path.read_bytes()
    # Git checkouts on Windows commonly use CRLF while deployment uses LF.
    # Accept only a conversion whose bytes match the exact deployed SHA-256.
    lf = data.replace(b'\r\n', b'\n')
    for candidate in (data, lf, lf.replace(b'\n', b'\r\n')):
        if hashlib.sha256(candidate).hexdigest() == expected:
            return candidate
    raise ValueError('Source code differs from deployment')


def validate_manifest(data: dict) -> dict:
    if data.get('schema') != SCHEMA or not isinstance(data.get('files'), dict) or not data['files']:
        raise ValueError('Invalid or empty manifest')
    seen = set()
    for path, item in data['files'].items():
        relative_path(path)
        if path.casefold() in seen:
            raise ValueError('Case-colliding files cannot be restored on Windows')
        seen.add(path.casefold())
        if item.get('kind') not in ('file', 'code', 'sqlite') or not re.fullmatch('[a-f0-9]{64}', item.get('sha256', '')):
            raise ValueError('Invalid manifest entry')
        if type(item.get('size')) is not int or item['size'] < 0:
            raise ValueError('Invalid file length')
    return data


class Connection:
    def __init__(self, site: str, token: str, *, loopback=False):
        parsed = urllib.parse.urlsplit(site)
        local = loopback and parsed.hostname in ('127.0.0.1', 'localhost', '::1')
        if (parsed.scheme != 'https' and not (local and parsed.scheme == 'http')) or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path.rstrip('/') != '/dnd':
            raise ValueError('Use an HTTPS D&D URL without credentials or query parameters')
        if not parsed.hostname or len(token) < 32 or '\n' in token or '\r' in token:
            raise ValueError('Invalid site or token')
        self.site = site.rstrip('/')
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def open(self, params):
        url = self.site + '/admin/sandbox-export/index.php?' + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={
            'X-DND-Capture-Token': self.token, 'Cache-Control': 'no-cache',
            'User-Agent': 'GM-Screen-Sandbox-Capture/1.0',
        })
        return self.opener.open(request, timeout=180)

    def manifest(self):
        with self.open({'action': 'manifest'}) as response:
            return validate_manifest(json.load(response))

    def download(self, path, item, destination):
        with self.open({'action': 'file', 'path': path, 'sha256': item['sha256']}) as response, destination.open('xb') as out:
            remaining = item['size']
            while chunk := response.read(min(1024 * 1024, remaining + 1)):
                remaining -= len(chunk)
                if remaining < 0:
                    raise ValueError('Download exceeded declared length')
                out.write(chunk)
        if remaining != 0 or digest(destination) != item['sha256']:
            raise ValueError('Download integrity mismatch')


def capture(connection, output: Path) -> Path:
    output = output.resolve()
    if output == REPO or output.is_relative_to(REPO / 'dnd'):
        raise ValueError('Capture into a separate directory, never the source application')
    output.mkdir(parents=True, exist_ok=True)
    first = connection.manifest()
    stage = output / ('capture-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    stage.mkdir()
    try:
        for path, item in first['files'].items():
            if item['kind'] == 'code':
                continue
            destination = stage / 'data' / relative_path(path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            connection.download(path, item, destination)
            if item['kind'] == 'sqlite':
                with closing(sqlite3.connect(destination.as_uri() + '?mode=ro', uri=True)) as db:
                    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                        raise ValueError('Captured SQLite failed integrity check')
        last = connection.manifest()
        for key in ('files', 'issues', 'excluded', 'environment'):
            if first.get(key) != last.get(key):
                raise ValueError('The site changed during capture; wait for an idle period and retry')
        first['source_site'] = connection.site
        first['verified_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
        (stage / 'manifest.json').write_text(json.dumps(first, indent=2), encoding='utf-8')
        (stage / '.complete-capture').write_text(SCHEMA, encoding='utf-8')
        # The last working pointer is untouched by failed captures.
        pointer = output / ('.latest-' + uuid.uuid4().hex + '.tmp')
        pointer.write_text(json.dumps({'path': str(stage)}), encoding='utf-8')
        pointer.replace(output / 'latest-capture.json')
        return stage
    except Exception:
        (stage / 'FAILED.txt').write_text('Incomplete capture. Not suitable for sandbox use. Retry while the game is idle.\n', encoding='utf-8')
        raise


def reference_issues(capture_dir: Path, manifest: dict) -> list[dict]:
    """Check explicit saved media references; never fetch an arbitrary remote URL."""
    origin = urllib.parse.urlsplit(manifest['source_site'])
    found = set()
    media = r'\.(?:png|jpe?g|gif|webp|bmp|svg|avif|pdf|mp3|ogg|wav|mp4|webm|glb|gltf)(?:[?#][^\s\"<>]*)?'
    pattern = re.compile(r'(?:https?://|/dnd/)[^\s\"<>]+?' + media + r'(?=$|[\s\"<>])', re.I)

    def inspect(text, source):
        for match in pattern.finditer(text.replace('\\/', '/')):
            url = match.group(0)
            parsed = urllib.parse.urlsplit(url)
            if parsed.netloc and parsed.netloc != origin.netloc:
                found.add((source, url, 'external-media-not-captured'))
                continue
            path = urllib.parse.unquote(parsed.path).lstrip('/')
            if path not in manifest['files']:
                found.add((source, url, 'missing-media'))

    for path, item in manifest['files'].items():
        local = capture_dir / 'data' / relative_path(path)
        if item['kind'] == 'file' and path.endswith('.json'):
            # Validate saved JSON too: partial/truncated JSON must not become a baseline.
            value = json.loads(local.read_text(encoding='utf-8-sig'))
            inspect(json.dumps(value, ensure_ascii=False), path)
        elif item['kind'] == 'sqlite':
            with closing(sqlite3.connect(local.as_uri() + '?mode=ro', uri=True)) as db:
                for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
                    quoted = '"' + table.replace('"', '""') + '"'
                    for row in db.execute('SELECT * FROM ' + quoted):
                        for cell in row:
                            if isinstance(cell, str):
                                inspect(cell, path)
    return [{'source': source, 'reference': url, 'reason': reason} for source, url, reason in sorted(found)]


def prepare(capture_dir: Path, source: Path, output: Path) -> Path:
    capture_dir, source, output = capture_dir.resolve(), source.resolve(), output.resolve()
    if not (capture_dir / '.complete-capture').is_file():
        raise ValueError('Not a completed capture')
    manifest = validate_manifest(json.loads((capture_dir / 'manifest.json').read_text(encoding='utf-8')))
    if manifest.get('issues'):
        raise ValueError('Resolve capture coverage issues in manifest.json before preparing a sandbox')
    if output == source or output.is_relative_to(source / 'dnd') or output.is_relative_to(capture_dir):
        raise ValueError('Sandbox must be separate from source and the immutable capture')
    mismatches = []
    for path, item in manifest['files'].items():
        candidate = (source if item['kind'] == 'code' else capture_dir / 'data') / relative_path(path)
        if candidate.is_symlink() or not candidate.is_file() or not candidate.resolve().is_relative_to((source if item['kind'] == 'code' else capture_dir / 'data').resolve()):
            mismatches.append(path)
            continue
        if item['kind'] == 'code':
            try:
                matching_code(candidate, item['sha256'])
            except ValueError:
                mismatches.append(path)
        elif digest(candidate) != item['sha256']:
            mismatches.append(path)
    if mismatches:
        report = capture_dir / 'mismatches.json'
        report.write_text(json.dumps(mismatches, indent=2), encoding='utf-8')
        raise ValueError(f'Code or capture mismatch in {len(mismatches)} files; see {report}')
    references = reference_issues(capture_dir, manifest)
    (capture_dir / 'reference-issues.json').write_text(json.dumps(references, indent=2), encoding='utf-8')
    if references:
        raise ValueError('Saved media references are missing or external; see reference-issues.json before preparing')
    output.mkdir(parents=True, exist_ok=True)
    app = output / ('sandbox-' + uuid.uuid4().hex[:12])
    app.mkdir()
    for path, item in manifest['files'].items():
        origin = (source if item['kind'] == 'code' else capture_dir / 'data') / relative_path(path)
        dest = app / relative_path(path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if item['kind'] == 'code':
            dest.write_bytes(matching_code(origin, item['sha256']))
        else:
            shutil.copyfile(origin, dest)
        if digest(dest) != item['sha256']:
            raise ValueError('A source file changed while preparing the sandbox; retry')
    # Explicit, recorded isolation changes. Never copy a production private config.
    pusher = app / 'dnd/vtt/config/pusher.php'
    pusher.parent.mkdir(parents=True, exist_ok=True)
    pusher.write_text("<?php return ['enabled'=>false];\n", encoding='utf-8')
    database = app / 'dnd/includes/database-config.php'
    database.parent.mkdir(parents=True, exist_ok=True)
    database.write_text("<?php class DatabaseConfig { public static function getConnection() { throw new RuntimeException('MySQL disabled in JSON sandbox'); } }\n", encoding='utf-8')
    (app / 'sessions').mkdir()
    router = Path(__file__).with_name('sandbox-router.php')
    shutil.copyfile(router, app / 'router.php')
    origin = urllib.parse.urlsplit(manifest['source_site'])
    settings = {'source_origin': origin.scheme + '://' + origin.netloc, 'world_id': manifest.get('environment', {}).get('world_id', 'default')}
    (app / 'sandbox-settings.json').write_text(json.dumps(settings), encoding='utf-8')
    (app / 'sandbox-report.json').write_text(json.dumps({
        'capture': str(capture_dir), 'verified_at': manifest['verified_at'],
        'status': 'prepared; browser/gameplay verification required',
        'overrides': ['Pusher disabled', 'MySQL disabled (JSON storage declaration required)', 'Separate sessions', 'Loopback router; production-origin URLs localized in responses', 'Browser CSP blocks external connections except listed read-only CDNs'],
        'limitations': manifest.get('limitations', []),
    }, indent=2), encoding='utf-8')
    (app / '.gmscreen-captured-sandbox').write_text(SCHEMA, encoding='utf-8')
    return app


def serve(app: Path, php: str, port: int):
    app = app.resolve()
    if not (app / '.gmscreen-captured-sandbox').is_file():
        raise ValueError('Only a prepared, isolated sandbox may be served')
    executable = shutil.which(php)
    if not executable or not 1024 <= port <= 65535:
        raise ValueError('PHP executable or port unavailable')
    settings = json.loads((app / 'sandbox-settings.json').read_text())
    env = {k: v for k, v in os.environ.items() if not k.startswith(('VTT_', 'DND_CAPTURE_'))}
    env.update(VTT_SYNC_V2_PUSHER_ENABLED='0', VTT_SYNC_V2_WORLD_ID=settings['world_id'])
    args = [executable]
    if os.name == 'nt':
        args += ['-d', 'extension_dir=' + str(Path(executable).parent / 'ext'), '-d', 'extension=sqlite3', '-d', 'extension=pdo_sqlite']
    args += ['-d', 'allow_url_fopen=0', '-d', 'allow_url_include=0', '-d', 'display_errors=0',
             '-d', 'session.save_path=' + str(app / 'sessions'),
             '-d', 'disable_functions=mail,curl_exec,curl_multi_exec,fsockopen,pfsockopen,stream_socket_client,exec,shell_exec,system,passthru,proc_open,popen',
             '-S', f'127.0.0.1:{port}', '-t', str(app), str(app / 'router.php')]
    print(f'Local sandbox: http://127.0.0.1:{port}/dnd/ (Ctrl+C to stop)')
    subprocess.run(args, cwd=app, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    get = sub.add_parser('capture')
    get.add_argument('--site', default='https://bharmsasl.com/dnd')
    get.add_argument('--output', type=Path, required=True)
    build = sub.add_parser('prepare')
    build.add_argument('--capture', type=Path, required=True)
    build.add_argument('--source', type=Path, default=REPO)
    build.add_argument('--output', type=Path, required=True)
    run = sub.add_parser('serve')
    run.add_argument('--app', type=Path, required=True)
    run.add_argument('--php', default='php')
    run.add_argument('--port', type=int, default=18790)
    key = sub.add_parser('key')
    key.add_argument('--output', type=Path, required=True, help='New private directory, never inside a repository or web root')
    args = parser.parse_args()
    if args.command == 'capture':
        token = os.environ.pop('DND_CAPTURE_TOKEN', None) or getpass.getpass('Capture token (not saved): ')
        result = capture(Connection(args.site, token), args.output)
        print(f'Verified capture: {result}\nReview manifest.json coverage issues before preparing.')
    elif args.command == 'prepare':
        print('Prepared sandbox: ' + str(prepare(args.capture, args.source, args.output)))
    elif args.command == 'serve':
        serve(args.app, args.php, args.port)
    elif args.command == 'key':
        folder = args.output.resolve()
        if folder.is_relative_to(REPO):
            raise ValueError('Private access files must be outside this repository')
        folder.mkdir(parents=True, exist_ok=False)
        token = secrets.token_urlsafe(48)
        (folder / 'capture-token.txt').write_text(token, encoding='utf-8')
        example = REPO / 'dnd/admin/sandbox-export/private-config.example.php'
        config = example.read_text(encoding='utf-8').replace("'token_sha256' => ''", "'token_sha256' => '" + hashlib.sha256(token.encode()).hexdigest() + "'")
        (folder / 'dnd-sandbox-export.php').write_text(config, encoding='utf-8')
        for path in folder.iterdir():
            path.chmod(0o600)
        print('Private token and server configuration created. Do not upload capture-token.txt or commit either file.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Stopped.', file=sys.stderr)
    except Exception as error:
        # Do not print request headers, tokens or server response bodies.
        print(f'Capture tool stopped: {error}', file=sys.stderr)
        sys.exit(1)
