// Draws OpenStreetMap tiles and a route onto any canvas. Used for the live map and share cards.
const TILE = 256;
const cache = new Map();
const worldX = (lon, z) => ((lon + 180) / 360) * TILE * 2 ** z;
const worldY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
export const fitView = (pts, w, h, { pad = 40, scale = 1, maxZoom = 17 } = {}) => {
  const lats = pts.map((p) => p[0]); const lons = pts.map((p) => p[1]);
  const [n, s, e, wst] = [Math.max(...lats), Math.min(...lats), Math.max(...lons), Math.min(...lons)];
  let z = maxZoom;
  for (; z > 2; z--) {
    const dx = (worldX(e, z) - worldX(wst, z)) * scale; const dy = (worldY(s, z) - worldY(n, z)) * scale;
    if (dx <= w - pad * 2 && dy <= h - pad * 2) break;
  }
  return { z, scale, cx: (worldX(e, z) + worldX(wst, z)) / 2, cy: (worldY(s, z) + worldY(n, z)) / 2, w, h };
};
export const project = (v, p) => [(worldX(p[1], v.z) - v.cx) * v.scale + v.w / 2, (worldY(p[0], v.z) - v.cy) * v.scale + v.h / 2];

const loadTile = (z, x, y) => {
  const key = `${z}/${x}/${y}`;
  if (cache.has(key)) return cache.get(key);
  const pr = new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => { cache.delete(key); res(null); };
    img.src = `https://tile.openstreetmap.org/${key}.png`;
  });
  cache.set(key, pr);
  return pr;
};

// Returns true if at least one map tile loaded, so callers know to show the map credit.
export const drawTiles = async (ctx, v, { dark = true } = {}) => {
  const size = TILE * v.scale;
  const left = v.cx - v.w / 2 / v.scale; const top = v.cy - v.h / 2 / v.scale;
  const max = 2 ** v.z;
  const jobs = [];
  for (let x = Math.floor(left / TILE); x * TILE < left + v.w / v.scale; x++) {
    for (let y = Math.floor(top / TILE); y * TILE < top + v.h / v.scale; y++) {
      if (y < 0 || y >= max) continue;
      const wrapped = ((x % max) + max) % max;
      jobs.push(loadTile(v.z, wrapped, y).then((img) => ({ img, dx: (x * TILE - left) * v.scale, dy: (y * TILE - top) * v.scale })));
    }
  }
  const tiles = await Promise.all(jobs);
  ctx.save();
  ctx.fillStyle = dark ? '#0E2030' : '#E7EFE9';
  ctx.fillRect(0, 0, v.w, v.h);
  let any = false;
  for (const t of tiles) if (t.img) { ctx.drawImage(t.img, t.dx, t.dy, size + 1, size + 1); any = true; }
  if (any && dark) {
    // Canvas filters don't work on iPhone, but blend modes do. Remove colour, then subtract the
    // land colour so land goes near black while roads, water and labels stay lighter, then brighten.
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, v.w, v.h);
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#E6E6E6'; ctx.fillRect(0, 0, v.w, v.h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ctx.canvas, 0, 0); ctx.restore();
    }
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#84B4D6'; ctx.fillRect(0, 0, v.w, v.h);
  }
  ctx.restore();
  return any;
};

export const drawRoute = (ctx, pts, toXY, width = 6) => {
  if (pts.length < 2) return;
  const xy = pts.map(toXY);
  const trace = () => { ctx.beginPath(); xy.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  const [a, b] = [xy[0], xy[xy.length - 1]];
  const g = ctx.createLinearGradient(a[0], a[1], b[0] === a[0] && b[1] === a[1] ? a[0] + 1 : b[0], b[1]);
  g.addColorStop(0, '#FFC27A'); g.addColorStop(0.5, '#FF8A3D'); g.addColorStop(1, '#F2571B');
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  trace(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = width + width * 0.7; ctx.stroke();
  trace(); ctx.strokeStyle = g; ctx.lineWidth = width; ctx.stroke();
  ctx.restore();
};
export const MAP_CREDIT = '© OpenStreetMap contributors';
