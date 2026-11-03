import { COACH_RULES, buildCoachContext, wantsPlan } from '../src/lib/coach-brain.js';
import { fitToCalories, matchMeal, normalisePlan, planGuard, planTargets, planTotals, planWarnings } from '../src/lib/plan.js';
import { parseRich } from '../src/lib/rich.js';
import { streamChat } from '../src/lib/gemini.js';
import Dexie from 'dexie';
import { fmtClock, fmtDuration, haversine, runCalories, runPace, shouldAccept, swimCalories, swimPace, trackDistance, trimEnds } from '../src/lib/geo.js';
import { fitView, project } from '../src/lib/mapdraw.js';
import { CARD_BRAND, cardStats } from '../src/lib/card.js';
import { defaultMeal, layoutTags, nextMilestone, nextStep, startChecklist } from '../src/lib/coach.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { addDays, addMonths, monthDays, toKey, weekDays, weekStart } from '../src/lib/dates.js';
import { computeStreaks } from '../src/lib/streaks.js';
import { buildSummaries, exerciseHistory, goalFor, periodStats, prsInRange, workoutVolume } from '../src/lib/stats.js';
import { calorieHit, fromPer100, parseNum, suggestTargets } from '../src/lib/nutrition.js';
import { analysePhoto, normaliseItem, parseJsonLoose, rankModels, verifyItems } from '../src/lib/gemini.js';
import { mapProduct } from '../src/lib/off.js';
import { buildRows, toCsv } from '../src/lib/exporters.js';
import { searchBuiltin, BUILTIN_FOODS } from '../src/data/foods.js';
import { db } from '../src/lib/db.js';
import { makeBackup, restoreBackup } from '../src/lib/exporters.js';

const G = { from: '2000-01-01', kcal: 2000, protein: 100, carbs: 200, fat: 50, water: 2000, workouts: 4 };
const food = (date, kcal = 2000, p = 100) => ({ date, kcal, p, c: 0, f: 0 });
const lift = (date, w, r = 5, name = 'Squat') => ({ date, endedAt: 1, startedAt: 1, id: `${date}${w}`, exercises: [{ name, muscle: 'Legs', kind: 'weight', sets: [{ w, r, done: true }] }] });
const S = (o) => buildSummaries({ logs: o.logs || [], days: o.days || [], workouts: o.workouts || [], goalHistory: o.goals || [G] });

describe('dates', () => {
  it('uses the local day, including just after midnight in India', () => {
    expect(process.env.TZ).toBe('Asia/Kolkata');
    expect(toKey(new Date(2026, 10, 2, 0, 30))).toBe('2026-11-02');
  });
  it('steps across month, year and leap boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(monthDays('2028-02-10')).toHaveLength(29);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
  });
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekDays('2026-11-05')[6]).toBe('2026-11-08');
  });
});

describe('streaks', () => {
  const T = '2026-11-10';
  it('counts back from yesterday when today has nothing yet', () => {
    const s = S({ logs: [food('2026-11-07'), food('2026-11-08'), food('2026-11-09')] });
    expect(computeStreaks(s, T).food.current).toBe(3);
  });
  it('includes today once logged', () => {
    const s = S({ logs: [food('2026-11-09'), food(T)] });
    expect(computeStreaks(s, T).food.current).toBe(2);
  });
  it('a missed day resets current but keeps best', () => {
    const s = S({ logs: ['01', '02', '03', '04', '08', '09'].map((d) => food(`2026-11-${d}`)) });
    const r = computeStreaks(s, T).food;
    expect(r.current).toBe(2);
    expect(r.best).toBe(4);
  });
  it('protein streak needs the target and uses the goal of that day', () => {
    const goals = [G, { ...G, from: '2026-11-09', protein: 150 }];
    const s = S({ goals, logs: [food('2026-11-08', 2000, 100), food('2026-11-09', 2000, 140)] });
    expect(computeStreaks(s, T).protein.current).toBe(0);
    const s2 = S({ goals, logs: [food('2026-11-08', 2000, 100), food('2026-11-09', 2000, 150)] });
    expect(computeStreaks(s2, T).protein.current).toBe(2);
  });
  it('raising a goal later does not erase old hits', () => {
    expect(goalFor([G, { ...G, from: '2026-11-09', protein: 150 }], '2026-11-08').protein).toBe(100);
  });
  it('calories count only within 10% of target', () => {
    const s = S({ logs: [food('2026-11-08', 2200), food('2026-11-09', 2300)] });
    expect(computeStreaks(s, T).calories.current).toBe(0);
    const s2 = S({ logs: [food('2026-11-08', 2300), food('2026-11-09', 1800)] });
    expect(computeStreaks(s2, T).calories.current).toBe(1);
    expect(calorieHit(0, 2000)).toBe(false);
  });
  it('a marked rest day keeps the gym streak but adds nothing', () => {
    const s = S({ workouts: [lift('2026-11-08', 50), lift('2026-11-10', 50)], days: [{ date: '2026-11-09', rest: true }] });
    expect(computeStreaks(s, T, 4).gym.current).toBe(2);
  });
  it('an unmarked gap breaks the gym streak', () => {
    const s = S({ workouts: [lift('2026-11-07', 50), lift('2026-11-09', 50)] });
    expect(computeStreaks(s, T, 4).gym.current).toBe(1);
  });
  it('rest days beyond the weekly allowance break the gym streak', () => {
    // Target 6 days a week allows 1 rest day; 2 marked rest days in one week break it.
    const s = S({ workouts: [lift('2026-11-02', 50), lift('2026-11-05', 50)], days: [{ date: '2026-11-03', rest: true }, { date: '2026-11-04', rest: true }] });
    expect(computeStreaks(s, '2026-11-05', 6).gym.current).toBe(1);
    expect(computeStreaks(s, '2026-11-05', 4).gym.current).toBe(2);
  });
  it('an open workout does not count until it is finished', () => {
    const s = S({ workouts: [{ date: T, endedAt: null, exercises: [] }] });
    expect(computeStreaks(s, T).gym.current).toBe(0);
  });
  it('handles no data', () => {
    expect(computeStreaks({}, T).food).toEqual({ current: 0, best: 0 });
  });
});

