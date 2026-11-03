import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings, setDay } from '../lib/db.js';
import { addDays, fmtDay, fmtDow, friendlyDay, todayKey, weekDays } from '../lib/dates.js';
import { buildSummaries, goalFor, workoutVolume } from '../lib/stats.js';
import { computeStreaks } from '../lib/streaks.js';
import { sumLogs, round, parseNum, fromPer100, calorieHit } from '../lib/nutrition.js';
import { defaultMeal, nextStep, startChecklist } from '../lib/coach.js';
import { fileToImages } from '../lib/images.js';
import { fmtDuration } from '../lib/geo.js';
import { Avatar, Confetti, Icon, Logo, Meter, Sheet, Field, NumInput, fmt, useCountUp, useToast, Notice } from '../components/ui.jsx';
import Barbell from '../components/Barbell.jsx';
import { LifterArt, RunnerArt, SwimmerArt } from '../components/Art.jsx';
import { useAvatar, useHeroPicture } from '../lib/db.js';
import AddFood from './AddFood.jsx';
import { BodyEntry } from './Progress.jsx';

export const useStreaks = (goalHistory) => {
  const data = useLiveQuery(async () => {
    const [logs, days, workouts, activities] = await Promise.all([db.logs.toArray(), db.days.toArray(), db.workouts.toArray(), db.activities.toArray()]);
    return { logs, days, workouts, activities };
  }, [], null);
  return useMemo(() => {
    if (!data) return null;
    const today = todayKey();
    const summaries = buildSummaries({ ...data, goalHistory });
    return { summaries, streaks: computeStreaks(summaries, today, goalFor(goalHistory, today).workouts), hasWorkout: data.workouts.some((w) => w.endedAt) || data.activities.some((a) => a.status === 'done'), hasFood: data.logs.length > 0 };
  }, [data, goalHistory]);
};

const QUOTES = ['Never give up', 'One more rep', 'Earn it today', 'No days wasted', 'Stronger than yesterday', 'Show up anyway', 'Pain is temporary', 'Keep the streak alive'];
// Long names shrink so they stay on one line.
const nameSize = (name) => (name.length <= 7 ? 'xl' : name.length <= 11 ? 'lg' : name.length <= 16 ? 'md' : 'sm');
const quoteFor = (date) => QUOTES[Number(date.slice(8)) % QUOTES.length];

const MEAL_ICON = { Breakfast: ['sunrise', 'yellow'], Lunch: ['sun', 'red'], Snacks: ['snack', 'green'], Dinner: ['moon', 'purple'] };

const EntrySheet = ({ entry, meals, onClose }) => {
  const toast = useToast();
  const thumb = useLiveQuery(() => (entry.hasPhoto ? db.thumbs.get(entry.id) : undefined), [entry.id]);
  const [grams, setGrams] = useState(String(entry.grams ?? ''));
  const [meal, setMeal] = useState(entry.meal);
  const [kcal, setKcal] = useState(String(entry.kcal));
  const [p, setP] = useState(String(entry.p));
  const hasPer100 = !!entry.per100;
  const g = parseNum(grams);
  const live = hasPer100 && g > 0 ? fromPer100(entry.per100, g) : null;
  const save = async () => {
    const patch = hasPer100 ? { grams: g, meal, ...live } : { meal, kcal: parseNum(kcal) || 0, p: parseNum(p) || 0 };
    await db.logs.update(entry.id, patch);
    onClose();
  };
  const remove = async () => {
    await db.transaction('rw', db.logs, db.thumbs, async () => { await db.logs.delete(entry.id); await db.thumbs.delete(entry.id); });
    toast(`Removed ${entry.name}`);
    onClose();
  };
  return (
    <Sheet title={entry.name} onClose={onClose}>
      <div className="stack">
        {thumb && <img className="entry-photo" src={thumb.data} alt={`Photo of ${entry.name}`} />}
        <Field label="Meal"><select value={meal} onChange={(e) => setMeal(e.target.value)}>{meals.map((m) => <option key={m}>{m}</option>)}</select></Field>
        {hasPer100 ? (
          <>
            <Field label="Weight"><NumInput value={grams} onChange={setGrams} unit="g" label="Weight in grams" /></Field>
            {live && <p className="totals"><strong>{live.kcal}</strong> kcal, <strong>{live.p}</strong> g protein, {live.c} g carbs, {live.f} g fat</p>}
          </>
        ) : (
          <div className="row2">
            <Field label="Calories"><NumInput value={kcal} onChange={setKcal} unit="kcal" label="Calories" /></Field>
            <Field label="Protein"><NumInput value={p} onChange={setP} unit="g" label="Protein" /></Field>
          </div>
        )}
        {entry.links?.length > 0 && <Sources links={entry.links} />}
        <button className="btn primary" disabled={hasPer100 && !(g > 0)} onClick={save}>Save changes</button>
        <button className="btn danger" onClick={remove}><Icon name="trash" size={18} /> Remove from log</button>
      </div>
    </Sheet>
  );
};

