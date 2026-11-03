import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { STARTER_ROUTINES } from '../data/exercises.js';
import { DEFAULT_GOAL } from './stats.js';
import { todayKey } from './dates.js';

export const db = new Dexie('roti-reps');
db.version(1).stores({
  settings: 'key',
  foods: '++id,nameLower,barcode,lastUsed,fav',
  logs: '++id,date,foodId',
  days: 'date',
  workouts: '++id,date,endedAt',
  routines: '++id,name',
  exercises: '++id,name',
  body: 'date',
  photos: '++id,date',
  thumbs: 'logId',
});

db.version(2).stores({
  activities: '++id,date,sport,status',
  routes: 'activityId',
});

db.version(3).stores({
  coach: '++id,createdAt',
  plans: '++id,createdAt',
});

export const DATA_TABLES = ['foods', 'logs', 'days', 'workouts', 'routines', 'exercises', 'body', 'photos', 'thumbs', 'activities', 'routes', 'coach', 'plans'];
export const DEFAULT_SETTINGS = {
  onboarded: false,
  profile: null,
  goalHistory: [{ from: '2000-01-01', ...DEFAULT_GOAL }],
  geminiKey: '',
  geminiModel: '',
  lastGoodModel: '',
  theme: 'system',
  restSeconds: 90,
  lastBackup: null,
  meals: ['Breakfast', 'Lunch', 'Snacks', 'Dinner'],
};

export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...((await db.settings.get('app'))?.value || {}) });
export const saveSettings = async (patch) => {
  await db.transaction('rw', db.settings, async () => {
    const cur = await getSettings();
    await db.settings.put({ key: 'app', value: { ...cur, ...patch } });
  });
};
export const useSettings = () => useLiveQuery(getSettings, [], null);

export const setGoal = async (goal, from = todayKey()) => {
  const s = await getSettings();
  const hist = s.goalHistory.filter((h) => h.from !== from);
  hist.push({ ...goal, from });
  await saveSettings({ goalHistory: hist });
};

export const seedOnce = async () => {
  if ((await db.routines.count()) === 0 && !(await getSettings()).onboarded) {
    await db.routines.bulkAdd(STARTER_ROUTINES);
  }
};

export const setDay = async (date, patch) => {
  await db.transaction('rw', db.days, async () => {
    const cur = (await db.days.get(date)) || { date };
    await db.days.put({ ...cur, ...patch });
  });
};

// Saves a food the first time it's used, then keeps it in Recent.
export const rememberFood = async (food) => {
  const nameLower = food.name.trim().toLowerCase();
  const found = food.id ? await db.foods.get(food.id) : await db.foods.where('nameLower').equals(nameLower).first();
  const row = {
    name: food.name.trim(), nameLower, per100: food.per100, servings: food.servings || [],
    source: food.source || 'custom', barcode: food.barcode || found?.barcode || null,
    links: food.links || found?.links || [], fav: found?.fav ? 1 : 0,
    lastUsed: Date.now(), useCount: (found?.useCount || 0) + 1,
  };
  if (found) { await db.foods.update(found.id, row); return found.id; }
  return db.foods.add(row);
};

// The person's own wallpaper for Today. Kept in its own row, on this phone only.
export const useHeroPicture = () => useLiveQuery(async () => (await db.settings.get('hero'))?.value || null, [], null);
export const setHeroPicture = (dataUrl) => (dataUrl ? db.settings.put({ key: 'hero', value: dataUrl }) : db.settings.delete('hero'));

// Profile photo, kept in its own row so everyday settings stay small.
export const useAvatar = () => useLiveQuery(async () => (await db.settings.get('avatar'))?.value || null, [], null);
export const setAvatar = (dataUrl) => (dataUrl ? db.settings.put({ key: 'avatar', value: dataUrl }) : db.settings.delete('avatar'));

export const latestWeight = async () => {
  const rows = (await db.body.toArray()).filter((b) => b.weight).sort((a, b) => a.date.localeCompare(b.date));
  return rows.length ? rows[rows.length - 1].weight : null;
};

export const requestPersistence = async () => {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
};
