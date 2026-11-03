import { db, DATA_TABLES, getSettings, saveSettings } from './db.js';
import { rangeDays, todayKey, fmtDay } from './dates.js';
import { buildSummaries, periodStats, workoutVolume, goalFor } from './stats.js';
import { computeStreaks } from './streaks.js';
import { round } from './nutrition.js';
import { LOGO_H, LOGO_PATH, LOGO_W } from '../components/logo.js';

export const loadAll = async () => {
  const [logs, days, workouts, body, activities, s] = await Promise.all([db.logs.toArray(), db.days.toArray(), db.workouts.toArray(), db.body.toArray(), db.activities.toArray(), getSettings()]);
  return { logs, days, workouts, body, activities, settings: s, summaries: buildSummaries({ logs, days, workouts, activities, goalHistory: s.goalHistory }) };
};

const inRange = (x, from, to) => x.date >= from && x.date <= to;
export const buildRows = (all, from, to) => {
  const food = all.logs.filter((l) => inRange(l, from, to)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((l) => ({ Date: l.date, Meal: l.meal, Food: l.name, 'Weight (g)': l.grams ?? '', Calories: l.kcal, 'Protein (g)': l.p, 'Carbs (g)': l.c, 'Fat (g)': l.f, Source: l.sourceLabel || '' }));
  const daily = rangeDays(from, to).map((k) => {
    const d = all.summaries[k];
    const g = goalFor(all.settings.goalHistory, k);
    return {
      Date: k, Calories: round(d?.kcal), 'Calorie target': g.kcal, 'Protein (g)': round(d?.p, 1), 'Protein target (g)': g.protein,
      'Carbs (g)': round(d?.c, 1), 'Fat (g)': round(d?.f, 1), 'Water (ml)': d?.water || 0, Workout: d?.workout ? 'Yes' : d?.rest ? 'Rest day' : 'No', 'Weight lifted (kg)': round(d?.volume), 'Run (km)': round((d?.runM || 0) / 1000, 2), 'Swim (m)': round(d?.swimM), 'Calories burned': round(d?.burned),
    };
  });
  const sets = [];
  for (const w of all.workouts.filter((x) => x.endedAt && inRange(x, from, to)).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of w.exercises || []) (e.sets || []).forEach((s, i) => sets.push({
      Date: w.date, Workout: w.name || '', Exercise: e.name, Muscle: e.muscle || '', Set: i + 1, 'Weight (kg)': s.w ?? '', Reps: s.r ?? '', Minutes: s.min ?? '', 'Distance (km)': s.km ?? '', Warm_up: s.warmup ? 'Yes' : '',
    }));
  }
  const body = all.body.filter((b) => inRange(b, from, to)).sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({ Date: b.date, 'Weight (kg)': b.weight ?? '', 'Waist (cm)': b.waist ?? '', 'Chest (cm)': b.chest ?? '', 'Arm (cm)': b.arm ?? '', 'Thigh (cm)': b.thigh ?? '', 'Hip (cm)': b.hip ?? '' }));
  const activities = (all.activities || []).filter((a) => a.status === 'done' && inRange(a, from, to)).sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({ Date: a.date, Sport: a.sport === 'swim' ? 'Swimming' : 'Running', 'Distance (m)': round(a.meters), 'Time (min)': round(a.seconds / 60, 1), 'Calories burned': a.kcal || 0, Stroke: a.stroke || '', Laps: a.laps ?? '', 'GPS route': a.manual ? 'No' : 'Yes' }));
  return { food, daily, sets, body, activities };
};

const SHEETS = [['Daily summary', 'daily'], ['Food log', 'food'], ['Workout sets', 'sets'], ['Running and swimming', 'activities'], ['Body', 'body']];
export const makeXlsx = async (rows) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [title, key] of SHEETS) {
    const ws = XLSX.utils.json_to_sheet(rows[key].length ? rows[key] : [{ Note: 'Nothing logged in this period' }]);
    const cols = Object.keys(rows[key][0] || { Note: '' });
    ws['!cols'] = cols.map((c) => ({ wch: Math.max(c.length + 2, c === 'Food' || c === 'Exercise' ? 30 : 11) }));
    XLSX.utils.book_append_sheet(wb, ws, title);
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows) => {
  if (!rows.length) return 'Nothing logged in this period\n';
  const cols = Object.keys(rows[0]);
  return `${[cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`;
};
export const makeCsv = (rows, key) => new Blob([`﻿${toCsv(rows[key])}`], { type: 'text/csv;charset=utf-8' });

