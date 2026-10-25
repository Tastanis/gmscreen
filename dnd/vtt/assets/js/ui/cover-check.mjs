// Cover and line of effect (Brandon, October 2026: the Cover bane is ticked on when it applies; untick to drop it;
// nothing is ever refused). Draw Steel: a target with at least half its form blocked by something solid has cover;
// one that can't be seen at all from the user has no line of effect.
import { makeSight } from './vision-height.mjs';

const INSET = 0.35;

/** Points sampled over a token's footprint: each square's centre and four points near its corners. */
export function footprintSamples(token) {
  const points = [];
  const width = Math.max(1, Number(token?.width) || 1), height = Math.max(1, Number(token?.height) || 1);
  for (let dx = 0; dx < width; dx += 1) {
    for (let dy = 0; dy < height; dy += 1) {
      const cx = token.column + dx + 0.5, cy = token.row + dy + 0.5;
      points.push({ x: cx, y: cy });
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => points.push({ x: cx + sx * INSET, y: cy + sy * INSET }));
    }
  }
  return points;
}

/**
 * { fraction, covered, noLineOfEffect } for `target` seen from `actor`. `walls` is the wall model
 * ({ nodes, segments }); `groundAt(x, y)` and `groundFor(token)` give heights in squares. `see` may be given
 * (a makeSight result for the actor) to reuse it for several targets.
 */
export function coverFor({ actor, target, walls, groundAt = () => 0, groundFor = () => 0, see = null }) {
  const none = { fraction: 1, covered: false, noLineOfEffect: false };
  if (!actor || !target || actor.id === target.id) return none;
  if (!see && !(Array.isArray(walls?.segments) && walls.segments.length)) return none;
  const sight = see || makeSight({ viewer: actor, groundAt, walls, viewerGround: groundFor(actor) });
  const size = Math.max(Number(target.width) || 1, Number(target.height) || 1);
  const z = groundFor(target) + size / 2;
  const samples = footprintSamples(target);
  const seen = samples.filter((point) => { try { return sight(point, z, target) !== false; } catch { return true; } }).length;
  const fraction = samples.length ? seen / samples.length : 1;
  return { fraction, covered: seen > 0 && fraction <= 0.5, noLineOfEffect: seen === 0 };
}
