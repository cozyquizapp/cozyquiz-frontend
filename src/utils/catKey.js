// frontend/src/utils/catKey.js
// Normalizes a category display name (with or without diacritics) to an asset/css-safe key.
// Examples: "Bär" -> "baer", "Baer" -> "baer", "Kranich" -> "kranich".
export function catKey(name) {
  if (!name) return null;
  const raw = String(name).trim();
  // Lowercase and strip diacritics (ä -> a)
  const base = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const map = {
    'baer': 'baer',
    'bar': 'baer', // in case diacritics are stripped without ae substitution
    'eule': 'eule',
    'elch': 'elch',
    'fuchs': 'fuchs',
    'hase': 'hase',
    'kranich': 'kranich',
    'robbe': 'robbe',
    'wal': 'wal',
    'lobby': 'lobby',
  };
  // Accept both "baer" and the stripped "bar" as Bär
  if (map[base]) return map[base];
  // Fallback: keep a-z0-9 only
  return base.replace(/[^a-z0-9]/g, '');
}

export default catKey;

