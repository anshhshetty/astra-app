import { addDays, rangeDays } from './dates.js';
import { round } from './nutrition.js';
import { goalFor, periodStats, workoutVolume } from './stats.js';
import { computeStreaks } from './streaks.js';

export const COACH_RULES = `You are Astra Coach, the coach inside Astra, a food and fitness app used mostly in India.

Scope: help only with food, nutrition, diet, gym training, running, swimming, recovery, sleep, healthy habits and using Astra. If asked about anything else, say in one line that you only help with food and fitness, then offer something related.

Style: talk like a good personal coach. Be short, direct and warm, in simple English. Lead with the answer. Keep replies under 120 words unless the person asks for a full routine or plan. Use short bullet lists when listing foods or exercises. Use Indian foods where they fit, and grams, kg, km and kcal. Say "about" for estimates. Use the person's data below when it helps, and never invent anything they did not log.

Astra features you can point to: the "Make my diet plan" button creates a downloadable daily meal plan with calorie, protein, carb and fat goals. Food can be logged from the plus button by photo, search, barcode or typing. If someone asks for a full diet or meal plan, suggest that button and give a short idea here.

Safety rules, always:
- You are not a doctor or dietitian. Do not diagnose or advise on medicines. For pain that is sharp or lasting, injury, chest pain, fainting, pregnancy, diabetes, kidney problems or any health condition, tell them to see a doctor or physiotherapist.
- Never give dosing or sourcing for steroids, SARMs, fat burners or other performance drugs, and do not recommend them. Follow the pack label for ordinary supplements such as whey or creatine.
- Never suggest crash diets, extreme fasting, dehydration, making weight quickly, purging, or below 1200 kcal a day for women or 1500 kcal a day for men.
- If the person is under 18, do not give weight-loss advice. Suggest they talk to a parent and a doctor.
- If someone seems to have an unhealthy relationship with food, exercise or their body, do not give calorie numbers, targets or plans. Respond with care and encourage them to talk to someone they trust or a professional.
- If someone mentions wanting to harm themselves or not wanting to live, respond with care, leave fitness aside, and urge them to reach someone now: Tele-MANAS on 14416 in India, or local emergency services.`;

const line = (label, v) => (v === undefined || v === null || v === '' ? '' : `${label}: ${v}\n`);

// What the coach may know. Never the person's name, photos, GPS routes or API key.
export const buildCoachContext = ({ now, today, profile, goal, todayLogs = [], week, streaks, workouts = [], activities = [], weight, sports = [], plan }) => {
  const t = todayLogs.reduce((a, l) => ({ kcal: a.kcal + (l.kcal || 0), p: a.p + (l.p || 0), c: a.c + (l.c || 0), f: a.f + (l.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
  let s = 'About this person (from their Astra data):\n';
  s += line('Date and time', `${today}, ${now}`);
  if (profile) s += line('Profile', `${profile.sex}, age ${profile.age}, ${profile.heightCm} cm, goal: ${profile.goal}`);
  s += line('Latest weight', weight ? `${weight} kg` : '');
  s += line('Trains', sports.join(', '));
  s += line('Daily goals', `${goal.kcal} kcal, ${goal.protein} g protein, ${goal.carbs} g carbs, ${goal.fat} g fat, ${goal.water} ml water, ${goal.workouts} workouts a week`);
  s += line('Eaten today', `${round(t.kcal)} kcal, ${round(t.p)} g protein, ${round(t.c)} g carbs, ${round(t.f)} g fat`);
  s += line('Foods today', todayLogs.slice(-12).map((l) => `${l.name}${l.grams ? ` ${round(l.grams)} g` : ''} (${l.meal})`).join('; ') || 'nothing logged yet');
  if (week) s += line('Last 7 days', `food logged ${week.daysLogged} days, average ${week.avgKcal} kcal and ${week.avgProtein} g protein on those days, ${week.workouts} gym sessions, ${week.runs} runs (${week.runKm} km), ${week.swims} swims (${week.swimM} m)`);
  if (streaks) s += line('Streaks', `food ${streaks.food.current}, gym ${streaks.gym.current}, run ${streaks.run.current}, swim ${streaks.swim.current}, protein ${streaks.protein.current} days`);
  s += line('Recent gym sessions', workouts.slice(0, 3).map((w) => `${w.date}: ${w.name || 'Workout'}, ${(w.exercises || []).map((e) => e.name).slice(0, 6).join(', ')}, ${round(workoutVolume(w))} kg lifted`).join(' | '));
  s += line('Recent runs and swims', activities.slice(0, 3).map((a) => `${a.date}: ${a.sport}, ${round(a.meters)} m in ${round(a.seconds / 60)} min`).join(' | '));
  if (plan) s += line('Current diet plan', `${plan.dietLabel || ''}, ${plan.targets.kcal} kcal, ${plan.targets.protein} g protein`);
  return s;
};

export const contextFromData = ({ all, today, now, weight, plan }) => {
  const { logs, summaries, settings, workouts, activities, body } = all;
  const days = rangeDays(addDays(today, -6), today);
  const goal = goalFor(settings.goalHistory, today);
  return buildCoachContext({
    now,
    today,
    profile: settings.profile,
    goal,
    todayLogs: logs.filter((l) => l.date === today),
    week: periodStats(days, summaries, today, body, settings.goalHistory),
    streaks: computeStreaks(summaries, today, goal.workouts),
    workouts: workouts.filter((w) => w.endedAt).sort((a, b) => b.date.localeCompare(a.date)),
    activities: activities.filter((a) => a.status === 'done').sort((a, b) => b.date.localeCompare(a.date)),
    weight,
    sports: settings.sports || ['gym'],
    plan,
  });
};
export const wantsPlan = (text) => /\b(diet|meal)\s*(plan|chart)\b|\bwhat should my (calorie|protein|macro)|\bmy (calorie|protein|macro|fat) (goal|target)s?\b/i.test(text);
