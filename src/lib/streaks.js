import { addDays, weekStart } from './dates.js';

// Walks a day-by-day status: 'hit' adds 1, 'skip' keeps the run alive without
// adding, 'miss' ends it. Today can never break a streak, because the day isn't over.
const walk = (days, today, statusOf) => {
  let current = 0;
  for (let k = today; k >= days[0] && days.length; k = addDays(k, -1)) {
    const s = statusOf(k);
    if (s === 'hit') current++;
    else if (s === 'miss' && k !== today) break;
  }
  let best = 0; let run = 0;
  for (let k = days[0]; days.length && k <= today; k = addDays(k, 1)) {
    const s = statusOf(k);
    if (s === 'hit') { run++; best = Math.max(best, run); }
    else if (s === 'miss' && k !== today) run = 0;
  }
  return { current, best };
};

// summaries: { [dateKey]: { logged, kcal, p, workout, rest, water, goal:{kcal,protein,water} } }
export const computeStreaks = (summaries, today, weeklyWorkoutTarget = 4) => {
  const keys = Object.keys(summaries).sort();
  const first = keys[0] && keys[0] <= today ? keys[0] : today;
  const days = [first];
  const s = (k) => summaries[k] || {};
  const allowedRest = Math.max(0, 7 - weeklyWorkoutTarget);
  const restUsed = {};
  const coveredRest = new Set();
  for (const k of keys) {
    if (!summaries[k].rest || summaries[k].workout || summaries[k].run || summaries[k].swim) continue;
    const w = weekStart(k);
    restUsed[w] = (restUsed[w] || 0) + 1;
    if (restUsed[w] <= allowedRest) coveredRest.add(k);
  }
  return {
    food: walk(days, today, (k) => (s(k).logged ? 'hit' : 'miss')),
    protein: walk(days, today, (k) => (s(k).goal && s(k).p >= s(k).goal.protein ? 'hit' : 'miss')),
    calories: walk(days, today, (k) => {
      const d = s(k);
      return d.goal && d.kcal > 0 && Math.abs(d.kcal - d.goal.kcal) <= d.goal.kcal * 0.1 ? 'hit' : 'miss';
    }),
    gym: walk(days, today, (k) => (s(k).workout ? 'hit' : coveredRest.has(k) ? 'skip' : 'miss')),
    run: walk(days, today, (k) => (s(k).run ? 'hit' : coveredRest.has(k) ? 'skip' : 'miss')),
    swim: walk(days, today, (k) => (s(k).swim ? 'hit' : coveredRest.has(k) ? 'skip' : 'miss')),
    active: walk(days, today, (k) => (s(k).workout || s(k).run || s(k).swim ? 'hit' : coveredRest.has(k) ? 'skip' : 'miss')),
    water: walk(days, today, (k) => (s(k).goal && s(k).water >= s(k).goal.water ? 'hit' : 'miss')),
  };
};