describe('week and month stats', () => {
  it('adds up goals for a week', () => {
    const days = weekDays('2026-11-05');
    const s = S({
      logs: [food(days[0], 2000, 120), food(days[1], 3000, 80), food(days[1], 0, 0)],
      days: [{ date: days[0], water: 2500 }],
      workouts: [lift(days[0], 100, 5)],
    });
    const r = periodStats(days, s, '2026-11-08', [{ date: days[0], weight: 70 }, { date: days[6], weight: 69.5 }], [G]);
    expect(r).toMatchObject({ daysLogged: 2, avgKcal: 2500, avgProtein: 100, proteinDays: 1, calorieDays: 1, waterDays: 1, workouts: 1, workoutTarget: 4, volume: 500, weightChange: -0.5 });
  });
  it('scales the workout target to the month', () => {
    const days = monthDays('2026-11-01');
    expect(periodStats(days, {}, '2026-11-30', [], [G]).workoutTarget).toBe(17);
  });
  it('volume skips warm-ups', () => {
    expect(workoutVolume({ exercises: [{ sets: [{ w: 100, r: 5, done: true }, { w: 40, r: 10, warmup: true, done: true }] }] })).toBe(500);
  });
  it('marks PRs but not the first session', () => {
    const h = exerciseHistory([lift('2026-11-01', 100), lift('2026-11-03', 110), lift('2026-11-05', 105)]);
    expect(h.Squat.sessions.map((s) => s.pr)).toEqual([false, true, false]);
    expect(h.Squat.bestWeight).toBe(110);
    expect(prsInRange(h, '2026-11-01', '2026-11-30')).toHaveLength(1);
  });
});

describe('nutrition', () => {
  it('scales per-100 g values to the weight you enter', () => {
    expect(fromPer100({ kcal: 165, p: 31, c: 0, f: 3.6 }, 180)).toEqual({ kcal: 297, p: 55.8, c: 0, f: 6.5 });
    expect(fromPer100({ kcal: 165, p: 31, c: 0, f: 3.6 }, 0).kcal).toBe(0);
  });
  it('reads numbers typed with a comma', () => { expect(parseNum('12,5')).toBe(12.5); expect(parseNum('')).toBeNaN(); });
  it('suggests sane targets and never goes below the floor', () => {
    const t = suggestTargets({ sex: 'male', age: 28, heightCm: 175, weightKg: 75, activity: 1.55, goal: 'gain' });
    expect(t.kcal).toBeGreaterThan(2500); expect(t.kcal).toBeLessThan(3200); expect(t.protein).toBe(135);
    expect(suggestTargets({ sex: 'female', age: 60, heightCm: 145, weightKg: 40, activity: 1.2, goal: 'lose' }).kcal).toBe(1200);
  });
  it('built-in list is sound and finds Hindi names', () => {
    for (const f of BUILTIN_FOODS) {
      const { kcal, p, c, f: fat } = f.per100;
      expect(kcal).toBeLessThanOrEqual(900);
      expect(p + c + fat, f.name).toBeLessThanOrEqual(110);
      // Atwater check: stated calories should roughly match the macros.
      const est = p * 4 + c * 4 + fat * 9;
      if (kcal > 60) expect(Math.abs(est - kcal) / kcal, `${f.name} kcal ${kcal} vs ${est}`).toBeLessThan(0.3);
    }
    expect(searchBuiltin('dahi')[0].name).toBe('Curd');
    expect(searchBuiltin('anda').length).toBeGreaterThan(2);
  });
});

