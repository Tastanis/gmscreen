"""Pull current V2 state and build a disposable localhost app; never submit board commands."""
from __future__ import annotations

import argparse
from contextlib import closing
import getpass
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SCHEMA = 'gmscreen-vtt-diagnostic/v1'
SOURCE_ROOT = Path(__file__).resolve().parents[3]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def isolated_target(root: Path, configured: str) -> Path:
    target = (root / configured).resolve()
    if target == SOURCE_ROOT or target.is_relative_to(SOURCE_ROOT / 'dnd'):
        raise ValueError('The source application cannot be a diagnostic data target.')
    if not (target / '.gmscreen-test-data').is_file():
        raise ValueError('Run the asset sync first; the data target must have its isolation sentinel.')
    return target


def validate_snapshot(payload: dict) -> dict:
    snapshot = payload.get('snapshot')
    if payload.get('success') is not True or not isinstance(snapshot, dict):
        raise ValueError('The authenticated server did not return a V2 snapshot.')
    if type(snapshot.get('revision')) is not int or snapshot['revision'] < 0:
        raise ValueError('Invalid snapshot revision.')
    state = snapshot.get('state')
    if not isinstance(state, dict) or not isinstance(state.get('placements'), (dict, list)):
        raise ValueError('Missing canonical placement state.')
    return snapshot


def connect(site: str, username: str, password: str):
    parsed = urllib.parse.urlsplit(site)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.query or parsed.fragment:
        raise ValueError('Diagnostic source must be an HTTPS site URL without credentials or query.')
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [('User-Agent', 'GM-Screen-Diagnostic/1.0')]
    with opener.open(site + '/index.php', timeout=60) as response:
        response.read()
    form = urllib.parse.urlencode({'username': username, 'password': password}).encode()
    try:
        with opener.open(urllib.request.Request(site + '/index.php', data=form, headers={'Referer': site + '/index.php'}), timeout=60) as response:
            response.read()
    except urllib.error.HTTPError as error:
        if error.code not in (302, 303):
            raise RuntimeError(f'GM login failed (HTTP {error.code}).') from None

    def get(relative: str) -> bytes:
        # No caller-controlled remote host, credentials in URLs, or redirect following.
        if not relative.startswith('/') or '..' in relative or '://' in relative:
            raise ValueError('Invalid diagnostic endpoint.')
        try:
            with opener.open(site + relative, timeout=180) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            raise RuntimeError(f'Diagnostic read of {relative} failed (HTTP {error.code}).') from None

    # A GM-only GET verifies role before exporting anything. Merely obtaining
    # a session cookie is not evidence that the account has GM projection.
    scenes = json.loads(get('/vtt/api/scenes.php'))
    if scenes.get('success') is not True:
        raise RuntimeError('GM session required for a complete diagnostic export.')
    return get


