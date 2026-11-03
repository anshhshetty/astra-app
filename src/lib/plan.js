import { AiError, normaliseItemNumber as num } from './gemini.js';
import { suggestTargets } from './nutrition.js';

export const DIET_TYPES = [
  { id: 'veg', label: 'Veg', prompt: 'lacto-vegetarian (no meat, fish or eggs; dairy is fine)' },
  { id: 'egg', label: 'Egg', prompt: 'vegetarian plus eggs (no meat or fish)' },
  { id: 'nonveg', label: 'Non-veg', prompt: 'non-vegetarian (chicken, fish, eggs and vegetarian foods)' },
  { id: 'vegan', label: 'Vegan', prompt: 'fully vegan (no meat, fish, eggs, dairy or honey)' },
];

// Astra won't plan weight loss for children or anyone already underweight.
export const planGuard = ({ age, heightCm, weightKg, goal }) => {
  const bmi = weightKg / ((heightCm / 100) ** 2);
  if (goal === 'lose' && age < 18) return { goal: 'keep', notice: "Astra doesn't make weight-loss plans for anyone under 18, so this plan keeps your weight steady. Talk to a doctor or dietitian about your goals." };
  if (goal === 'lose' && bmi < 18.5) return { goal: 'keep', notice: "Your weight is already in the underweight range, so this plan keeps your weight steady instead of lowering it. Talk to a doctor or dietitian about your goals." };
  return { goal, notice: '' };
};

export const planTargets = (profile, goal) => suggestTargets({ ...profile, goal });

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const normalisePlan = (raw) => {
  const meals = (raw?.meals || []).slice(0, 8).map((m) => ({
    name: text(m.name, 40) || 'Meal',
    time: text(m.time, 20),
    items: (m.items || []).slice(0, 10).map((it) => ({
      food: text(it.food, 80) || 'Food',
      amount: text(it.amount, 40),
      grams: Math.round(num(it.grams, 3000)),
      kcal: Math.round(num(it.kcal, 3000)),
      p: Math.round(num(it.protein, 400) * 10) / 10,
      c: Math.round(num(it.carbs, 600) * 10) / 10,
      f: Math.round(num(it.fat, 300) * 10) / 10,
    })).filter((it) => it.kcal > 0 || it.grams > 0),
  })).filter((m) => m.items.length);
  if (!meals.length) throw new AiError('parse', 'Google AI answered in an unexpected format. Try again.');
  return { meals, tips: (raw.tips || []).slice(0, 5).map((t) => text(t, 220)).filter(Boolean) };
};
export const planTotals = (plan) => plan.meals.reduce((a, m) => {
  for (const it of m.items) { a.kcal += it.kcal; a.p += it.p; a.c += it.c; a.f += it.f; }
  return a;
}, { kcal: 0, p: 0, c: 0, f: 0 });

// AI arithmetic drifts, so resize every portion to land on the calorie goal exactly.
export const fitToCalories = (plan, targetKcal) => {
  const total = planTotals(plan).kcal;
  if (!total) return plan;
  const k = targetKcal / total;
  if (Math.abs(k - 1) < 0.02 || k < 0.6 || k > 1.5) return plan;
  return {
    ...plan,
    meals: plan.meals.map((m) => ({
      ...m,
      items: m.items.map((it) => ({
        ...it,
        grams: Math.round((it.grams * k) / 5) * 5,
        kcal: Math.round(it.kcal * k),
        p: Math.round(it.p * k * 10) / 10,
        c: Math.round(it.c * k * 10) / 10,
        f: Math.round(it.f * k * 10) / 10,
        amount: Math.abs(k - 1) >= 0.08 ? '' : it.amount,
      })),
    })),
  };
};
// Tells the person honestly if the day still misses a goal.
export const planWarnings = (totals, targets) => {
  const out = [];
  const pDiff = targets.protein - totals.p;
  const kDiff = totals.kcal - targets.kcal;
  if (pDiff > targets.protein * 0.1) out.push(`This plan is about ${Math.round(pDiff)} g short of your protein goal. Add a protein food, or make a new plan.`);
  if (Math.abs(kDiff) > targets.kcal * 0.1) out.push(`This plan is about ${Math.abs(Math.round(kDiff))} kcal ${kDiff > 0 ? 'over' : 'under'} your calorie goal. Adjust your portions, or make a new plan.`);
  return out;
};
export const matchMeal = (name, meals, fallback) => {
  const n = name.toLowerCase();
  return meals.find((m) => n.includes(m.toLowerCase()))
    || (/snack|evening|pre|post|mid/.test(n) && meals.find((m) => /snack/i.test(m)))
    || fallback;
};