describe('AI and online parsing', () => {
  it('reads JSON wrapped in code fences or chatter', () => {
    expect(parseJsonLoose('Here:\n```json\n{"items":[{"name":"Dal"}]}\n```').items[0].name).toBe('Dal');
    expect(() => parseJsonLoose('sorry, no')).toThrow();
  });
  it('clamps impossible values', () => {
    const it = normaliseItem({ name: 'X', per100g: { kcal: 5000, protein: -3, carbs: '12.34', fat: 'x' }, estimated_grams: 200 });
    expect(it.per100).toEqual({ kcal: 950, p: 0, c: 12.3, f: 0 });
    expect(it.estimatedGrams).toBe(200);
  });
  it('picks the newest full Flash model and skips unsuitable ones', () => {
    const m = (name, g = ['generateContent']) => ({ name: `models/${name}`, supportedGenerationMethods: g });
    const r = rankModels([m('gemini-2.5-flash'), m('gemini-3.5-flash'), m('gemini-3.8-flash-lite'), m('gemini-3.5-flash-image'), m('gemini-3.6-flash-tts'), m('gemini-4.0-flash-preview'), m('gemini-3.1-pro'), m('text-embedding-004', ['embedContent'])]);
    expect(r).toEqual(['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.8-flash-lite']);
  });
  it('maps Open Food Facts products and handles kJ-only or empty ones', () => {
    expect(mapProduct({ product_name: 'Whey', brands: 'MuscleBlaze, X', code: '1', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 80 } })).toMatchObject({ name: 'Whey (MuscleBlaze)', per100: { kcal: 400, p: 80, c: 0, f: 0 } });
    expect(mapProduct({ product_name: 'A', nutriments: { energy_100g: 418.4 } }).per100.kcal).toBe(100);
    expect(mapProduct({ product_name: 'B', nutriments: {} })).toBeNull();
    expect(mapProduct({ nutriments: { 'energy-kcal_100g': 1 } })).toBeNull();
  });
});

describe('downloads and backup', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('makes CSV that is safe to open', () => {
    const c = toCsv([{ Food: 'Dal, "tadka"', Note: '=1+1', Kcal: -5 }]);
    expect(c).toContain('"Dal, ""tadka"""');
    expect(c).toContain("'=1+1");
    expect(c).toContain('-5');
  });
  it('filters export rows by the chosen dates', () => {
    const all = { logs: [{ id: 1, ...food('2026-11-01'), name: 'A', meal: 'Lunch' }, { id: 2, ...food('2026-11-20'), name: 'B', meal: 'Lunch' }], workouts: [], body: [], settings: { goalHistory: [G] } };
    all.summaries = S({ logs: all.logs });
    const r = buildRows(all, '2026-11-01', '2026-11-07');
    expect(r.food.map((x) => x.Food)).toEqual(['A']);
    expect(r.daily).toHaveLength(7);
    expect(r.daily[0].Calories).toBe(2000);
  });
  it('backup restores everything and keeps the API key out of the file', async () => {
    await db.settings.put({ key: 'app', value: { geminiKey: 'SECRET', onboarded: true, geminiModel: 'm' } });
    await db.logs.add({ date: '2026-11-01', name: 'Dal', kcal: 100, p: 5 });
    await db.photos.add({ date: '2026-11-01', data: 'data:image/jpeg;base64,AA' });
    const text = await backupText();
    expect(text).not.toContain('SECRET');
    await db.logs.clear(); await db.photos.clear();
    await db.logs.add({ date: '2020-01-01', name: 'Old', kcal: 1, p: 1 });
    await restoreBackup(text);
    expect((await db.logs.toArray()).map((l) => l.name)).toEqual(['Dal']);
    expect(await db.photos.count()).toBe(1);
    expect((await db.settings.get('app')).value.geminiKey).toBe('SECRET');
    await db.settings.put({ key: 'avatar', value: 'data:image/jpeg;base64,BB' });
    const withPhoto = await backupText();
    await db.settings.delete('avatar');
    await restoreBackup(withPhoto);
    expect((await db.settings.get('avatar')).value).toBe('data:image/jpeg;base64,BB');
  });
  it('rejects a file that is not a backup and leaves data alone', async () => {
    await db.logs.add({ date: '2026-11-01', name: 'Dal', kcal: 100, p: 5 });
    await expect(restoreBackup('{"a":1}')).rejects.toThrow(/not an Astra/);
    await expect(restoreBackup('garbage')).rejects.toThrow(/not an Astra/);
    expect(await db.logs.count()).toBe(1);
  });
});
const backupText = async () => { const b = await makeBackup(); return b.text(); };

