// A whole copy of the board's state without copying every scene's map design again.
//
// The board hands out copies of its state so that nothing outside can change it. A copy was made
// by writing the whole state out as text and reading it back, after every change to the state:
// two or three times for one token move. A scene's design (its walls, and above all its ground
// heights, about a megabyte of text for a map with painted ground) does not change when a token
// moves, yet every scene's design was written out and read back each time. With a few such maps in
// a campaign that was most of the freeze felt on every move.
//
// Here the copy is made the same way, to the same result, except that the copy of a design is
// kept and handed out again for as long as the design it was made from is the very same object
// with the same revision. A changed design is a new object with a new revision (the event reducer
// and the snapshot overlay both replace it), and is copied afresh.
//
// A design is the `value` of an entry `{revision, value}` under a scene's `environment`.
const copies = new WeakMap();

const json = (value) => JSON.parse(JSON.stringify(value));
function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.toJSON === 'function') return false;
  const kind = Object.getPrototypeOf(value);
  return kind === Object.prototype || kind === null;
}
/** One property copied as writing the object out and reading it back would: left out when it has no text form. */
function copyProperty(out, key, value) {
  const text = JSON.stringify(value);
  if (text !== undefined) out[key] = JSON.parse(text);
}

// A belt beside the braces: a cheap mark of a design's size and a spread of its contents, so that a
// design changed in place without a new revision is still noticed in nearly every case.
const mark = (value) => (value !== null && typeof value === 'object' ? (Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`) : String(value));
function spread(list) {
  let text = `[${list.length}`;
  const step = Math.max(1, Math.floor(list.length / 16));
  for (let i = 0; i < list.length; i += step) text += `|${mark(list[i])}`;
  if (list.length) text += `|${mark(list[list.length - 1])}`;
  return text;
}
function fingerprint(value) {
  if (Array.isArray(value)) return spread(value);
  let text = '';
  for (const key of Object.keys(value)) text += `${key}:${Array.isArray(value[key]) ? spread(value[key]) : mark(value[key])};`;
  return text;
}

/** The copy of one design: the one already made, while the design is unchanged. */
function shared(value, revision) {
  const stamp = fingerprint(value), held = copies.get(value);
  if (held && held.revision === revision && held.stamp === stamp) return held.copy;
  const copy = json(value);
  copies.set(value, { revision, stamp, copy });
  return copy;
}

/** A copy of a scene's `environment`: each field's design shared, everything else copied. */
export function copyDesigns(environment) {
  if (!plain(environment)) return json(environment);
  const out = {};
  for (const field of Object.keys(environment)) {
    const entry = environment[field];
    if (!plain(entry) || entry.value === null || typeof entry.value !== 'object') { copyProperty(out, field, entry); continue; }
    const copy = {};
    for (const key of Object.keys(entry)) {
      if (key === 'value') copy.value = shared(entry.value, entry.revision);
      else copyProperty(copy, key, entry[key]);
    }
    out[field] = copy;
  }
  return out;
}

function copyAlong(source, path, depth) {
  if (depth === path.length) return copyDesigns(source);
  const out = {}, want = path[depth];
  for (const key of Object.keys(source)) {
    const value = source[key];
    if ((want === '*' || key === want) && plain(value)) out[key] = copyAlong(value, path, depth + 1);
    else copyProperty(out, key, value);
  }
  return out;
}

/**
 * A whole copy of `source`, equal in every part to writing it out as text and reading it back,
 * with the designs found along `path` shared. `path` names the way down to each scene's
 * environment; '*' stands for every key (the scene ids).
 */
export function copySharingDesigns(source, path) {
  return plain(source) ? copyAlong(source, path, 0) : json(source);
}

/** Where the designs are in the board's state, and in the confirmed snapshot from the server. */
export const BOARD_DESIGNS = ['boardState', 'sceneState', '*', 'environment'];
export const SNAPSHOT_DESIGNS = ['state', 'sceneConfig', '*', 'environment'];
