export const round = (n, dp = 0) => { const m = 10 ** dp; return Math.round((Number(n) || 0) * m) / m; };
export const parseNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const n = parseFloat(String(v ?? '').replace(/,/g, '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
export const fromPer100 = (per100, grams) => {
  const g = Math.max(0, Number(grams) || 0) / 100;
  return {
    kcal: round(per100.kcal * g),
    p: round(per100.p * g, 1),
    c: round(per100.c * g, 1),
    f: round(per100.f * g, 1),
  };
};
export const sumLogs = (logs) => logs.reduce((a, l) => ({
  kcal: a.kcal + (l.kcal || 0), p: a.p + (l.p || 0), c: a.c + (l.c || 0), f: a.f + (l.f || 0),
}), { kcal: 0, p: 0, c: 0, f: 0 });

export const ACTIVITY = [
  { id: 1.2, label: 'Desk job, little exercise' },
  { id: 1.375, label: 'Gym 1–3 days a week' },
  { id: 1.55, label: 'Gym 3–5 days a week' },
  { id: 1.725, label: 'Gym 6–7 days a week' },
];
export const GOAL_TYPES = [
  { id: 'lose', label: 'Lose fat', kcal: -400, proteinPerKg: 2.0 },
  { id: 'keep', label: 'Stay the same', kcal: 0, proteinPerKg: 1.6 },
  { id: 'gain', label: 'Build muscle', kcal: 300, proteinPerKg: 1.8 },
];
// Mifflin-St Jeor resting energy x activity, then the goal adjustment.
export const suggestTargets = ({ sex, age, heightCm, weightKg, activity, goal }) => {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
  const type = GOAL_TYPES.find((g) => g.id === goal) || GOAL_TYPES[1];
  const floor = sex === 'female' ? 1200 : 1500;
  const kcal = Math.max(floor, Math.round((bmr * activity + type.kcal) / 10) * 10);
  const protein = Math.round(weightKg * type.proteinPerKg / 5) * 5;
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
};
// A day counts as "on target" for calories if it lands within 10% of the target.
export const calorieHit = (kcal, target) => kcal > 0 && Math.abs(kcal - target) <= target * 0.1;