describe('AI request speed and failure handling', () => {
  const ok = (text = '{"items":[{"name":"Dal","per100g":{"kcal":100,"protein":6,"carbs":14,"fat":3}}]}') => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  const fail = (status, message = 'x') => new Response(JSON.stringify({ error: { message } }), { status });
  const settings = { geminiKey: 'k', lastGoodModel: 'gemini-3.5-flash' };
  const IMG = 'data:image/jpeg;base64,AAAA';
  let real; beforeEach(() => { real = globalThis.fetch; });
  const run = async (handler, fn) => { globalThis.fetch = handler; try { return await fn(); } finally { globalThis.fetch = real; } };

  it('skips the model list and search, and turns thinking down, on the photo step', async () => {
    const urls = []; const bodies = [];
    const r = await run(async (u, i) => { urls.push(u); bodies.push(JSON.parse(i.body)); return ok(); }, () => analysePhoto(settings, IMG));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('gemini-3.5-flash');
    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
    expect(r.items[0].name).toBe('Dal');
  });
  it('uses the right thinking setting for older models', async () => {
    const bodies = [];
    await run(async (u, i) => { bodies.push(JSON.parse(i.body)); return ok(); }, () => analysePhoto({ geminiKey: 'k', geminiModel: 'gemini-2.5-flash' }, IMG));
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
  it('retries without the thinking setting if Google rejects it', async () => {
    const bodies = [];
    const r = await run(async (u, i) => { const b = JSON.parse(i.body); bodies.push(b); return b.generationConfig.thinkingConfig ? fail(400, 'Unknown field thinkingLevel') : ok(); }, () => analysePhoto(settings, IMG));
    expect(bodies).toHaveLength(2);
    expect(r.items).toHaveLength(1);
  });
  it('moves to the next model when one is out of quota', async () => {
    const urls = [];
    await run(async (u) => { urls.push(u); return urls.length === 1 ? fail(429) : ok(); }, () => analysePhoto(settings, IMG));
    expect(urls[0]).toContain('gemini-3.5-flash');
    expect(urls[1]).not.toContain('gemini-3.5-flash');
  });
  it('stops at once on a bad key', async () => {
    let n = 0;
    await expect(run(async () => { n++; return fail(403); }, () => analysePhoto(settings, IMG))).rejects.toThrow(/rejected this key/);
    expect(n).toBe(1);
  });
  it('tells you clearly when every model is out of quota', async () => {
    await expect(run(async () => fail(429), () => analysePhoto(settings, IMG))).rejects.toThrow(/free AI limit/);
  });
  it('gives up within its time budget when Google never answers', async () => {
    const hang = (u, i) => new Promise((_, rej) => i.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
    const t = Date.now();
    await expect(run(hang, () => analysePhoto(settings, IMG))).rejects.toThrow(/took too long/);
    expect(Date.now() - t).toBeLessThan(41000);
  }, 45000);
  it('the Google check only runs with search, so a failure never passes as checked', async () => {
    const bodies = [];
    await expect(run(async (u, i) => { bodies.push(JSON.parse(i.body)); return fail(429); }, () => verifyItems(settings, ['Dal']))).rejects.toThrow();
    expect(bodies.every((b) => b.tools?.[0]?.google_search)).toBe(true);
  });
});

describe('beginner guidance', () => {
  const base = { goalKcal: 2000, goalProtein: 100, isToday: true };
  it('gives one clear next step for each situation', () => {
    expect(nextStep({ ...base, kcal: 0, protein: 0 }).title).toBe('Start here');
    expect(nextStep({ ...base, kcal: 1000, protein: 38 }).text).toContain('1,000 more kcal and 62 g more protein');
    expect(nextStep({ ...base, kcal: 1000, protein: 38 }).text).toContain('200 g cooked chicken');
    expect(nextStep({ ...base, kcal: 1000, protein: 120 }).title).toBe('Protein done');
    expect(nextStep({ ...base, kcal: 2050, protein: 100 }).title).toBe('Bar fully loaded');
    expect(nextStep({ ...base, kcal: 2600, protein: 50 }).title).toBe('Over on calories');
    expect(nextStep({ ...base, kcal: 2600, protein: 120 }).text).toContain('600 kcal over');
    expect(nextStep({ ...base, kcal: 500, protein: 10, isToday: false }).title).toBe('A past day');
  });
  it('picks the meal by time of day', () => {
    const m = ['B', 'L', 'S', 'D'];
    expect([8, 13, 17, 21].map((h) => defaultMeal(m, h))).toEqual(m);
  });
  it('points to the next streak badge', () => {
    expect(nextMilestone(0)).toEqual({ at: 3, left: 3 });
    expect(nextMilestone(7)).toEqual({ at: 14, left: 7 });
    expect(nextMilestone(400)).toBeNull();
  });
  it('checklist tracks what is done', () => {
    const c = startChecklist({ hasKey: true, hasFood: false, hasWorkout: false, hasBackup: false });
    expect(c.filter((x) => x.done).map((x) => x.id)).toEqual(['key']);
  });
});

describe('running and swimming', () => {
  const t0 = 1_800_000_000_000;
  // about 111 m per 0.001 degrees of latitude
  const line = (n, step = 0.0005, dt = 20000) => Array.from({ length: n }, (_, i) => [19.1 + i * step, 72.85, t0 + i * dt]);
  it('measures GPS distance', () => {
    expect(haversine([19.1, 72.85, 0], [19.101, 72.85, 0])).toBeGreaterThan(110);
    expect(haversine([19.1, 72.85, 0], [19.101, 72.85, 0])).toBeLessThan(112);
    expect(Math.round(trackDistance(line(11)))).toBeGreaterThan(550);
  });
  it('filters bad GPS: weak signal, standing still and impossible speed', () => {
    const a = [19.1, 72.85, t0];
    expect(shouldAccept(null, a, 10)).toBe(true);
    expect(shouldAccept(null, a, 100)).toBe(false);
    expect(shouldAccept(a, [19.100005, 72.85, t0 + 5000], 8)).toBe(false);
    expect(shouldAccept(a, [19.1002, 72.85, t0 + 5000], 8)).toBe(true);
    expect(shouldAccept(a, [19.11, 72.85, t0 + 5000], 8)).toBe(false);
  });
  it('estimates calories from speed, weight and time', () => {
    // 5 km in 30 min at 70 kg is 10 km/h, about 10 MET, so about 350 kcal
    const k = runCalories(5000, 1800, 70);
    expect(k).toBeGreaterThan(330); expect(k).toBeLessThan(370);
    expect(runCalories(5000, 0, 70)).toBe(0);
    expect(swimCalories(1800, 70, 'hard')).toBe(343);
    expect(swimCalories(1800, 70, 'easy')).toBe(203);
  });
  it('formats pace and time', () => {
    expect(runPace(5150, 2077)).toBe('6:43');
    expect(swimPace(1000, 1500)).toBe('2:30');
    expect(runPace(0, 100)).toBe('--:--');
    expect(fmtDuration(2077)).toBe('34m 37s');
    expect(fmtClock(3725)).toBe('1:02:05');
  });
  it('hides the start and finish of long routes but keeps short ones whole', () => {
    const long = line(40);
    const cut = trimEnds(long);
    expect(cut[0][0]).toBeGreaterThan(long[0][0]);
    expect(cut[cut.length - 1][0]).toBeLessThan(long[long.length - 1][0]);
    expect(trackDistance(cut)).toBeGreaterThan(trackDistance(long) - 500);
    expect(trimEnds(line(5))).toHaveLength(5);
  });
  it('fits a route inside the map', () => {
    const v = fitView(line(30), 400, 300, { pad: 20 });
    for (const p of line(30)) {
      const [x, y] = project(v, p);
      expect(x).toBeGreaterThanOrEqual(20); expect(x).toBeLessThanOrEqual(380);
      expect(y).toBeGreaterThanOrEqual(19); expect(y).toBeLessThanOrEqual(281);
    }
  });
  it('run and swim streaks count finished activities and respect marked rest days', () => {
    const act = (date, sport, status = 'done') => ({ date, sport, status, meters: 1000, seconds: 600, kcal: 100 });
    const s = buildSummaries({ logs: [], days: [{ date: '2026-11-09', rest: true }], workouts: [], goalHistory: [G],
      activities: [act('2026-11-08', 'run'), act('2026-11-10', 'run'), act('2026-11-07', 'swim'), act('2026-11-06', 'run', 'running')] });
    const r = computeStreaks(s, '2026-11-10', 4);
    expect(r.run.current).toBe(2);
    expect(r.swim.current).toBe(0);
    expect(r.swim.best).toBe(1);
    expect(r.active.current).toBe(3);
    expect(s['2026-11-06']?.run ?? false).toBe(false);
  });
  it('adds running and swimming to weekly stats and downloads', () => {
    const days = weekDays('2026-11-05');
    const activities = [{ id: 1, date: days[0], sport: 'run', status: 'done', meters: 5150, seconds: 2077, kcal: 400 }, { id: 2, date: days[1], sport: 'swim', status: 'done', meters: 1000, seconds: 1800, kcal: 250, stroke: 'Freestyle', manual: true }];
    const s = buildSummaries({ logs: [], days: [], workouts: [], goalHistory: [G], activities });
    expect(periodStats(days, s, '2026-11-08', [], [G])).toMatchObject({ runs: 1, swims: 1, runKm: 5.2, swimM: 1000, burned: 650 });
    const rows = buildRows({ logs: [], workouts: [], body: [], activities, settings: { goalHistory: [G] }, summaries: s }, days[0], days[6]);
    expect(rows.activities.map((a) => a.Sport)).toEqual(['Running', 'Swimming']);
    expect(rows.daily[0]['Run (km)']).toBe(5.15);
  });
  it('share card stats and brand', () => {
    expect(CARD_BRAND).toBe('ASTRA');
    expect(cardStats({ sport: 'run', meters: 5150, seconds: 2077 })).toEqual([['Distance', '5.15 km'], ['Pace', '6:43 /km'], ['Time', '34m 37s']]);
    expect(cardStats({ sport: 'swim', meters: 1000, seconds: 1500 })[1][1]).toBe('2:30 /100m');
  });
  it('upgrades an existing phone without losing data, and backs up new tables', async () => {
    db.close();
    await Dexie.delete('roti-reps');
    const old = new Dexie('roti-reps');
    old.version(1).stores({ settings: 'key', foods: '++id,nameLower,barcode,lastUsed,fav', logs: '++id,date,foodId', days: 'date', workouts: '++id,date,endedAt', routines: '++id,name', exercises: '++id,name', body: 'date', photos: '++id,date', thumbs: 'logId' });
    await old.open();
    await old.logs.add({ date: '2026-11-01', name: 'Dal', kcal: 100, p: 5 });
    old.close();
    await db.open();
    expect((await db.logs.toArray())[0].name).toBe('Dal');
    await db.activities.add({ date: '2026-11-01', sport: 'run', status: 'done', meters: 100, seconds: 60 });
    await db.routes.put({ activityId: 1, points: [[1, 2, 3]] });
    const text = await backupText();
    await db.activities.clear(); await db.routes.clear();
    await restoreBackup(text);
    expect(await db.activities.count()).toBe(1);
    expect((await db.routes.get(1)).points).toEqual([[1, 2, 3]]);
  });
});

describe('photo labels', () => {
  it('keep their place when far apart, and separate when they would overlap', () => {
    expect(layoutTags([{ spot: { x: 30, y: 20 } }, { spot: { x: 60, y: 70 } }])).toEqual([{ x: 30, y: 20 }, { x: 60, y: 70 }]);
    const close = layoutTags([{ spot: { x: 62, y: 46 } }, { spot: { x: 32, y: 40 } }]);
    expect(Math.abs(close[0].y - close[1].y)).toBeGreaterThanOrEqual(17);
    const many = layoutTags(Array.from({ length: 5 }, () => ({ spot: { x: 50, y: 88 } })));
    many.forEach((m) => { expect(m.y).toBeGreaterThanOrEqual(8); expect(m.y).toBeLessThanOrEqual(90); });
    const ys = many.map((m) => m.y).sort((a, b) => a - b);
    ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(17));
  });
  it('still places foods the AI gave no position for', () => {
    const t = layoutTags([{}, {}, {}]);
    expect(new Set(t.map((x) => x.y)).size).toBe(3);
  });
});

describe('Astra Coach', () => {
  const base = { now: '7:30 pm', today: '2026-11-03', profile: { sex: 'male', age: 28, heightCm: 175, weightKg: 74, goal: 'gain' }, goal: G, todayLogs: [{ name: 'Dal tadka', grams: 150, meal: 'Lunch', kcal: 165, p: 9, c: 21, f: 5 }], weight: 73.5, sports: ['gym', 'run'] };
  it('gives the coach useful numbers from the person\'s data', () => {
    const c = buildCoachContext(base);
    expect(c).toContain('Eaten today: 165 kcal, 9 g protein');
    expect(c).toContain('Dal tadka 150 g (Lunch)');
    expect(c).toContain('2000 kcal, 100 g protein');
    expect(c).toContain('73.5 kg');
    expect(c).toContain('Trains: gym, run');
  });
  it('never includes the name, API key, photos or GPS routes', () => {
    const c = buildCoachContext({ ...base, profile: { ...base.profile, displayName: 'Vatsal', geminiKey: 'SECRETKEY' }, activities: [{ date: '2026-11-02', sport: 'run', meters: 5000, seconds: 1800, points: [[19.11, 72.86, 1]] }] });
    expect(c).not.toContain('Vatsal'); expect(c).not.toContain('SECRETKEY'); expect(c).not.toContain('19.11');
    expect(c).toContain('run, 5000 m in 30 min');
  });
  it('coach rules stay on topic and carry the safety limits', () => {
    expect(COACH_RULES).toMatch(/only help with food and fitness/);
    expect(COACH_RULES).toMatch(/steroids/);
    expect(COACH_RULES).toMatch(/1200 kcal a day for women or 1500 kcal a day for men/);
    expect(COACH_RULES).toMatch(/unhealthy relationship with food/);
    expect(COACH_RULES).toMatch(/14416/);
  });
  it('spots diet plan requests', () => {
    expect(wantsPlan('make me a diet plan')).toBe(true);
    expect(wantsPlan('give meal plan for gain')).toBe(true);
    expect(wantsPlan('what is my protein goal')).toBe(true);
    expect(wantsPlan('how many sets for chest')).toBe(false);
  });
  it('renders simple formatting as data, never as code', () => {
    const b = parseRich('Eat **more** protein\n\n- Paneer\n- <img src=x onerror=alert(1)>\n1. One\n### Head');
    expect(b.map((x) => x.type)).toEqual(['p', 'ul', 'ol', 'h']);
    expect(b[0].parts).toEqual([{ t: 'Eat ' }, { t: 'more', b: true }, { t: ' protein' }]);
    expect(b[1].items[1][0].t).toContain('<img');
  });
  describe('streaming replies', () => {
    const sse = (chunks) => new Response(chunks.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`).join(''), { status: 200 });
    const settings = { geminiKey: 'k', lastGoodModel: 'gemini-3.5-flash' };
    const run = async (handler, fn) => { const real = globalThis.fetch; globalThis.fetch = handler; try { return await fn(); } finally { globalThis.fetch = real; } };
    it('builds the answer piece by piece and sends the rules and history', async () => {
      let body; let url; const seen = [];
      const text = await run(async (u, i) => { url = u; body = JSON.parse(i.body); return sse(['Eat ', 'paneer.']); }, () => streamChat(settings, { system: 'RULES', messages: [{ role: 'user', text: 'hi' }, { role: 'coach', text: 'hello' }, { role: 'user', text: 'dinner?' }], onText: (t) => seen.push(t) }));
      expect(text).toBe('Eat paneer.');
      expect(seen).toEqual(['Eat ', 'Eat paneer.']);
      expect(url).toContain(':streamGenerateContent?alt=sse');
      expect(body.system_instruction.parts[0].text).toBe('RULES');
      expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    });
    it('moves to the next model when one is out of quota', async () => {
      const urls = [];
      const text = await run(async (u) => { urls.push(u); return urls.length === 1 ? new Response('{"error":{"message":"q"}}', { status: 429 }) : sse(['ok']); }, () => streamChat(settings, { system: 'R', messages: [{ role: 'user', text: 'x' }] }));
      expect(text).toBe('ok'); expect(urls[1]).not.toEqual(urls[0]);
    });
    it('explains a blocked answer instead of showing nothing', async () => {
      const blocked = new Response(`data: ${JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })}\n\n`, { status: 200 });
      await expect(run(async () => blocked, () => streamChat(settings, { system: 'R', messages: [{ role: 'user', text: 'x' }] }))).rejects.toThrow(/can't answer that one/);
    });
    it('keeps what already arrived if the connection drops', async () => {
      let n = 0;
      const stream = new ReadableStream({ pull(c) { n += 1; if (n === 1) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Half an ans' }] } }] })}\n\n`)); else c.error(new Error('drop')); } });
      const err = await run(async () => new Response(stream, { status: 200 }), () => streamChat(settings, { system: 'R', messages: [{ role: 'user', text: 'x' }] })).catch((e) => e);
      expect(err.partial).toBe('Half an ans');
    });
  });
});

