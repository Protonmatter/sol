// Presentation-only geometry. Physical coordinates and radii are never mutated.
// A bounded pair pass caps only requested enlargement; genuine physical contact is retained.
export const DISPLAY_CLEARANCE = 0.95;

export function resolveDisplayRadii(bodies, physicalScale = false) {
  const names = new Set();
  for (const b of bodies) {
    if (!b || typeof b.name !== 'string' || !b.name || names.has(b.name)
      || !Array.isArray(b.pos) || b.pos.length !== 3 || !b.pos.every(Number.isFinite)
      || !Number.isFinite(b.physicalRadius) || b.physicalRadius <= 0
      || !Number.isFinite(b.requestedRadius) || b.requestedRadius < 0
      || (b.extentRatio !== undefined && (!Number.isFinite(b.extentRatio) || b.extentRatio < 1))) {
      throw new TypeError('Invalid display geometry: unique name, finite center, positive radius and extent required');
    }
    names.add(b.name);
  }
  const factors = bodies.map(() => 1);
  if (!physicalScale) {
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const distance = Math.hypot(...a.pos.map((v, k) => v - b.pos[k]));
      const ae = a.extentRatio || 1, be = b.extentRatio || 1;
      const base = a.physicalRadius * ae + b.physicalRadius * be;
      const extra = Math.max(0, a.requestedRadius - a.physicalRadius) * ae
        + Math.max(0, b.requestedRadius - b.physicalRadius) * be;
      const factor = extra > 0 ? Math.max(0, Math.min(1, (DISPLAY_CLEARANCE * distance - base) / extra)) : 1;
      factors[i] = Math.min(factors[i], factor);
      factors[j] = Math.min(factors[j], factor);
    }
  }
  return Object.fromEntries(bodies.map((b, i) => [b.name, b.physicalRadius
    + (physicalScale ? 0 : Math.max(0, b.requestedRadius - b.physicalRadius) * factors[i])]));
}

export function moonGuideVisible(parent, selected, anchor, mode = 'context', parents = {}) {
  if (mode === 'off') return false;
  return mode === 'all' || parent === selected || parent === anchor
    || parents[selected] === parent || parents[anchor] === parent;
}
