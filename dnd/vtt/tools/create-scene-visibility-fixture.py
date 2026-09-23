"""Build a synthetic, loopback-only scene/fog regression app. Run from the repo root."""
import importlib.util, json, struct, zlib
from pathlib import Path
root=Path('.playwright-mcp/scene-visibility-regression').resolve()
data=root/'data'; storage=data/'dnd/vtt/storage'; storage.mkdir(parents=True,exist_ok=True)
def chunk(tag,b): return struct.pack('>I',len(b))+tag+b+struct.pack('>I',zlib.crc32(tag+b)&0xffffffff)
image=storage/'test.png'
image.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,1024,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\xaa\xbb\xaa'*1024)*1024))+chunk(b'IEND',b''))
scene={'id':'test-scene','name':'Original test map','mapUrl':'/dnd/vtt/storage/test.png','playerVisible':True,'grid':{'size':64,'visible':True}}
(storage/'scenes.json').write_text(json.dumps({'scenes':[scene],'folders':[]}))
(storage/'tokens.json').write_text(json.dumps({'tokens':[]}))
state={'placements':{'test-scene':{}},'routing':{'_revision':0,'activeSceneId':'test-scene','mapUrl':scene['mapUrl'],'playerActiveSceneId':'test-scene','playerMapUrl':scene['mapUrl'],'playerMapDisabled':False},'sceneConfig':{'test-scene':{'_revision':0,'grid':scene['grid'],'mapLevels':{'activeLevelId':'level-0','levels':[]},'userLevelState':{u:{'levelId':'level-0','source':'manual'} for u in ['gm','cal','sharon']}}},'drawings':{},'templates':{},'combat':{},'pings':{}}
spec=importlib.util.spec_from_file_location('sync',Path('dnd/vtt/tools/sync-diagnostic.py')); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
print(mod.build_app(root,data,{'schema':mod.SCHEMA,'test_fixture':'scene-visibility-regression','snapshot':{'revision':0,'serverTime':0,'state':state}}))
