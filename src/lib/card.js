import { fitView, project, drawTiles, drawRoute, MAP_CREDIT } from './mapdraw.js';
import { fmtDuration, fmtKm, runPace, swimPace, trimEnds } from './geo.js';
import { fmtDay } from './dates.js';
import { LOGO_H, LOGO_PATH, LOGO_W } from '../components/logo.js';

export const CARD_BRAND = 'ASTRA';
const FONT = "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const ROUND = "'Big Shoulders Display', 'Impact', -apple-system, system-ui, sans-serif";

export const cardStats = (a) => (a.sport === 'swim'
  ? [['Distance', `${Math.round(a.meters).toLocaleString('en-IN')} m`], ['Pace', `${swimPace(a.meters, a.seconds)} /100m`], ['Time', fmtDuration(a.seconds)]]
  : [['Distance', `${fmtKm(a.meters)} km`], ['Pace', `${runPace(a.meters, a.seconds)} /km`], ['Time', fmtDuration(a.seconds)]]);

const coverImage = (ctx, img, W, H) => {
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s; const h = img.naturalHeight * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
};
const roundPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
const wave = (ctx, cx, cy, width) => {
  const pts = [];
  for (let i = 0; i <= 80; i++) pts.push([cx - width / 2 + (i / 80) * width, cy + Math.sin((i / 80) * Math.PI * 5) * 18]);
  drawRoute(ctx, pts, (p) => p, 9);
};

// Draws a route alone, scaled to a box, with no map under it.
const routeInBox = (ctx, pts, x, y, w, h, width) => {
  const v = fitView(pts, w, h, { pad: 6, maxZoom: 20 });
  drawRoute(ctx, pts, (p) => { const [a, b] = project(v, p); return [a + x, b + y]; }, width);
};

const statsStack = (ctx, a, cx, top, { size = 92 } = {}) => {
  let y = top;
  ctx.textAlign = 'center';
  for (const [label, value] of cardStats(a)) {
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = `500 ${Math.round(size * 0.37)}px ${FONT}`;
    ctx.fillText(label, cx, y);
    y += size * 0.92;
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${size}px ${ROUND}`;
    ctx.fillText(value, cx, y);
    y += size * 0.74;
  }
  return y;
};
const shadow = (ctx, on) => { ctx.shadowColor = on ? 'rgba(0,0,0,.55)' : 'transparent'; ctx.shadowBlur = on ? 18 : 0; ctx.shadowOffsetY = on ? 2 : 0; };
// Draws your Astra logo with its baseline at y.
const brand = (ctx, cx, y, size = 44) => {
  const w = size * 6.4; const k = w / LOGO_W; const h = LOGO_H * k;
  ctx.save();
  ctx.translate(cx - w / 2, y - h);
  ctx.scale(k, k);
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(LOGO_PATH));
  ctx.restore();
};

// options: { bg: 'photo'|'map'|'plain'|'sticker', ratio: 'story'|'post', mini: bool, hideEnds: bool, photo: HTMLImageElement }
export const renderCard = async (canvas, activity, points, options) => {
  const { bg, ratio, mini, hideEnds, photo } = options;
  // Canvas needs the fonts loaded first, or it silently draws in a default font.
  try { await Promise.all([document.fonts?.load?.(`800 92px ${ROUND}`), document.fonts?.load?.(`500 30px ${FONT}`)]); } catch { /* falls back */ }
  const W = 1080; const H = ratio === 'story' ? 1920 : 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const hasRoute = activity.sport !== 'swim' && points.length > 1;
  const pts = hasRoute ? (hideEnds ? trimEnds(points) : points) : [];
  let credit = false;

  if (bg === 'map' && hasRoute) {
    const v = fitView(pts, W, H * 0.62, { pad: 110, scale: 2 });
    v.h = H; v.cy -= ((H * 0.62) / 2 - H / 2) / 2; // keep the route in the upper part
    credit = await drawTiles(ctx, v, { dark: true });
    drawRoute(ctx, pts, (p) => project(v, p), 11);
    const g = ctx.createLinearGradient(0, H * 0.48, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,.82)'); g.addColorStop(1, 'rgba(0,0,0,.96)');
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.48, W, H * 0.52);
    const stats = cardStats(activity);
    ctx.textAlign = 'center';
    stats.forEach(([label, value], i) => {
      const cx = W * (i * 2 + 1) / 6;
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `500 32px ${FONT}`; ctx.fillText(label, cx, H - 300);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${value.length > 9 ? 54 : 64}px ${ROUND}`; ctx.fillText(value, cx, H - 240);
    });
    brand(ctx, W / 2, H - 120);
  } else {
    if (bg === 'photo' && photo) {
      coverImage(ctx, photo, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(0.55, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,.05)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (bg !== 'sticker') {
      const base = ctx.createLinearGradient(0, 0, W * 0.3, H); base.addColorStop(0, '#1C3F58'); base.addColorStop(0.5, '#0E2233'); base.addColorStop(1, '#091420');
      ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
      for (const [x, y, c] of [[W, 0, 'rgba(255,122,47,.42)'], [0, H * 0.6, 'rgba(70,160,220,.3)'], [W * 0.6, H, 'rgba(255,122,47,.22)']]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.8);
        g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    const top = ratio === 'story' ? 300 : 130;
    shadow(ctx, bg === 'photo' || bg === 'sticker');
    const after = statsStack(ctx, activity, W / 2, top);
    const boxW = 420; const boxH = ratio === 'story' ? 340 : 240;
    const boxY = after + 10;
    shadow(ctx, false);
    if (hasRoute && mini) {
      const v = fitView(pts, boxW, boxH, { pad: 34, scale: 1 });
      const off = document.createElement('canvas'); off.width = boxW; off.height = boxH;
      const o = off.getContext('2d');
      credit = await drawTiles(o, v, { dark: true });
      drawRoute(o, pts, (p) => project(v, p), 6);
      ctx.save(); roundPath(ctx, (W - boxW) / 2, boxY, boxW, boxH, 30); ctx.clip();
      ctx.drawImage(off, (W - boxW) / 2, boxY); ctx.restore();
    } else if (hasRoute) {
      routeInBox(ctx, pts, (W - boxW) / 2, boxY, boxW, boxH, 9);
    } else if (activity.sport === 'swim') {
      wave(ctx, W / 2, boxY + 50, 380);
    }
    shadow(ctx, bg === 'photo' || bg === 'sticker');
    brand(ctx, W / 2, boxY + (hasRoute ? boxH + 84 : 150));
    shadow(ctx, false);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  if (credit) { ctx.font = `400 22px ${FONT}`; ctx.fillText(MAP_CREDIT, W / 2, H - 28); }
  return { width: W, height: H };
};
export const cardBlob = (canvas, sticker) => new Promise((res) => canvas.toBlob(res, sticker ? 'image/png' : 'image/jpeg', 0.92));
export const cardTitle = (a) => `${a.sport === 'swim' ? 'Swim' : 'Run'}, ${fmtDay(a.date)}`;
