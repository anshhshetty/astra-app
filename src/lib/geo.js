// Pure helpers for GPS tracks, calories and formatting. Points are [lat, lon, timeMs].
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export const haversine = (a, b) => {
  const dLat = rad(b[0] - a[0]); const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export const trackDistance = (pts) => pts.reduce((s, p, i) => (i ? s + haversine(pts[i - 1], p) : 0), 0);

// GPS jumps around, so ignore poor readings, standing-still jitter and impossible speeds.
export const MAX_ACCURACY_M = 35;
export const shouldAccept = (prev, p, accuracy, maxSpeed = 12) => {
  if (accuracy != null && accuracy > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const d = haversine(prev, p);
  if (d < Math.max(3, (accuracy || 0) / 4)) return false;
  const dt = (p[2] - prev[2]) / 1000;
  return dt > 0 && d / dt <= maxSpeed;
};

// Removes the first and last stretch so a shared map doesn't show where you live.
export const trimEnds = (pts, metres = 200) => {
  if (trackDistance(pts) < metres * 3) return pts;
  let a = 0; let d = 0;
  while (a < pts.length - 1 && d < metres) { d += haversine(pts[a], pts[a + 1]); a += 1; }
  let b = pts.length - 1; d = 0;
  while (b > a && d < metres) { d += haversine(pts[b - 1], pts[b]); b -= 1; }
  return pts.slice(a, b + 1);
};

const interp = (table, x) => {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1]; const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
};
// MET values from the Compendium of Physical Activities.
const RUN_MET = [[3.2, 2.8], [4.8, 3.5], [6.4, 5], [8, 8.3], [9.7, 9.8], [11.3, 11], [12.9, 11.8], [14.5, 12.8], [16, 14.5], [19.3, 19.8]];
export const SWIM_EFFORT = [
  { id: 'easy', label: 'Easy', met: 5.8 },
  { id: 'steady', label: 'Steady', met: 7 },
  { id: 'hard', label: 'Hard', met: 9.8 },
];
export const SWIM_STROKES = ['Freestyle', 'Breaststroke', 'Backstroke', 'Butterfly', 'Mixed'];
export const runCalories = (metres, seconds, kg) => {
  if (!(seconds > 0)) return 0;
  const kmh = (metres / 1000) / (seconds / 3600);
  return Math.round(interp(RUN_MET, kmh) * kg * (seconds / 3600));
};
export const swimCalories = (seconds, kg, effort = 'steady') => {
  const met = (SWIM_EFFORT.find((e) => e.id === effort) || SWIM_EFFORT[1]).met;
  return Math.round(met * kg * (seconds / 3600));
};

export const fmtClock = (s) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const x = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
export const fmtDuration = (s) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const x = t % 60;
  return h ? `${h}h ${m}m` : `${m}m ${x}s`;
};
export const fmtKm = (m) => (m / 1000).toFixed(2);
const paceOf = (metres, seconds, per) => {
  if (!(metres > 0) || !(seconds > 0)) return '--:--';
  const s = Math.round(seconds / (metres / per));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const runPace = (m, s) => paceOf(m, s, 1000);
export const swimPace = (m, s) => paceOf(m, s, 100);
