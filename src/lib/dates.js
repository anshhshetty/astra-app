// All day keys are LOCAL dates (YYYY-MM-DD). Never use toISOString here: IST is
// UTC+5:30, so before 5:30am that would file food under yesterday.
const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const todayKey = () => toKey(new Date());
export const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
export const weekStart = (k) => { const d = fromKey(k); return addDays(k, -((d.getDay() + 6) % 7)); };
export const weekDays = (k) => { const s = weekStart(k); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); };
export const monthStart = (k) => `${k.slice(0, 7)}-01`;
export const monthDays = (k) => {
  const s = fromKey(monthStart(k));
  const n = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => addDays(monthStart(k), i));
};
export const addMonths = (k, n) => { const d = fromKey(monthStart(k)); d.setMonth(d.getMonth() + n); return toKey(d); };
export const rangeDays = (from, to) => { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; };
const f = (k, o) => fromKey(k).toLocaleDateString('en-IN', o);
export const fmtDay = (k) => f(k, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtShort = (k) => f(k, { day: 'numeric', month: 'short' });
export const fmtDow = (k) => f(k, { weekday: 'narrow' });
export const fmtMonth = (k) => f(k, { month: 'long', year: 'numeric' });
export const friendlyDay = (k) => {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  return fmtDay(k);
};
