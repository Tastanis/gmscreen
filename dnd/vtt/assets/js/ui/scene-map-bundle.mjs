// Portable map assets are uploaded independently of scene creation.
export const BUNDLE_FORMAT = 'gmscreen-map/v1';
export const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;
const imageKeys = new Set(['mapUrl','imageUrl','thumbnailUrl','image','backgroundUrl','assetUrl','imageId']);
export function imageReferences(packageData) {
  const refs = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key,item] of Object.entries(value)) {
      if (item && typeof item === 'object') visit(item);
      else if (imageKeys.has(key) && typeof item === 'string' && item) refs.add(item);
    }
  }
  visit([packageData.scene,packageData.domains]);
  return [...refs];
}
export function remapImages(packageData, urls) {
  const copy = structuredClone(packageData);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key,item] of Object.entries(value)) {
      if (item && typeof item === 'object') visit(item);
      else if (imageKeys.has(key) && typeof item === 'string' && item) {
        if (!urls.has(item)) throw Error(`Missing bundled image: ${item}`);
        value[key] = urls.get(item);
      }
    }
  }
  visit(copy.scene); visit(copy.domains);
  copy.assetReferences = imageReferences(copy);
  return copy;
}
export async function validateMapBundle(bundle) {
  if (bundle?.format !== BUNDLE_FORMAT || bundle.package?.format !== 'gmscreen-scene/v1'
      || !Array.isArray(bundle.assets) || bundle.assets.length > 64) throw Error('Invalid map package.');
  const required = new Set(imageReferences(bundle.package));
  const assets = new Map(); let total = 0;
  for (const asset of bundle.assets) {
    if (!asset || typeof asset.reference !== 'string' || assets.has(asset.reference) || !required.has(asset.reference)) throw Error('Duplicate or unexpected bundled image.');
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(asset.mime)
        || typeof asset.base64 !== 'string' || (asset.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64))
        || asset.base64.length > 55924056 || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) throw Error('Invalid bundled image encoding or type.');
    const bytes = Uint8Array.from(atob(asset.base64), c=>c.charCodeAt(0));
    total += bytes.length;
    if (!bytes.length || bytes.length > 40*1024*1024 || total > MAX_BUNDLE_BYTES) throw Error('Bundled images exceed the supported size.');
    const signature = asset.mime === 'image/png' ? bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71
      : asset.mime === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
      : asset.mime === 'image/gif' ? String.fromCharCode(...bytes.slice(0,6)).match(/^GIF8[79]a$/)
      : String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if (!signature) throw Error('Bundled image type does not match its contents.');
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if (digest !== asset.sha256) throw Error('Bundled image checksum failed.');
    assets.set(asset.reference,new Blob([bytes],{type:asset.mime}));
  }
  for (const ref of required) if (!assets.has(ref)) throw Error(`Missing bundled image: ${ref}`);
  return {package:bundle.package,assets};
}
export async function uploadMapBundle(bundle, uploaded = new Map(), fetcher = fetch, progress = ()=>{}) {
  for (const [reference,blob] of bundle.assets) {
    if (uploaded.has(reference)) continue;
    progress(`Uploading image ${uploaded.size+1} of ${bundle.assets.size}…`);
    const form = new FormData(); form.append('map',blob,'map-image');
    const response = await fetcher('/dnd/vtt/api/uploads.php',{method:'POST',credentials:'same-origin',body:form});
    const result = await response.json();
    if (!response.ok || !result.success || typeof result.data?.url !== 'string'
        || !/^\/dnd\/vtt\/storage\/uploads\/[a-zA-Z0-9_.-]+$/.test(result.data.url)) throw Error(result.error || 'Map image upload failed.');
    uploaded.set(reference,result.data.url);
  }
  return remapImages(bundle.package,uploaded);
}
