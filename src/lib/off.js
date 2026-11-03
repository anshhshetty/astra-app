// Open Food Facts: free, no key. Mostly packaged foods; community data can have gaps.
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,quantity';

export const mapProduct = (p) => {
  const n = p?.nutriments || {};
  let kcal = Number(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal)) { const kj = Number(n.energy_100g); kcal = Number.isFinite(kj) ? kj / 4.184 : NaN; }
  const name = (p?.product_name || '').trim();
  if (!name || !Number.isFinite(kcal)) return null;
  const v = (k) => { const x = Number(n[k]); return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0; };
  const serving = Number(p.serving_quantity);
  return {
    name: p.brands ? `${name} (${p.brands.split(',')[0].trim()})` : name,
    per100: { kcal: Math.round(kcal), p: v('proteins_100g'), c: v('carbohydrates_100g'), f: v('fat_100g') },
    servings: serving > 0 ? [{ label: '1 serving', grams: serving }] : [],
    source: 'off',
    barcode: p.code || null,
  };
};

const get = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(t); }
};

export const searchOnline = async (q) => {
  const base = `${BASE}/cgi/search.pl?action=process&json=1&search_simple=1&page_size=20&fields=${FIELDS}&search_terms=${encodeURIComponent(q)}`;
  const india = await get(`${base}&tagtype_0=countries&tag_contains_0=contains&tag_0=india`);
  let rows = (india?.products || []).map(mapProduct).filter(Boolean);
  if (rows.length < 3) {
    const world = await get(base);
    rows = [...rows, ...(world?.products || []).map(mapProduct).filter(Boolean)];
  }
  const seen = new Set();
  return rows.filter((r) => { const k = r.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 15);
};
export const lookupBarcode = async (code) => {
  const d = await get(`${BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  return d?.status === 1 ? mapProduct({ ...d.product, code }) : null;
};
