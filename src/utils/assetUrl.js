// Append a cache-busting query only when useful.
// - DEV: add a timestamp automatically (ensures immediate refresh while working)
// - PROD: add ?v=... only if VITE_ASSET_VERSION is explicitly provided; otherwise keep URL clean for optimal caching
const DEV = !!(import.meta && import.meta.env && import.meta.env.DEV);
const PROD_VER = (import.meta && import.meta.env && import.meta.env.VITE_ASSET_VERSION) || '';

export function assetUrl(p) {
  try {
    if (!p || typeof p !== 'string') return p;
    // Only bust for relative/public assets. Skip http(s) or data URLs.
    if (/^(https?:)?\/\//i.test(p) || /^data:/i.test(p)) return p;
  // In dev, do not always bust cache to avoid slow loads over tunnels
    if (PROD_VER) {
      return p.includes('?') ? p : `${p}?v=${encodeURIComponent(PROD_VER)}`;
    }
    return p; // no busting in production unless version is set
  } catch { return p; }
}

export default assetUrl;