export const Sources = ({ links }) => (
  <div className="sources"><span className="muted small">Checked online:</span>
    {links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.title}</a>)}
  </div>
);

const Stat = ({ value, unit, of, sub, color, align }) => {
  const shown = useCountUp(value);
  return (
    <div className={`stat ${align || ''}`}>
      <span className="big">{fmt(shown)}{unit && <small>{unit}</small>}</span>
      <span className="of"><i style={{ background: color }} />{of}</span>
      <span className="sub">{sub}</span>
    </div>
  );
};

const WeekStrip = ({ date, setDate, summaries }) => {
  const today = todayKey();
  return (
    <div className="strip">
      <button className="iconbtn small" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="left" size={18} /></button>
      {weekDays(date).map((k) => {
        const s = summaries?.[k];
        return (
          <button key={k} disabled={k > today} className={`strip-day ${k === date ? 'on' : ''} ${k === today ? 'now' : ''}`} aria-label={fmtDay(k)} aria-current={k === date ? 'date' : undefined} onClick={() => setDate(k)}>
            <em>{fmtDow(k)}</em><b>{Number(k.slice(8))}</b><i className={s?.logged ? 'dot' : ''} />
          </button>
        );
      })}
      <button className="iconbtn small" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><Icon name="right" size={18} /></button>
    </div>
  );
};

const StartCard = ({ settings, st, goTo, onFood }) => {
  const items = startChecklist({ hasKey: !!settings.geminiKey, hasFood: st.hasFood, hasWorkout: st.hasWorkout, hasBackup: !!settings.lastBackup });
  const left = items.filter((x) => !x.done).length;
  if (!left || settings.hideStart) return null;
  const act = { food: onFood, key: () => goTo('more', 'ai'), gym: () => goTo('train'), backup: () => goTo('more', 'dl') };
  return (
    <section className="startcard">
      <div className="meal-head"><h2>Get set up</h2><span className="meal-total">{items.length - left} of {items.length} done</span>
        <button className="iconbtn small" aria-label="Hide this list" onClick={() => saveSettings({ hideStart: true })}><Icon name="x" size={18} /></button></div>
      {items.map((it, i) => (
        <button key={it.id} className={`row step ${it.done ? 'done' : ''}`} disabled={it.done} onClick={act[it.id]}>
          <span className="stepno">{it.done ? <Icon name="check" size={16} /> : i + 1}</span>
          <span className="row-main"><span className="row-title">{it.title}</span><span className="row-sub">{it.sub}</span></span>
          {!it.done && <Icon name="right" size={18} />}
        </button>
      ))}
    </section>
  );
};

const ActivityCard = ({ sport, rows, date, startTrain }) => {
  const swim = sport === 'swim';
  const done = rows.filter((a) => a.sport === sport && a.status === 'done');
  return (
    <section className="meal">
      <div className="meal-head"><span className={`tile ${swim ? 'blue' : 'red'}`}><Icon name={swim ? 'drop' : 'bolt'} size={18} /></span><h2>{swim ? 'Swimming' : 'Running'}</h2></div>
      {done.map((a) => <div className="row static" key={a.id}><span className="row-main"><span className="row-title">{swim ? `${fmt(a.meters)} m` : `${(a.meters / 1000).toFixed(2)} km`}</span><span className="row-sub">{fmtDuration(a.seconds)}</span></span><span className="row-side"><b>{fmt(a.kcal)}</b> kcal burned</span></div>)}
      <div className="chips"><button className="chip strong" onClick={() => startTrain(sport, date)}><Icon name={swim ? 'drop' : 'bolt'} size={18} /> {swim ? 'Log a swim' : 'Start a run'}</button></div>
    </section>
  );
};

