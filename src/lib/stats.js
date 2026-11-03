import { calorieHit, round } from './nutrition.js';
import { fromKey } from './dates.js';

export const DEFAULT_GOAL = { kcal: 2200, protein: 130, carbs: 250, fat: 60, water: 3000, workouts: 4 };

// Goals change over time. Old days keep the goal they had, so raising your protein
// target tomorrow can't erase the streak you already earned.
export const goalFor = (history, date) => {
  if (!history?.length) return DEFAULT_GOAL;
  const sorted = [...history].sort((a, b) => a.from.localeCompare(b.from));
  let g = sorted[0];
  for (const h of sorted) if (h.from <= date) g = h;
  return g;
};

const isWork = (s) => !s.warmup && s.done !== false;
export const setVolume = (s) => (isWork(s) ? (Number(s.w) || 0) * (Number(s.r) || 0) : 0);
export const workoutVolume = (w) => (w.exercises || []).reduce((a, e) =>
  a + (e.sets || []).reduce((b, s) => b + setVolume(s), 0), 0);
export const e1rm = (w, r) => (w > 0 && r > 0 ? (r === 1 ? w : w * (1 + r / 30)) : 0);

export const buildSummaries = ({ logs, days, workouts, goalHistory, activities = [] }) => {
  const out = {};
  const touch = (k) => (out[k] ||= { date: k, logged: false, kcal: 0, p: 0, c: 0, f: 0, water: 0, steps: 0, workout: false, rest: false, volume: 0, sets: 0, run: false, swim: false, runM: 0, swimM: 0, burned: 0, goal: goalFor(goalHistory, k) });
  for (const l of logs) { const d = touch(l.date); d.logged = true; d.kcal += l.kcal || 0; d.p += l.p || 0; d.c += l.c || 0; d.f += l.f || 0; }
  for (const x of days) { const d = touch(x.date); d.water = x.water || 0; d.steps = x.steps || 0; d.rest = !!x.rest; }
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const d = touch(w.date); d.workout = true; d.volume += workoutVolume(w);
    for (const e of w.exercises || []) d.sets += (e.sets || []).filter(isWork).length;
  }
  for (const a of activities) {
    if (a.status !== 'done') continue;
    const d = touch(a.date);
    d[a.sport] = true;
    if (a.sport === 'run') d.runM += a.meters || 0; else d.swimM += a.meters || 0;
    d.burned += a.kcal || 0;
  }
  return out;
};

// Goal progress for any list of days (a week or a month).
export const periodStats = (dayKeys, summaries, today, bodyRows = [], goalHistory = []) => {
  const list = dayKeys.map((k) => summaries[k]).filter(Boolean);
  const logged = list.filter((d) => d.logged);
  const elapsed = dayKeys.filter((k) => k <= today).length;
  const avg = (key) => (logged.length ? logged.reduce((a, d) => a + d[key], 0) / logged.length : 0);
  const inRange = bodyRows.filter((b) => b.weight && b.date >= dayKeys[0] && b.date <= dayKeys[dayKeys.length - 1])
    .sort((a, b) => a.date.localeCompare(b.date));
  const weeks = dayKeys.length / 7;
  const lastGoal = goalFor(goalHistory, dayKeys[dayKeys.length - 1]);
  return {
    totalDays: dayKeys.length,
    elapsed,
    daysLogged: logged.length,
    avgKcal: round(avg('kcal')),
    avgProtein: round(avg('p')),
    avgCarbs: round(avg('c')),
    avgFat: round(avg('f')),
    calorieDays: logged.filter((d) => calorieHit(d.kcal, d.goal.kcal)).length,
    proteinDays: logged.filter((d) => d.p >= d.goal.protein).length,
    waterDays: list.filter((d) => d.water >= d.goal.water).length,
    workouts: list.filter((d) => d.workout).length,
    workoutTarget: Math.round(lastGoal.workouts * weeks),
    volume: round(list.reduce((a, d) => a + d.volume, 0)),
    sets: list.reduce((a, d) => a + d.sets, 0),
    restDays: list.filter((d) => d.rest && !d.workout && !d.run && !d.swim).length,
    runs: list.filter((d) => d.run).length,
    swims: list.filter((d) => d.swim).length,
    runKm: round(list.reduce((a, d) => a + d.runM, 0) / 1000, 1),
    swimM: round(list.reduce((a, d) => a + d.swimM, 0)),
    burned: round(list.reduce((a, d) => a + d.burned, 0)),
    weightStart: inRange[0]?.weight ?? null,
    weightEnd: inRange[inRange.length - 1]?.weight ?? null,
    weightChange: inRange.length > 1 ? round(inRange[inRange.length - 1].weight - inRange[0].weight, 1) : null,
  };
};

export const muscleSets = (workouts, from, to) => {
  const out = {};
  for (const w of workouts) {
    if (!w.endedAt || w.date < from || w.date > to) continue;
    for (const e of w.exercises || []) {
      const n = (e.sets || []).filter(isWork).length;
      if (n && e.muscle && e.muscle !== 'Cardio') out[e.muscle] = (out[e.muscle] || 0) + n;
    }
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
};

// Best set per exercise, plus how each session compares, for PR badges and charts.
export const exerciseHistory = (workouts) => {
  const out = {};
  const sorted = [...workouts].filter((w) => w.endedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt || 0) - (b.startedAt || 0));
  for (const w of sorted) {
    for (const e of w.exercises || []) {
      if (e.kind === 'cardio') continue;
      const rec = (out[e.name] ||= { name: e.name, muscle: e.muscle, sessions: [], bestWeight: 0, bestE1rm: 0, prs: 0 });
      let top = 0; let topW = 0; let topR = 0; let vol = 0;
      for (const s of e.sets || []) {
        if (!isWork(s)) continue;
        const v = e1rm(Number(s.w) || 0, Number(s.r) || 0);
        vol += setVolume(s);
        if (v > top) { top = v; topW = Number(s.w); topR = Number(s.r); }
      }
      if (!top) continue;
      const isPr = rec.sessions.length > 0 && top > rec.bestE1rm;
      if (isPr) rec.prs++;
      rec.sessions.push({ date: w.date, e1rm: round(top, 1), w: topW, r: topR, volume: vol, pr: isPr, workoutId: w.id });
      rec.bestE1rm = Math.max(rec.bestE1rm, top);
      rec.bestWeight = Math.max(rec.bestWeight, topW);
    }
  }
  return out;
};
export const prsInRange = (hist, from, to) => {
  const out = [];
  for (const r of Object.values(hist)) for (const s of r.sessions) if (s.pr && s.date >= from && s.date <= to) out.push({ name: r.name, ...s });
  return out.sort((a, b) => b.date.localeCompare(a.date));
};
export const dayOfWeekIdx = (k) => (fromKey(k).getDay() + 6) % 7;
