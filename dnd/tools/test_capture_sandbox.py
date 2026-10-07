"""Disposable loopback integration tests; no production requests or campaign writes."""
import hashlib
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('capture_sandbox', HERE / 'capture-sandbox.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='dnd-capture-test-')
        self.root = Path(self.temp.name)
        self.web = self.root / 'public_html'
        self.dnd = self.web / 'dnd'
        self.dnd.mkdir(parents=True)
        shutil.copytree(HERE.parent / 'admin/sandbox-export', self.dnd / 'admin/sandbox-export')
        self.token = 'test-' + 'a' * 48
        self.config = self.root / 'dnd-sandbox-export.php'
        self.config.write_text("<?php return ['token_sha256'=>'" + hashlib.sha256(self.token.encode()).hexdigest() + "','hex_storage'=>'json','allow_loopback_http'=>true];")
        self.write('character_sheet/data/character_sheets.json', '{"Cal":{"wealth":17,"image":"/dnd/images/pc.png"}}')
        self.write('data/characters.json', '{"Cal":{"wealth":17}}')
        self.write('vtt/storage/scenes.json', '{"activeSceneId":"one"}')
        self.write('vtt/storage/tokens.json', '{"tokens":[]}')
        self.write('strixhaven/monster-creator/data/new-monster.json', '{"automation":{"effect":"damage"}}')
        self.write('images/pc.png', b'\x89PNG\r\n\x1a\nfixture')
        self.write('private/credentials.json', '{"secret":"DO NOT EXPORT"}')
        self.write('backups/old.json', '{}')
        self.write('index.php', '<?php echo "fixture";')
        self.write('vtt/config/pusher.php', "<?php return ['enabled'=>true];")
        self.database = self.dnd / 'vtt/storage/sync-v2.sqlite'
        self.database.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.database)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE vtt_world_state (world_id TEXT PRIMARY KEY, revision INTEGER, state_json TEXT)')
        self.db.execute('CREATE TABLE receipts (operation_id TEXT PRIMARY KEY, result BLOB)')
        self.db.execute('INSERT INTO vtt_world_state VALUES (?,?,?)', ('default', 42, '{"placements":{"pc":{"stamina":9}}}'))
        self.db.execute('INSERT INTO receipts VALUES (?,?)', ('original', b'\x00\xff'))
        self.db.commit()
        php = shutil.which('php')
        if not php:
            self.skipTest('PHP required')
        self.php = [php]
        if os.name == 'nt':
            self.php += ['-d', 'extension_dir=' + str(Path(php).parent / 'ext'), '-d', 'extension=sqlite3', '-d', 'extension=pdo_sqlite']
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        self.site = f'http://127.0.0.1:{port}/dnd'
        self.server_log = (self.root / 'php.log').open('w+')
        self.server = subprocess.Popen(self.php + ['-S', f'127.0.0.1:{port}', '-t', str(self.web)], stdout=self.server_log, stderr=self.server_log)
        self.connection = capture.Connection(self.site, self.token, loopback=True)
        for _ in range(100):
            try:
                urllib.request.urlopen(self.site + '/index.php', timeout=1).close()
                break
            except OSError:
                if self.server.poll() is not None:
                    self.fail('Fixture PHP server exited')
                time.sleep(.05)
        self.output = self.root / 'captures'

    def tearDown(self):
        if hasattr(self, 'server'):
            self.server.terminate()
            self.server.wait(timeout=10)
            self.server_log.close()
        if hasattr(self, 'db'):
            self.db.close()
        self.temp.cleanup()

    def write(self, name, content):
        path = self.dnd / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content.encode() if isinstance(content, str) else content)

    def test_auth_and_scope(self):
        wrong = capture.Connection(self.site, 'b' * 48, loopback=True)
        with self.assertRaises(urllib.error.HTTPError) as caught:
            wrong.manifest()
        self.assertEqual(caught.exception.code, 403)
        manifest = self.connection.manifest()
        self.assertIn('dnd/strixhaven/monster-creator/data/new-monster.json', manifest['files'])
        self.assertNotIn('dnd/private/credentials.json', manifest['files'])
        self.assertNotIn('dnd/backups/old.json', manifest['files'])
        for path in ['dnd/index.php', '../dnd-sandbox-export.php', 'asl/student.json', 'dnd/private/credentials.json']:
            with self.assertRaises(urllib.error.HTTPError):
                self.connection.open({'action':'file', 'path':path, 'sha256':'0' * 64})

    def test_sqlite_wal_snapshot_and_receipts(self):
        before = self.database.read_bytes()
        stage = capture.capture(self.connection, self.output)
        with closing(sqlite3.connect(stage / 'data/dnd/vtt/storage/sync-v2.sqlite')) as copy:
            self.assertEqual(copy.execute('SELECT revision FROM vtt_world_state').fetchone(), (42,))
            self.assertEqual(copy.execute('SELECT result FROM receipts').fetchone(), (b'\x00\xff',))
        self.assertEqual(self.database.read_bytes(), before)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM receipts').fetchone(), (1,))

    def test_new_files_and_deletions_do_not_leave_stale_data(self):
        first = capture.capture(self.connection, self.output)
        self.write('new-feature/data/fresh.json', '{"new":true}')
        (self.dnd / 'images/pc.png').unlink()
        second = capture.capture(self.connection, self.output)
        self.assertTrue((second / 'data/dnd/new-feature/data/fresh.json').is_file())
        self.assertFalse((second / 'data/dnd/images/pc.png').exists())
        self.assertTrue((first / 'data/dnd/images/pc.png').is_file())

    def test_stale_file_hash_is_rejected(self):
        manifest = self.connection.manifest()
        path = 'dnd/character_sheet/data/character_sheets.json'
        self.write(path[4:], '{"wealth":99}')
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.connection.download(path, manifest['files'][path], self.root / 'download')
        self.assertEqual(caught.exception.code, 409)

    def test_failed_refresh_preserves_last_pointer(self):
        capture.capture(self.connection, self.output)
        pointer = (self.output / 'latest-capture.json').read_bytes()
        real = self.connection.manifest
        count = 0
        def changing():
            nonlocal count
            count += 1
            if count == 2:
                self.write('new.json', '{}')
            return real()
        self.connection.manifest = changing
        with self.assertRaisesRegex(ValueError, 'changed during capture'):
            capture.capture(self.connection, self.output)
        self.assertEqual((self.output / 'latest-capture.json').read_bytes(), pointer)

    def test_prepare_requires_matching_code_and_no_coverage_issues(self):
        stage = capture.capture(self.connection, self.output)
        self.write('index.php', '<?php echo "different";')
        with self.assertRaisesRegex(ValueError, 'mismatch'):
            capture.prepare(stage, self.web, self.root / 'sandboxes')
        self.write('index.php', '<?php echo "fixture";')
        app = capture.prepare(stage, self.web, self.root / 'sandboxes')
        self.assertIn("'enabled'=>false", (app / 'dnd/vtt/config/pusher.php').read_text())
        with closing(sqlite3.connect(app / 'dnd/vtt/storage/sync-v2.sqlite')) as db, db:
            db.execute('UPDATE vtt_world_state SET revision=99')
        self.assertEqual(self.db.execute('SELECT revision FROM vtt_world_state').fetchone(), (42,))
        self.write('new-data.unknown', 'unexpected')
        blocked = capture.capture(self.connection, self.output)
        with self.assertRaisesRegex(ValueError, 'coverage issues'):
            capture.prepare(blocked, self.web, self.root / 'sandboxes')

    def test_unreviewed_database_blocks_preparation(self):
        self.config.write_text(self.config.read_text().replace("'hex_storage'=>'json'", "'hex_storage'=>'unreviewed'"))
        stage = capture.capture(self.connection, self.output)
        with self.assertRaisesRegex(ValueError, 'coverage issues'):
            capture.prepare(stage, self.web, self.root / 'sandboxes')

    def test_client_path_validation(self):
        for path in ['../outside', 'dnd/../../outside', 'asl/data.json', 'dnd/x:y', 'dnd/CON.json', 'dnd/a\\b', 'dnd/a./b', 'dnd/.env']:
            with self.assertRaises(ValueError, msg=path):
                capture.relative_path(path)

    def test_redirects_never_forward_token(self):
        self.write('admin/sandbox-export/index.php', '<?php header("Location: /dnd/index.php");')
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.connection.manifest()
        self.assertEqual(caught.exception.code, 302)

    def test_insecure_remote_url_rejected(self):
        for site in ['http://example.test/dnd', 'https://user:pass@example.test/dnd', 'https://example.test/asl', 'https://example.test/dnd?q=x']:
            with self.assertRaises(ValueError):
                capture.Connection(site, self.token)

    def test_missing_canonical_store_is_not_an_empty_success(self):
        self.db.close()
        del self.db
        self.database.unlink()
        manifest = self.connection.manifest()
        self.assertIn({'path':'dnd/vtt/storage/sync-v2.sqlite', 'reason':'required-runtime-store-missing'}, manifest['issues'])

    def test_missing_and_external_media_are_reported(self):
        self.write('data/media.json', '{"one":"/dnd/images/missing.png","two":"https://other.example/image.webp"}')
        stage = capture.capture(self.connection, self.output)
        with self.assertRaisesRegex(ValueError, 'media references'):
            capture.prepare(stage, self.web, self.root / 'sandboxes')
        issues = json.loads((stage / 'reference-issues.json').read_text())
        self.assertEqual({i['reason'] for i in issues}, {'missing-media', 'external-media-not-captured'})

    def test_git_line_endings_produce_exact_deployed_bytes(self):
        deployed = b'<?php\necho "same code";\n'
        self.write('index.php', deployed)
        stage = capture.capture(self.connection, self.output)
        source = self.root / 'source'
        for path, item in self.connection.manifest()['files'].items():
            if item['kind'] == 'code':
                target = source / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((self.web / path).read_bytes().replace(b'\n', b'\r\n'))
        app = capture.prepare(stage, source, self.root / 'sandboxes')
        self.assertEqual((app / 'dnd/index.php').read_bytes(), deployed)

    def test_local_router_and_runtime_isolation(self):
        self.write('probe.php', '<?php header("Content-Type: application/json"); echo json_encode(["url"=>"' + self.site + '/images/pc.png", "pusher"=>(require __DIR__."/vtt/config/pusher.php")["enabled"], "mail"=>function_exists("mail"), "remote"=>ini_get("allow_url_fopen")]);')
        stage = capture.capture(self.connection, self.output)
        app = capture.prepare(stage, self.web, self.root / 'sandboxes')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        # Exercise the actual launcher, including its PHP options and environment.
        server = subprocess.Popen([os.sys.executable, str(HERE / 'capture-sandbox.py'), 'serve', '--app', str(app), '--port', str(port)], stdout=self.server_log, stderr=self.server_log, start_new_session=os.name != 'nt')
        try:
            for _ in range(100):
                try:
                    response = urllib.request.urlopen(f'http://127.0.0.1:{port}/dnd/probe.php', timeout=1)
                    break
                except OSError:
                    if server.poll() is not None: self.fail('Sandbox launcher exited')
                    time.sleep(.05)
            else: self.fail('Sandbox failed to start')
            with response:
                result = json.load(response)
                self.assertIn("form-action 'self'", response.headers['Content-Security-Policy'])
            self.assertEqual(result, {'url':'/dnd/images/pc.png', 'pusher':False, 'mail':False, 'remote':'0'})
            for path in ['/sandbox-settings.json', '/dnd/vtt/storage/sync-v2.sqlite', '/dnd/admin/sandbox-export/index.php']:
                with self.assertRaises(urllib.error.HTTPError):
                    urllib.request.urlopen(f'http://127.0.0.1:{port}' + path)
        finally:
            # Terminating the Python launcher does not terminate its PHP child on
            # Windows. Find the child by its exact fixture command line only.
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(server.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                os.killpg(server.pid, signal.SIGTERM)
            server.wait(timeout=10)


if __name__ == '__main__':
    unittest.main()
