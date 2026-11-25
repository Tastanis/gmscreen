// Lossless prebakes use the same fingerprint as the local terrain cache.
// A new sculpt, an unavailable file, or a slow connection uses the procedural path.
const packs = {
  "w842810943-185677-480": [
    "campus-480-4a8251300d6f.bin.gz",
    4273029
  ],
  "w842810943-185677-880": [
    "campus-880-ec74182b21d8.bin.gz",
    13706473
  ]
};
export async function loadPackedTerrain(key, nx, nz, dx, dz) {
  const pack = packs[key];
  if (!pack || typeof DecompressionStream === 'undefined' || navigator.connection?.saveData || /^(slow-2g|2g|3g)$/.test(navigator.connection?.effectiveType)) return null;
  const [file, bytes] = pack, abort = new AbortController(), start = performance.now();
  const limit = nx < 500 ? 1800 : 4900;
  const timeout = setTimeout(() => abort.abort(), limit);
  try {
    const response = await fetch(new URL('./terrain/' + file, import.meta.url), {signal: abort.signal});
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader(), parts = [];
    let received = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      parts.push(value); received += value.length;
      const elapsed = performance.now() - start;
      if (elapsed > 450 && received < bytes && elapsed * bytes / received > limit) {abort.abort(); return null;}
    }
    const blob = new Blob(parts), magic = new Uint8Array(await blob.slice(0,2).arrayBuffer());
    const buffer = magic[0] === 31 && magic[1] === 139
      ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : await blob.arrayBuffer(); // Hosts may apply Content-Encoding to .gz files.
    const n = nx * nz;
    if (buffer.byteLength !== 20 + n * 32) return null;
    const header = new DataView(buffer);
    if (header.getUint32(0) !== 0x53585431 || header.getUint32(4,true) !== nx || header.getUint32(8,true) !== nz) return null;
    const encoded = new Uint8Array(buffer);
    let offset = 20;
    function unpack(channels) {
      const words = new Uint32Array(n * channels);
      for (let c = 0; c < channels; c++, offset += n * 4) {
        let last = 0;
        for (let i = 0, j = c; i < n; i++, j += channels) {
          const k = offset + i;
          last ^= encoded[k] | (encoded[k+n] << 8) | (encoded[k+2*n] << 16) | (encoded[k+3*n] << 24);
          words[j] = last;
        }
      }
      return new Float32Array(words.buffer);
    }
    const H = unpack(1), col = unpack(3), mat = unpack(4), nor = new Float32Array(n*3);
    for (let j=0, k=0; j<nz; j++) for (let i=0; i<nx; i++, k++) {
      const sx=(H[i<nx-1?k+1:k]-H[i?k-1:k])/(2*dx), sz=(H[j<nz-1?k+nx:k]-H[j?k-nx:k])/(2*dz);
      const il=1/Math.hypot(sx,1,sz);
      nor[3*k]=-sx*il; nor[3*k+1]=il; nor[3*k+2]=-sz*il;
    }
    return {H,col,mat,nor,hmax:header.getFloat64(12,true)};
  } catch { return null; }
  finally {clearTimeout(timeout);}
}