describe('diet plan', () => {
  const raw = { meals: [{ name: 'Breakfast', time: '8:00 AM', items: [{ food: 'Oats', amount: '1 bowl', grams: 200, kcal: 500, protein: 30, carbs: 60, fat: 10 }] }, { name: 'Dinner', items: [{ food: 'Paneer', grams: 150, kcal: 1500, protein: 60, carbs: 10, fat: 50 }] }], tips: ['Drink water', ''] };
  it('adds up the day', () => {
    expect(planTotals(normalisePlan(raw))).toEqual({ kcal: 2000, p: 90, c: 70, f: 60 });
  });
  it('rejects an empty answer and clamps silly values', () => {
    expect(() => normalisePlan({ meals: [] })).toThrow();
    const p = normalisePlan({ meals: [{ name: 'X', items: [{ food: 'Y', grams: -5, kcal: 99999, protein: 'a' }] }] });
    expect(p.meals[0].items[0]).toMatchObject({ grams: 0, kcal: 3000, p: 0 });
    expect(normalisePlan(raw).tips).toEqual(['Drink water']);
  });
  it('resizes portions to hit the calorie goal exactly', () => {
    const fitted = fitToCalories(normalisePlan(raw), 2200);
    expect(planTotals(fitted).kcal).toBe(2200);
    expect(fitted.meals[0].items[0].grams).toBe(220);
    expect(fitted.meals[0].items[0].p).toBe(33);
  });
  it('does not stretch a plan that is wildly off, and warns honestly instead', () => {
    const plan = normalisePlan(raw);
    expect(planTotals(fitToCalories(plan, 5000)).kcal).toBe(2000);
    const w = planWarnings(planTotals(plan), { kcal: 3000, protein: 150 });
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('60 g short');
    expect(planWarnings({ kcal: 2000, p: 100 }, { kcal: 2000, protein: 100 })).toEqual([]);
  });
  it('never plans weight loss for children or underweight people', () => {
    expect(planGuard({ age: 16, heightCm: 170, weightKg: 70, goal: 'lose' }).goal).toBe('keep');
    expect(planGuard({ age: 25, heightCm: 175, weightKg: 50, goal: 'lose' }).goal).toBe('keep');
    expect(planGuard({ age: 25, heightCm: 175, weightKg: 85, goal: 'lose' })).toEqual({ goal: 'lose', notice: '' });
    expect(planGuard({ age: 16, heightCm: 170, weightKg: 55, goal: 'gain' }).goal).toBe('gain');
  });
  it('works out goals locally, with calories never under the safety floor', () => {
    const t = planTargets({ sex: 'female', age: 40, heightCm: 150, weightKg: 45, activity: 1.2 }, 'lose');
    expect(t.kcal).toBeGreaterThanOrEqual(1200);
    expect(t.protein * 4 + t.carbs * 4 + t.fat * 9).toBeGreaterThan(t.kcal * 0.9);
  });
  it('files plan meals under the right meal', () => {
    const m = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
    expect(matchMeal('Breakfast', m, 'Lunch')).toBe('Breakfast');
    expect(matchMeal('Evening snack', m, 'Lunch')).toBe('Snacks');
    expect(matchMeal('Post-workout', m, 'Lunch')).toBe('Snacks');
    expect(matchMeal('Brunch', m, 'Lunch')).toBe('Lunch');
  });
  it('reads typed-meal and photo answers, including where each food sits', () => {
    const it = normaliseItem({ name: 'Roti', per100g: { kcal: 280 }, estimated_grams: 80, box_2d: [100, 200, 300, 400] });
    expect(it.estimatedGrams).toBe(80);
    expect(it.spot).toEqual({ x: 30, y: 20 });
    expect(normaliseItem({ name: 'A', box_2d: [0, 0, 0, 0] }).spot).toEqual({ x: 8, y: 8 });
    expect(normaliseItem({ name: 'B', box_2d: ['x'] }).spot).toBeNull();
  });
  it('upgrades a phone with existing data to the new coach tables', async () => {
    db.close();
    await Dexie.delete('roti-reps');
    const old = new Dexie('roti-reps');
    old.version(2).stores({ settings: 'key', foods: '++id,nameLower,barcode,lastUsed,fav', logs: '++id,date,foodId', days: 'date', workouts: '++id,date,endedAt', routines: '++id,name', exercises: '++id,name', body: 'date', photos: '++id,date', thumbs: 'logId', activities: '++id,date,sport,status', routes: 'activityId' });
    await old.open();
    await old.logs.add({ date: '2026-11-01', name: 'Dal', kcal: 100, p: 5 });
    await old.activities.add({ date: '2026-11-01', sport: 'run', status: 'done', meters: 100, seconds: 60 });
    old.close();
    await db.open();
    expect((await db.logs.toArray())[0].name).toBe('Dal');
    expect(await db.activities.count()).toBe(1);
    await db.coach.add({ role: 'user', text: 'hi', createdAt: 1 });
    await db.plans.add({ createdAt: 1, meals: [] });
    const text = await backupText();
    await db.coach.clear(); await db.plans.clear();
    await restoreBackup(text);
    expect(await db.coach.count()).toBe(1);
    expect(await db.plans.count()).toBe(1);
  });
});