export default function Today({ date, setDate, settings, goTo, startTrain, openCoach }) {
  const toast = useToast();
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [party, setParty] = useState(0);
  const logsRaw = useLiveQuery(() => db.logs.where('date').equals(date).toArray(), [date]);
  const logs = logsRaw || [];
  const day = useLiveQuery(() => db.days.get(date), [date], null);
  const body = useLiveQuery(() => db.body.get(date), [date], null);
  const yesterdayLogs = useLiveQuery(() => db.logs.where('date').equals(addDays(date, -1)).toArray(), [date], []);
  const workouts = useLiveQuery(() => db.workouts.where('date').equals(date).toArray(), [date], []);
  const activities = useLiveQuery(() => db.activities.where('date').equals(date).toArray(), [date], []);
  const sports = settings.sports || ['gym'];
  const st = useStreaks(settings.goalHistory);
  const goal = goalFor(settings.goalHistory, date);
  const total = sumLogs(logs);
  const water = day?.water || 0;
  const isToday = date === todayKey();
  const done = workouts.filter((w) => w.endedAt);
  const left = goal.kcal - total.kcal;
  const coach = nextStep({ kcal: total.kcal, protein: total.p, goalKcal: goal.kcal, goalProtein: goal.protein, isToday });

  // Confetti the moment you cross a target, not every time you open the app.
  const was = useRef({ date: null, hit: false, key: null });
  useEffect(() => {
    if (!logsRaw) return;
    const hit = total.p >= goal.protein;
    const w = was.current;
    if (w.date === date && !w.hit && hit && isToday) { setParty((x) => x + 1); setTimeout(() => toast('Protein target hit!'), 900); }
    was.current = { date, hit };
  }, [logsRaw, date]);
  useEffect(() => { if (!party) return undefined; const t = setTimeout(() => setParty(0), 2600); return () => clearTimeout(t); }, [party]);

  const addWater = (ml) => setDay(date, { water: Math.max(0, water + ml) });
  const snap = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { setAdding({ meal: defaultMeal(settings.meals), images: await fileToImages(f) }); } catch (err) { toast(err.message); }
  };
  const copyMeal = async (meal) => {
    const rows = yesterdayLogs.filter((l) => l.meal === meal);
    await db.logs.bulkAdd(rows.map(({ id, hasPhoto, ...r }) => ({ ...r, date, createdAt: Date.now() })));
    toast(`Copied ${rows.length} items from yesterday`);
  };
  const backupDays = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / 86400000) : null;
  const backupDue = (st?.summaries && Object.keys(st.summaries).length >= 7) && (backupDays == null || backupDays >= 7);
  const food = st?.streaks.food.current || 0;
  const picture = useHeroPicture();
  const avatar = useAvatar();

  return (
    <div className="page">
      <header className={`banner ${picture ? 'custom' : ''}`}>
        {picture ? <img src={picture} alt="" /> : <div className="banner-art">{sports[0] === 'run' ? <RunnerArt /> : sports[0] === 'swim' ? <SwimmerArt /> : <LifterArt />}</div>}
        <button className={`flamepill ${food > 0 ? 'lit' : ''}`} onClick={() => goTo('progress')} aria-label={`${food} day food streak. See progress`}><Icon name="flame" size={20} /><b>{food}</b></button>
        <Avatar src={avatar} name={settings.displayName} size={46} onClick={() => goTo('more')} badge={!avatar} />
        <Logo width={92} className="bannerlogo" />
        <div className="banner-text">
          {settings.displayName && <p>Hey,</p>}
          {settings.displayName
            ? <h1 className={`bigname ${nameSize(settings.displayName)}`}>{settings.displayName}</h1>
            : <h1>{friendlyDay(date)}</h1>}
          <span className="daylabel">{settings.displayName ? `${friendlyDay(date) === fmtDay(date) ? fmtDay(date) : `${friendlyDay(date)}, ${fmtDay(date)}`}` : fmtDay(date)}<em>{quoteFor(date)}</em></span>
        </div>
      </header>

      <WeekStrip date={date} setDate={setDate} summaries={st?.summaries} />

      <section className="hero">
        <Barbell kcal={total.kcal} kcalGoal={goal.kcal} protein={total.p} proteinGoal={goal.protein} />
        <div className="hero-nums">
          <Stat value={total.kcal} of={`of ${fmt(goal.kcal)} kcal`} sub={left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over`} color="var(--cal)" />
          <Stat align="right" value={total.p} unit="g" of={`of ${fmt(goal.protein)} g protein`} sub={total.p >= goal.protein ? 'Target hit' : `${fmt(goal.protein - total.p)} g to go`} color="var(--pro)" />
        </div>
        <button className="coach coachask" onClick={() => openCoach()}>
          <span className="coachask-text"><b>{coach.title}</b><span>{coach.text}</span></span>
          <span className="askpill"><Icon name="spark" size={15} /> Ask</span>
        </button>
      </section>

      <div className="cta">
        <label className="btn primary filebtn"><Icon name="camera" /> Snap food<input type="file" accept="image/*" capture="environment" onChange={snap} aria-label="Snap a food photo" /></label>
        <button className="btn fill" onClick={() => setAdding({ meal: defaultMeal(settings.meals) })}><Icon name="search" /> Search food</button>
      </div>

      <button className="askbar" onClick={() => openCoach()}>
        <span className="coachmark"><Icon name="spark" size={16} /></span>
        <span className="askbar-text"><b>Ask Astra Coach</b><em>What should I eat next?</em></span>
        <span className="askbar-go"><Icon name="send" size={18} /></span>
      </button>

      {!settings.hideBarHelp && (
          <div className="barhelp">
            <p>Left plates load with your <b>calories</b>. Right plates load with your <b>protein</b>. Fill both sides to hit today's goal. Drag the bar to spin it.</p>
            <button className="linkbtn" onClick={() => saveSettings({ hideBarHelp: true })}>Got it</button>
          </div>
        )}

      <section className="macros">
        <div className="macro2">
          <Meter label="Carbs" value={total.c} max={goal.carbs} color="var(--carb)" right={`${fmt(total.c)} / ${fmt(goal.carbs)} g`} />
          <Meter label="Fat" value={total.f} max={goal.fat} color="var(--fat)" right={`${fmt(total.f)} / ${fmt(goal.fat)} g`} />
        </div>
      </section>

      {st && <StartCard settings={settings} st={st} goTo={goTo} onFood={() => setAdding({ meal: defaultMeal(settings.meals) })} />}

      {st && (
        <button className="streaks" onClick={() => goTo('progress')} aria-label="See streaks and progress">
          {[['Food', st.streaks.food.current], sports.length === 1 && sports[0] === 'gym' ? ['Gym', st.streaks.gym.current] : ['Active', st.streaks.active.current], ['Protein', st.streaks.protein.current], ['Water', st.streaks.water.current]].map(([label, n]) => (
            <span key={label} className={n > 0 ? 'live' : ''}><Icon name="flame" size={16} /><b>{n}</b><em>{label}</em></span>
          ))}
        </button>
      )}

      {backupDue && (
        <Notice kind="warn">
          {backupDays == null ? 'You have no backup yet.' : `Your last backup was ${backupDays} days ago.`} Deleting the app erases its data. <button className="linkbtn" onClick={() => goTo('more', 'dl')}>Save a backup</button>
        </Notice>
      )}

      {settings.meals.map((meal) => {
        const rows = logs.filter((l) => l.meal === meal);
        const t = sumLogs(rows);
        const prev = yesterdayLogs.filter((l) => l.meal === meal);
        const [ic, tone] = MEAL_ICON[meal] || ['plate', 'blue'];
        return (
          <section className="meal" key={meal}>
            <div className="meal-head">
              <span className={`tile ${tone}`}><Icon name={ic} size={18} /></span>
              <h2>{meal}</h2>
              {rows.length > 0 && <span className="meal-total">{fmt(t.kcal)} kcal, {fmt(t.p)} g protein</span>}
              <button className="iconbtn small addbtn" aria-label={`Add to ${meal}`} onClick={() => setAdding({ meal })}><Icon name="plus" size={20} /></button>
            </div>
            {rows.map((l) => (
              <button key={l.id} className="row" onClick={() => setEditing(l)}>
                <span className="row-main"><span className="row-title">{l.name}</span><span className="row-sub">{l.grams ? `${round(l.grams)} g` : 'Quick add'}{l.hasPhoto ? ', from photo' : ''}</span></span>
                <span className="row-side"><b>{fmt(l.kcal)}</b> kcal<br />{round(l.p, 1)} g protein</span>
              </button>
            ))}
            {rows.length === 0 && prev.length > 0 && <button className="linkbtn copy" onClick={() => copyMeal(meal)}>Copy yesterday's {meal.toLowerCase()} ({fmt(sumLogs(prev).kcal)} kcal)</button>}
          </section>
        );
      })}

      <section className="meal">
        <div className="meal-head"><span className="tile blue"><Icon name="drop" size={18} /></span><h2>Water</h2><span className="meal-total">{fmt(water)} of {fmt(goal.water)} ml</span></div>
        <div className="meter-track tall"><div style={{ width: `${Math.min(100, (water / goal.water) * 100)}%`, background: 'var(--pro)' }} /></div>
        <div className="chips">
          <button className="chip" onClick={() => addWater(250)}>+250 ml</button>
          <button className="chip" onClick={() => addWater(500)}>+500 ml</button>
          <button className="chip" onClick={() => addWater(1000)}>+1 L</button>
          <button className="chip" disabled={water <= 0} onClick={() => addWater(-250)}>−250 ml</button>
        </div>
      </section>

      {sports.includes('run') && <ActivityCard sport="run" rows={activities} date={date} startTrain={startTrain} />}
      {sports.includes('swim') && <ActivityCard sport="swim" rows={activities} date={date} startTrain={startTrain} />}

      {sports.includes('gym') && <section className="meal">
        <div className="meal-head"><span className="tile purple"><Icon name="bar" size={18} /></span><h2>Gym</h2></div>
        {done.map((w) => <div className="row static" key={w.id}><span className="row-main"><span className="row-title">{w.name || 'Workout'}</span><span className="row-sub">{w.exercises?.length || 0} exercises</span></span><span className="row-side"><b>{fmt(workoutVolume(w))}</b> kg lifted</span></div>)}
        <div className="chips">
          <button className="chip strong" onClick={() => startTrain('gym', date)}><Icon name="bar" size={18} /> {done.length ? 'Log another workout' : 'Start workout'}</button>
          {!done.length && <button className={`chip ${day?.rest ? 'selected' : ''}`} aria-pressed={!!day?.rest} onClick={() => setDay(date, { rest: !day?.rest })}>{day?.rest ? 'Rest day marked' : 'Mark rest day'}</button>}
        </div>
      </section>}

      <section className="meal">
        <div className="meal-head"><span className="tile green"><Icon name="scale" size={18} /></span><h2>Body</h2>{body?.weight && <span className="meal-total">{body.weight} kg</span>}</div>
        <div className="chips"><button className="chip" onClick={() => setBodyOpen(true)}>{body ? 'Edit weight and size' : 'Add weight and size'}</button></div>
      </section>

      {adding && <AddFood date={date} meal={adding.meal} initialImages={adding.images || null} settings={settings} onClose={() => setAdding(null)} goTo={goTo} />}
      {editing && <EntrySheet entry={editing} meals={settings.meals} onClose={() => setEditing(null)} />}
      {bodyOpen && <BodyEntry date={date} onClose={() => setBodyOpen(false)} />}
      {party > 0 && <Confetti key={party} />}
    </div>
  );
}
