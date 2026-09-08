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
destination = sync.SOURCE_ROOT / '.playwright-mcp/drawing-regression'
destination.mkdir(parents=True, exist_ok=True)
export = {'schema': sync.SCHEMA, 'test_fixture': 'drawing-regression', 'test_scene_id': scene_id,
          'snapshot': {'revision': 0, 'serverTime': 0, 'state': state}}
print(sync.build_app(destination, data, export))
