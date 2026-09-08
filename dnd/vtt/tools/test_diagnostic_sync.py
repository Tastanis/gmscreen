import importlib.util
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('sync_diagnostic',Path(__file__).with_name('sync-diagnostic.py'))
sync=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class DiagnosticTests(unittest.TestCase):
    def test_rejects_invalid_snapshot(self):
        for body in ({'success':False},{'success':True,'snapshot':{'revision':-1,'state':{}}},{'success':True,'snapshot':{'revision':True,'state':{'placements':{}}}}):
            with self.assertRaises(ValueError):sync.validate_snapshot(body)

    def test_import_preserves_state_and_refuses_overwrite(self):
        snapshot={'revision':123,'serverTime':456,'state':{'placements':{'scene':{'pc':{'levelId':'upper'}}},'sceneConfig':{'scene':{'userLevelState':{'cal':{'levelId':'upper'}}}}}}
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'test.sqlite'
            sync.import_snapshot(snapshot,path)
            with closing(sqlite3.connect(path)) as db:
                row=db.execute('SELECT revision,state_json FROM vtt_world_state').fetchone()
                self.assertEqual(row[0],123)
                self.assertEqual(json.loads(row[1]),snapshot['state'])
            with self.assertRaises(ValueError):sync.import_snapshot(snapshot,path)

    def test_requires_isolation_sentinel(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            with self.assertRaises(ValueError):sync.isolated_target(root,'data')
            (root/'data').mkdir();(root/'data/.gmscreen-test-data').touch()
            self.assertEqual(sync.isolated_target(root,'data'),root/'data')
            with self.assertRaises(ValueError):sync.isolated_target(root,str(sync.SOURCE_ROOT/'dnd'))

if __name__=='__main__':unittest.main()
