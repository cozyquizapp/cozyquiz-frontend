const PRESETS = Object.freeze({
  fadeIn: 'motion-fade-in',
  fadeInUp: 'motion-fade-in-up',
  scaleIn: 'motion-scale-in',
  glassIn: 'motion-glass-in',
  hoverGlow: 'motion-hover-glow',
  pulse: 'motion-pulse',
  avatarBreath: 'motion-avatar-breath',
});

/**
 * Returns the mapped CSS class names for the supplied motion preset keys.
 * Unknown keys fall back to the raw value so custom class names can be mixed in.
 */
export function motionClass(...tokens) {
  return tokens
    .flat()
    .filter(Boolean)
    .map((token) => PRESETS[token] || token)
    .join(' ')
    .trim();
}

/**
 * Single preset lookup for convenience.
 */
export function getMotionPreset(token) {
  return PRESETS[token] || '';
}

/**
 * Small helper so components can respect reduced-motion when triggering JS-driven effects.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) {
    console.warn('[motionPresets] matchMedia failed', err);
    return false;
  }
}

export default PRESETS;