export const makePdf = async (all, from, to, title) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const today = todayKey();
  const stats = periodStats(rangeDays(from, to), all.summaries, today, all.body, all.settings.goalHistory);
  const streaks = computeStreaks(all.summaries, today, goalFor(all.settings.goalHistory, today).workouts);
  const rows = buildRows(all, from, to);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Astra report', 40, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text(title, 40, 70);
  const head = { fillColor: [25, 27, 31] };
  const change = stats.weightChange == null ? 'Not enough entries' : `${stats.weightChange > 0 ? '+' : ''}${stats.weightChange} kg`;
  autoTable(doc, {
    startY: 88, head: [['Goal', 'Result']], headStyles: head,
    body: [
      ['Days with food logged', `${stats.daysLogged} of ${stats.totalDays}`],
      ['Average calories on logged days', `${stats.avgKcal} kcal`],
      ['Average protein on logged days', `${stats.avgProtein} g`],
      ['Calorie target hit', `${stats.calorieDays} days`],
      ['Protein target hit', `${stats.proteinDays} days`],
      ['Water target hit', `${stats.waterDays} days`],
      ['Workouts', `${stats.workouts} of ${stats.workoutTarget} planned`],
      ['Total weight lifted', `${stats.volume.toLocaleString('en-IN')} kg`],
      ['Running', `${stats.runs} runs, ${stats.runKm} km`],
      ['Swimming', `${stats.swims} swims, ${stats.swimM} m`],
      ['Calories burned running and swimming', `${stats.burned} kcal`],
      ['Body weight change', change],
      ['Current streaks', `Food ${streaks.food.current}, gym ${streaks.gym.current}, run ${streaks.run.current}, swim ${streaks.swim.current}, protein ${streaks.protein.current} days`],
    ],
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18, head: [['Day', 'Calories', 'Target', 'Protein', 'Target', 'Water', 'Workout']], headStyles: head, styles: { fontSize: 9 },
    body: rows.daily.map((d) => [fmtDay(d.Date), d.Calories, d['Calorie target'], `${d['Protein (g)']} g`, `${d['Protein target (g)']} g`, `${d['Water (ml)']} ml`, d.Workout]),
  });
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
};

