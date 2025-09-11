// Central overlay manager for global spotlight/vignette
// Usage:
//   import { setOverlay, clearOverlay } from '../utils/overlay';
//   setOverlay(true); // show
//   clearOverlay();   // hide

export function setOverlay(on) {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('overlay-on', !!on);
  }
}

export function clearOverlay() {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('overlay-on');
  }
}
