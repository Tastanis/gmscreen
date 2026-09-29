import importlib.util, json, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build-scene-map-package.py'))
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
class MapPackageTest(unittest.TestCase):
    def test_complete_package_references_and_geometry_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'image.jpg').write_bytes(bytes.fromhex('ffd8ffe0'))
            package={'format':'gmscreen-scene/v1','scene':{'mapUrl':'/map.jpg'},'domains':{'sceneConfig':{'terrain':[1.2,-5.5],'surfaceId':'floor'},'placements':{'token':{'id':'/map.jpg'}}}}
            bundle=json.loads(builder.build(package,{'/map.jpg':'image.jpg'},root))
            self.assertEqual(bundle['package']['scene']['mapUrl'],'/dnd/vtt/storage/uploads/bundled-image-0.jpg')
            self.assertEqual(bundle['package']['domains'],package['domains'])
            self.assertEqual(package['scene']['mapUrl'],'/map.jpg')
            self.assertEqual(bundle['assets'][0]['reference'],'/dnd/vtt/storage/uploads/bundled-image-0.jpg')
    def test_missing_unexpected_invalid_and_empty_asset_fail(self):
        package={'format':'gmscreen-scene/v1','scene':{'mapUrl':'/map.jpg'},'domains':{}}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for mapping in [{},{'/extra':'no-file'}]:
                with self.assertRaises(ValueError):builder.build(package,mapping,root)
            for data in [b'',b'<svg></svg>']:
                (root/'bad').write_bytes(data)
                with self.assertRaises(ValueError):builder.build(package,{'/map.jpg':'bad'},root)
if __name__=='__main__':unittest.main()