const pdfSafe = (v) => String(v ?? '').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u20B9/g, 'Rs ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
const logoPng = () => {
  const c = document.createElement('canvas');
  c.width = LOGO_W / 4; c.height = LOGO_H / 4;
  const x = c.getContext('2d');
  x.scale(0.25, 0.25); x.fillStyle = '#101820'; x.fill(new Path2D(LOGO_PATH));
  return c.toDataURL('image/png');
};
export const makePlanPdf = async (plan, name) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const head = { fillColor: [15, 32, 48], textColor: 255 };
  doc.addImage(logoPng(), 'PNG', 40, 34, 120, (120 * LOGO_H) / LOGO_W);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Daily diet plan', 40, 82);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(pdfSafe(`${name ? `For ${name}. ` : ''}${plan.goalLabel}, ${plan.dietLabel}, ${plan.mealsPerDay} meals. Made ${fmtDay(plan.date)}.`), 40, 100);
  const t = plan.totals;
  autoTable(doc, {
    startY: 114, head: [['Daily goal', 'Target', 'In this plan']], headStyles: head,
    body: [['Calories', `${plan.targets.kcal} kcal`, `${round(t.kcal)} kcal`], ['Protein', `${plan.targets.protein} g`, `${round(t.p)} g`], ['Carbs', `${plan.targets.carbs} g`, `${round(t.c)} g`], ['Fat', `${plan.targets.fat} g`, `${round(t.f)} g`]],
  });
  for (const m of plan.meals) {
    const sum = m.items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.p }), { kcal: 0, p: 0 });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 16, headStyles: head, styles: { fontSize: 10 },
      head: [[pdfSafe(`${m.name}${m.time ? `, ${m.time}` : ''}`), 'Weight', 'Calories', 'Protein', 'Carbs', 'Fat']],
      body: m.items.map((i) => [pdfSafe(`${i.food}${i.amount ? ` (${i.amount})` : ''}`), `${i.grams} g`, i.kcal, `${i.p} g`, `${i.c} g`, `${i.f} g`]),
      foot: [['Meal total', '', round(sum.kcal), `${round(sum.p, 1)} g`, '', '']], footStyles: { fillColor: [233, 238, 242], textColor: 20 },
    });
  }
  let y = doc.lastAutoTable.finalY + 22;
  const para = (text, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10);
    for (const l of doc.splitTextToSize(pdfSafe(text), 515)) {
      if (y > 800) { doc.addPage(); y = 50; }
      doc.text(l, 40, y); y += 14;
    }
  };
  if (plan.tips?.length) { para('Tips', true); plan.tips.forEach((tip) => para(`- ${tip}`)); y += 6; }
  para('These are AI-generated estimates and general guidance, not medical advice. If you have a health condition, are pregnant, or are under 18, check with a doctor or dietitian first.');
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
};
export const makePlanXlsx = async (plan) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const t = plan.totals;
  const goals = XLSX.utils.json_to_sheet([
    { Goal: 'Calories (kcal)', Target: plan.targets.kcal, 'In this plan': round(t.kcal) },
    { Goal: 'Protein (g)', Target: plan.targets.protein, 'In this plan': round(t.p) },
    { Goal: 'Carbs (g)', Target: plan.targets.carbs, 'In this plan': round(t.c) },
    { Goal: 'Fat (g)', Target: plan.targets.fat, 'In this plan': round(t.f) },
  ]);
  goals['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, goals, 'Daily goals');
  const rows = plan.meals.flatMap((m) => m.items.map((i) => ({ Meal: m.name, Time: m.time, Food: i.food, Amount: i.amount, 'Weight (g)': i.grams, Calories: i.kcal, 'Protein (g)': i.p, 'Carbs (g)': i.c, 'Fat (g)': i.f })));
  const meals = XLSX.utils.json_to_sheet(rows);
  meals['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, meals, 'Meals');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const makeBackup = async () => {
  const out = { app: 'roti-reps', version: 1, exportedAt: new Date().toISOString(), tables: {} };
  for (const t of DATA_TABLES) out.tables[t] = await db[t].toArray();
  const { geminiKey, geminiModel, lastGoodModel, ...settings } = await getSettings(); // the API key never leaves the phone
  out.settings = settings;
  out.avatar = (await db.settings.get('avatar'))?.value || null;
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
};
export const restoreBackup = async (text) => {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not an Astra backup.'); }
  if (data?.app !== 'roti-reps' || !data.tables) throw new Error('This file is not an Astra backup.');
  const cur = await getSettings();
  await db.transaction('rw', [...DATA_TABLES.map((t) => db[t]), db.settings], async () => {
    for (const t of DATA_TABLES) { await db[t].clear(); if (data.tables[t]?.length) await db[t].bulkAdd(data.tables[t]); }
    await db.settings.put({ key: 'app', value: { ...cur, ...data.settings, geminiKey: cur.geminiKey, geminiModel: cur.geminiModel } });
    if (data.avatar) await db.settings.put({ key: 'avatar', value: data.avatar });
  });
};

// iPhone Home Screen apps save files most reliably through the share sheet ("Save to Files").
export const saveFile = async (blob, name) => {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
};
export const markBackedUp = () => saveSettings({ lastBackup: Date.now() });

export const makeReminderIcs = (items) => {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const start = todayKey().replace(/-/g, '');
  const ev = items.map((it, i) => [
    'BEGIN:VEVENT', `UID:astra-${i}-${stamp}@local`, `DTSTAMP:${stamp}`,
    `DTSTART:${start}T${it.time.replace(':', '')}00`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY', `SUMMARY:${it.title}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${it.title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT',
  ].join('\r\n')).join('\r\n');
  return new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Astra//EN\r\n${ev}\r\nEND:VCALENDAR\r\n`], { type: 'text/calendar' });
};
export const weekVolumeLabel = (w) => `${Math.round(workoutVolume(w)).toLocaleString('en-IN')} kg`;
