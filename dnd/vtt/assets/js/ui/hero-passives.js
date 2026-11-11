// A hero's passives on the board's ability bar (Brandon, November 10, 2026: "In the VTT ability tray, let's add
// passives. And it can show all their information. The same way any other ability would. It shows all of their
// text."). The sheet keeps them as its features (title, text, use when, tags, automation): each one is drawn as an
// ability card here, with every line of its text. One with an automation that does something (cards) runs on a click
// like any other ability; one that only changes numbers (modifiers, passives) is always on and just shows its card.

export const PASSIVE_TRAY_CATEGORY = { key: 'passives', label: 'Passive', heading: 'Passives', empty: 'No passives listed.' };

// The sheet's stand-in text for an empty "use when" (it hides it too).
const PLACEHOLDER_USE_WHEN = /type about this/i;

// Every line of a feature's text as its own paragraph: the card splits paragraphs at blank lines, so single line
// breaks (and <br>) become blank lines. Text in <p>/<div> blocks is already split by them.
export function passiveDescription(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\n+/g, '\n\n')
    .trim();
}

export function passiveAsAbility(feature, index = 0) {
  if (!feature || typeof feature !== 'object') return null;
  const name = String(feature.title || feature.name || '').trim();
  const text = feature.text ?? feature.description ?? '';
  if (!name && !String(text).trim()) return null;
  const useWhen = String(feature.useWhen || '').trim();
  const tags = Array.isArray(feature.tags)
    ? feature.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : String(feature.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  return {
    id: feature.id || '',
    name: name || 'Untitled Passive',
    actionLabel: 'Passive',
    tags,
    useWhen: PLACEHOLDER_USE_WHEN.test(useWhen) ? '' : useWhen,
    description: passiveDescription(text),
    tests: [],
    automation: feature.automation && typeof feature.automation === 'object' ? feature.automation : null,
    _stableActionId: feature.id || `passives:${index}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'passive'}`,
  };
}

export function heroPassives(sheet) {
  const features = Array.isArray(sheet?.features) ? sheet.features : [];
  return features.map((feature, index) => passiveAsAbility(feature, index)).filter(Boolean);
}
