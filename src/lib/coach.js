import { fmtNum } from './format.js';

export const defaultMeal = (meals, hour = new Date().getHours()) => (hour < 11 ? meals[0] : hour < 16 ? meals[1] : hour < 19 ? meals[2] : meals[3]);

// One plain sentence telling a beginner what to do next.
export const nextStep = ({ kcal, protein, goalKcal, goalProtein, isToday }) => {
  if (!isToday) {
    return kcal > 0
      ? { title: 'A past day', text: `You ate ${fmtNum(kcal)} kcal and ${fmtNum(protein)} g protein. Anything you add now goes on this date.` }
      : { title: 'A past day', text: 'Nothing logged here. Anything you add now goes on this date.' };
  }
  const kLeft = Math.round(goalKcal - kcal);
  const pLeft = Math.round(goalProtein - protein);
  if (kcal <= 0) return { title: 'Start here', text: 'Snap or search your first meal to start loading the bar.' };
  const near = Math.abs(kLeft) <= goalKcal * 0.1;
  if (near && pLeft <= 0) return { title: 'Bar fully loaded', text: 'You hit both targets today. Great work.' };
  const chicken = pLeft > 0 ? Math.round((pLeft / 0.31) / 10) * 10 : 0;
  const hint = pLeft >= 15 ? ` That's about ${fmtNum(chicken)} g cooked chicken breast.` : '';
  if (kLeft < -goalKcal * 0.1) {
    return pLeft > 0
      ? { title: 'Over on calories', text: `You still need ${fmtNum(pLeft)} g protein, so pick something lean.${hint}` }
      : { title: 'Over on calories', text: `You're ${fmtNum(-kLeft)} kcal over, but protein is done. Tomorrow is a fresh start.` };
  }
  if (pLeft <= 0) return { title: 'Protein done', text: `Now eat about ${fmtNum(Math.max(kLeft, 0))} more kcal of anything you like.` };
  return { title: 'Keep going', text: `Eat ${fmtNum(Math.max(kLeft, 0))} more kcal and ${fmtNum(pLeft)} g more protein today.${hint}` };
};

const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];
export const nextMilestone = (current) => {
  const m = MILESTONES.find((x) => x > current);
  return m ? { at: m, left: m - current } : null;
};
export const startChecklist = ({ hasKey, hasFood, hasWorkout, hasBackup }) => [
  { id: 'food', title: 'Log your first food', sub: 'Search for it, or use a photo', done: hasFood },
  { id: 'key', title: 'Turn on photo recognition', sub: 'Free, takes about 2 minutes', done: hasKey },
  { id: 'gym', title: 'Finish your first workout', sub: 'Ready-made routines are included', done: hasWorkout },
  { id: 'backup', title: 'Save your first backup', sub: 'Keeps your data safe', done: hasBackup },
];

// Places food labels on a photo so they don't sit on top of each other. Positions are percentages.
export const layoutTags = (items) => {
  const spots = items.map((it, i) => ({
    i,
    x: it.spot?.x ?? (i % 2 ? 66 : 34),
    y: it.spot?.y ?? (18 + (i * 64) / Math.max(1, items.length)),
  }));
  const GAP = 17;
  const sorted = [...spots].sort((a, b) => a.y - b.y);
  sorted.forEach((s, n) => { if (n && s.y - sorted[n - 1].y < GAP) s.y = sorted[n - 1].y + GAP; });
  for (let n = sorted.length - 1; n >= 0; n--) {
    const max = n === sorted.length - 1 ? 90 : sorted[n + 1].y - GAP;
    if (sorted[n].y > max) sorted[n].y = max;
  }
  return spots.map((s) => ({ x: s.x, y: Math.max(8, s.y) }));
};
