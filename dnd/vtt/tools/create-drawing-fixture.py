"""Build a synthetic drawing-test app using downloaded media, never live commands."""
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('sync_diagnostic', Path(__file__).with_name('sync-diagnostic.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--diagnostic-root', type=Path, required=True)
parser.add_argument('--floors', action='store_true', help='Build a player stair/fall fixture instead.')
args = parser.parse_args()
root = args.diagnostic_root.resolve()
config = json.loads((root / 'config/local-sync.json').read_text(encoding='utf-8-sig'))
data = sync.isolated_target(root, config['target_test_data_dir'])
scenes = json.loads((data / 'dnd/vtt/storage/scenes.json').read_text(encoding='utf-8'))['scenes']
scene = next((entry for entry in scenes if entry.get('name') == 'Witherbloom'), scenes[0])
scene_id = scene['id']
map_url = scene['mapUrl']
state = {
    'placements': {scene_id: {}},
    'routing': {'_revision': 0, 'activeSceneId': scene_id, 'mapUrl': map_url,
                'playerActiveSceneId': scene_id, 'playerMapUrl': map_url, 'playerMapDisabled': False},
    'sceneConfig': {scene_id: {
        '_revision': 0, 'grid': {**scene.get('grid', {}), 'size': 64, 'visible': True},
        'mapLevels': {'activeLevelId': 'level-0', 'levels': [
            {'id': 'test-upper', 'name': 'Test balcony', 'zIndex': 0, 'mapUrl': map_url,
             'opacity': 1, 'hidden': False, 'displayMode': 'auto', 'cutouts': []}]},
        'userLevelState': {user: {'levelId': 'level-0', 'source': 'manual'} for user in ['gm', 'cal', 'sharon']},
    }},
    'drawings': {}, 'templates': {}, 'combat': {}, 'pings': {},
}
if args.floors:
    tokens = json.loads((data / 'dnd/vtt/storage/tokens.json').read_text(encoding='utf-8'))['tokens']
    token = next(entry for entry in tokens if entry.get('name', '').lower() == 'cal')
    state['placements'][scene_id] = {'floor-cal': {**token, 'id':'floor-cal', 'tokenId':token['id'],
        'name':'Cal', 'profileId':'cal', 'team':'ally', 'column':2, 'row':0,
        'width':1, 'height':1, 'levelId':'level-0', '_entityRevision':0}}
    stair = {'id':'test-stair','direction':'up','linkedLevelId':'test-upper',
        'corners':[{'column':1,'row':1},{'column':4,'row':1},{'column':4,'row':5},{'column':1,'row':5}],
        'edgeColors':{**{f'{x},1-{x+1},1':'red' for x in range(1,4)}, **{f'{x},5-{x+1},5':'green' for x in range(1,4)}}}
    levels = state['sceneConfig'][scene_id]['mapLevels']
    levels['baseStairs'] = [stair]
    levels['levels'][0]['stairs'] = [{**stair,'direction':'down','linkedLevelId':'level-0'}]
    levels['levels'][0]['cutouts'] = [{'column':6,'row':5,'width':2,'height':2}]
scenario = 'floor-regression' if args.floors else 'drawing-regression'
destination = sync.SOURCE_ROOT / ('.playwright-mcp/' + scenario)
destination.mkdir(parents=True, exist_ok=True)
export = {'schema': sync.SCHEMA, 'test_fixture': scenario, 'test_scene_id': scene_id,
          'snapshot': {'revision': 0, 'serverTime': 0, 'state': state}}
print(sync.build_app(destination, data, export))