def import_snapshot(snapshot: dict, destination: Path):
    if destination.exists():
        raise ValueError('Import requires a new disposable database, never an existing world.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(destination)) as db, db:
        db.execute('CREATE TABLE vtt_world_state (world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>=0), state_json TEXT NOT NULL, updated_at INTEGER NOT NULL)')
        db.execute('INSERT INTO vtt_world_state VALUES (?,?,?,?)', ('default', snapshot['revision'], json.dumps(snapshot['state']), snapshot.get('serverTime', 0)))
    # SyncV2Store initializes the remaining tables on first local request.


def build_app(root: Path, data: Path, export: dict) -> Path:
    runtime = root / 'runtime'
    runtime.mkdir(exist_ok=True)
    app = runtime / ('vtt-' + time.strftime('%Y%m%d-%H%M%S') + '-' + str(time.time_ns() % 1000000))
    app.mkdir()
    (app / '.gmscreen-test-app').write_text('Disposable current-source VTT; localhost only.\n')
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', 'dnd'], cwd=SOURCE_ROOT, text=True).splitlines()
    for name in files:
        relative = Path(name)
        if relative.suffix not in ('.php', '.js', '.mjs', '.css', '.svg', '.json'):
            continue
        if any(part in relative.parts for part in ('backups', 'backup', 'ai-reference', 'storage', 'data', '__tests__')):
            continue
        if name in ('dnd/vtt/config/pusher.php', 'dnd/index.php'):
            continue
        source = SOURCE_ROOT / relative
        dest = app / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    for source in (data / 'dnd').rglob('*.json'):
        if source.name == 'board-state.json' or 'backups' in source.parts:
            continue
        relative = source.relative_to(data)
        dest = app / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    (app / 'dnd/data').mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_ROOT / 'dnd/data/version.json', app / 'dnd/data/version.json')
    (app / 'dnd/vtt/config/pusher.php').write_text("<?php return ['enabled'=>false];\n")
    login = """<?php
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true)) { http_response_code(403); exit; }
session_start(); $user = $_GET['user'] ?? 'GM';
if (!in_array($user, ['GM','cal','sharon','indigo','zepha'], true)) { http_response_code(400); exit; }
$_SESSION['logged_in']=true; $_SESSION['user']=$user; header('Location: /dnd/vtt/');
"""
    (app / 'test-login.php').write_text(login)
    (app / 'dnd/index.php').write_text("<?php header('Location: /test-login.php');\n")
    media_root = json.dumps(data.as_posix())
    (app / 'router.php').write_text("""<?php
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'],true)) {http_response_code(403);return true;}
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH) ?? '');
if (str_contains($path,'..') || str_contains($path, "\\\\")) {http_response_code(400);return true;}
if (preg_match('#^/dnd/.*\\.(png|jpe?g|webp|gif|bmp|pdf)$#i',$path)) {
 $root=MEDIA_ROOT; $file=realpath($root.$path);
 if ($file && str_starts_with(str_replace('\\\\','/',$file),$root.'/') && is_file($file)) {
  $ext=strtolower(pathinfo($file,PATHINFO_EXTENSION));header('Content-Type: '.($ext==='pdf'?'application/pdf':'image/'.($ext==='jpg'?'jpeg':$ext)));readfile($file);return true;
 }
}
return false;
""".replace('MEDIA_ROOT', media_root))
    (app / 'sessions').mkdir()
    import_snapshot(export['snapshot'], app / 'dnd/vtt/storage/sync-v2.sqlite')
    metadata = {k: v for k, v in export.items() if k != 'snapshot'}
    metadata['local_source_commit'] = subprocess.check_output(['git','rev-parse','HEAD'],cwd=SOURCE_ROOT,text=True).strip()
    metadata['local_source_dirty'] = bool(subprocess.check_output(['git','status','--porcelain','--','dnd'],cwd=SOURCE_ROOT,text=True).strip())
    (app / 'diagnostic-manifest.json').write_text(json.dumps(metadata, indent=2))
    pointer = runtime / 'current-vtt-app.json'
    temporary = pointer.with_suffix('.part')
    temporary.write_text(json.dumps({'path':str(app), 'revision':export['snapshot']['revision']},indent=2))
    temporary.replace(pointer)
    return app


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnostic-root', type=Path, required=True)
    parser.add_argument('--skip-assets', action='store_true')
    parser.add_argument('--offline-export', type=Path)
    parser.add_argument('--username', default='harms')
    args=parser.parse_args()
    root=args.diagnostic_root.resolve()
    config=json.loads((root/'config/local-sync.json').read_text(encoding='utf-8-sig'))
    if config.get('confirm_isolated_test_data') is not True:
        raise ValueError('The diagnostic configuration must confirm isolated test data.')
    if not args.skip_assets and not args.offline_export:
        php=shutil.which('php')
        if not php: raise RuntimeError('PHP is required for the existing asset downloader.')
        extension=Path(php).parent/'ext'
        subprocess.run([php,'-d',f'extension_dir={extension}','-d','extension=openssl',str(root/'tools/sync.php')],cwd=root,check=True)
    data=isolated_target(root,str(config['target_test_data_dir']))
    if args.offline_export:
        export=json.loads(args.offline_export.read_text())
        if export.get('schema') != SCHEMA: raise ValueError('Unsupported diagnostic export schema.')
        validate_snapshot({'success':True,'snapshot':export.get('snapshot')})
    else:
        password=os.environ.pop('VTT_DIAGNOSTIC_PASSWORD',None) or getpass.getpass('GM password (not saved): ')
        site=str(config['site_url']).rstrip('/')
        get=connect(site,args.username,password)
        del password
        snapshot=validate_snapshot(json.loads(get('/vtt/api/v2/snapshot.php')))
        source_path='/vtt/assets/js/ui/board-interactions.js'
        source_hash=hashlib.sha256(get(source_path)).hexdigest()
        export={'schema':SCHEMA,'exported_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source_site':site,'source_asset':source_path,'source_asset_sha256':source_hash,'world_revision':snapshot['revision'],'snapshot':snapshot,'consistency':'Canonical V2 world row is atomic. Separate assets and sheets are a file-sync capture, not a whole-site transaction.'}
        out=data/'vtt-diagnostic.json'
        part=out.with_suffix('.part')
        part.write_text(json.dumps(export,indent=2))
        part.replace(out)
    app=build_app(root,data,export)
    print(f'Current VTT captured at revision {export["snapshot"]["revision"]}.')
    print(f'Disposable app: {app}')
    print('No production board commands or data writes were submitted.')


if __name__=='__main__':
    try:
        main()
    except (ValueError,RuntimeError,OSError,sqlite3.Error,subprocess.SubprocessError) as error:
        print(f'Diagnostic sync failed: {error}',file=sys.stderr)
        sys.exit(1)
