#!/usr/bin/env python3
"""Build one .vttmap from a scene export and explicit reference-to-local-image mapping.
No credentials, downloads, scene writes or native-map edits. Native DAM stays separate.
"""
import argparse, base64, hashlib, json
from pathlib import Path
IMAGE_KEYS = {'mapUrl','imageUrl','thumbnailUrl','image','backgroundUrl','assetUrl','imageId'}
MAX_BYTES = 128 * 1024 * 1024

def references(value):
    found = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key in IMAGE_KEYS and isinstance(item, str) and item:
                found.add(item)
            elif isinstance(item, (dict, list)):
                found.update(references(item))
    elif isinstance(value, list):
        for item in value:
            found.update(references(item))
    return found

def image_type(data):
    if data.startswith(b'\xff\xd8\xff'): return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'image/png'
    if data[:6] in (b'GIF87a', b'GIF89a'): return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP': return 'image/webp'
    raise ValueError('Only JPEG, PNG, GIF and WebP images can be bundled.')

def build(package, mapping, mapping_dir):
    if package.get('format') != 'gmscreen-scene/v1':
        raise ValueError('Expected an exported gmscreen scene JSON.')
    refs = references([package['scene'],package['domains']])
    if set(mapping) != refs or len(refs) > 64:
        raise ValueError('Asset mapping must contain exactly all scene image references (maximum 64).')
    assets = []
    for ref in sorted(refs):
        path = Path(mapping[ref])
        if not path.is_absolute(): path = mapping_dir / path
        data = path.read_bytes()
        if not 0 < len(data) <= 40*1024*1024: raise ValueError('Each image must be between 1 byte and 40 MB.')
        assets.append({'reference':ref,'mime':image_type(data),'sha256':hashlib.sha256(data).hexdigest(),'base64':base64.b64encode(data).decode('ascii')})
    # Portable aliases avoid transporting URLs tied to the source website. Only
    # documented image fields are rewritten; IDs, geometry and arbitrary text stay.
    aliases = {ref:f'/dnd/vtt/storage/uploads/bundled-image-{index}.jpg' for index, ref in enumerate(sorted(refs))}
    def remap(value):
        if isinstance(value, list): return [remap(item) for item in value]
        if isinstance(value, dict): return {key:aliases[item] if key in IMAGE_KEYS and isinstance(item,str) and item else remap(item) for key,item in value.items()}
        return value
    portable = json.loads(json.dumps(package))
    portable['scene'] = remap(package['scene'])
    portable['domains'] = remap(package['domains'])
    portable['assetReferences'] = list(aliases.values())
    for asset in assets: asset['reference'] = aliases[asset['reference']]
    encoded = json.dumps({'format':'gmscreen-map/v1','package':portable,'assets':assets},separators=(',',':'),allow_nan=False).encode('utf-8')
    if len(encoded) > MAX_BYTES: raise ValueError('Complete map package exceeds 128 MB.')
    return encoded

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scene',type=Path)
    parser.add_argument('--assets',required=True,type=Path,help='JSON object mapping each image URL to its local path (paths relative to this JSON).')
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    try:
        encoded=build(json.loads(args.scene.read_text(encoding='utf-8')),json.loads(args.assets.read_text(encoding='utf-8')),args.assets.resolve().parent)
    except (ValueError,KeyError,OSError) as error: parser.error(str(error))
    args.output.write_bytes(encoded)
    print(f'Created {args.output} ({len(encoded):,} bytes).')
if __name__ == '__main__': main()
