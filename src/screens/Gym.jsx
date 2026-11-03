import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSettings, setDay } from '../lib/db.js';
import { BUILTIN_EXERCISES, MUSCLES } from '../data/exercises.js';
import { fmtDay, friendlyDay, todayKey } from '../lib/dates.js';
import { exerciseHistory, prsInRange, workoutVolume } from '../lib/stats.js';
import { parseNum } from '../lib/nutrition.js';
import { Field, Icon, NumInput, Notice, Sheet, fmt, useToast } from '../components/ui.jsx';
import { LifterArt } from '../components/Art.jsx';

const findExercise = (name, custom) => [...(custom || []), ...BUILTIN_EXERCISES].find((e) => e.name === name) || { name, muscle: 'Other', kind: 'weight' };
const blankSet = (kind) => (kind === 'cardio' ? { min: '', km: '', done: false } : { w: '', r: '', done: false });

const Picker = ({ onPick, onClose }) => {
  const custom = useLiveQuery(() => db.exercises.toArray(), [], []);
  const [q, setQ] = useState('');
  const [m, setM] = useState('All');
  const [adding, setAdding] = useState(false);
  const [muscle, setMuscle] = useState('Chest');
  const all = useMemo(() => [...custom, ...BUILTIN_EXERCISES], [custom]);
  const rows = all.filter((e) => (m === 'All' || e.muscle === m) && e.name.toLowerCase().includes(q.toLowerCase().trim()));
  const addCustom = async () => {
    const ex = { name: q.trim(), muscle, kind: muscle === 'Cardio' ? 'cardio' : 'weight' };
    await db.exercises.add(ex); onPick(ex);
  };
  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <div className="stack">
        <div className="searchbox"><Icon name="search" size={20} /><input type="search" aria-label="Search exercises" value={q} onChange={(e) => { setQ(e.target.value); setAdding(false); }} placeholder="Search exercises" /></div>
        <div className="chips scroll">{['All', ...MUSCLES].map((x) => <button key={x} className={`chip ${m === x ? 'selected' : ''}`} onClick={() => setM(x)}>{x}</button>)}</div>
        <section>{rows.map((e) => <button key={e.name} className="row" onClick={() => onPick(e)}><span className="row-main"><span className="row-title">{e.name}</span><span className="row-sub">{e.muscle}</span></span></button>)}</section>
        {q.trim() && !rows.some((r) => r.name.toLowerCase() === q.trim().toLowerCase()) && (adding ? (
          <div className="stack">
            <Field label="Muscle group"><select value={muscle} onChange={(e) => setMuscle(e.target.value)}>{MUSCLES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <button className="btn primary" onClick={addCustom}>Save "{q.trim()}"</button>
          </div>
        ) : <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> Create "{q.trim()}"</button>)}
      </div>
    </Sheet>
  );
};

const beep = () => {
  try {
    const A = window.AudioContext || window.webkitAudioContext; const c = new A();
    const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.25);
    setTimeout(() => c.close(), 500);
  } catch { /* sound is optional */ }
};
const RestTimer = ({ endsAt, onAdjust, onStop }) => {
  const [, tick] = useState(0);
  const beeped = useRef(false);
  useEffect(() => { beeped.current = false; const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, [endsAt]);
  const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  useEffect(() => { if (left === 0 && !beeped.current) { beeped.current = true; beep(); navigator.vibrate?.(200); } }, [left]);
  return (
    <div className="resttimer" role="timer">
      <button className="chip" onClick={() => onAdjust(-15)}>−15</button>
      <b>{left === 0 ? 'Go!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</b>
      <button className="chip" onClick={() => onAdjust(15)}>+15</button>
      <button className="chip" onClick={onStop}>{left === 0 ? 'Close' : 'Skip'}</button>
    </div>
  );
};

const lastSetsFor = (name, history, currentId) => {
  for (const w of history) {
    if (w.id === currentId || !w.endedAt) continue;
    const e = w.exercises?.find((x) => x.name === name);
    if (e?.sets?.length) return e.sets;
  }
  return [];
};

const Logger = ({ workoutId, settings, onClose }) => {
  const toast = useToast();
  const [w, setW] = useState(null);
  const [picking, setPicking] = useState(false);
  const [restEnd, setRestEnd] = useState(null);
  const custom = useLiveQuery(() => db.exercises.toArray(), [], []);
  const history = useLiveQuery(() => db.workouts.orderBy('date').reverse().toArray(), [], []);
  const wake = useRef(null);
  const editingOld = !!w?.endedAt;

  useEffect(() => { db.workouts.get(workoutId).then(setW); }, [workoutId]);
  useEffect(() => {
    if (editingOld) return undefined;
    const lock = async () => { try { wake.current = await navigator.wakeLock?.request('screen'); } catch { /* optional */ } };
    lock();
    const onVis = () => { if (!document.hidden) lock(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); wake.current?.release?.(); };
  }, [editingOld]);

  // Saved on every change, so closing the app mid-workout loses nothing.
  const update = (fn) => setW((cur) => { const next = fn(cur); db.workouts.put(next); return next; });
  const setEx = (i, fn) => update((c) => ({ ...c, exercises: c.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const setSet = (i, s, patch) => setEx(i, (e) => ({ ...e, sets: e.sets.map((x, j) => (j === s ? { ...x, ...patch } : x)) }));
  const tick = (i, s, kind, set) => {
    const doneNow = !set.done;
    const prev = lastSetsFor(w.exercises[i].name, history, w.id)[s];
    const patch = { done: doneNow };
    if (doneNow && kind !== 'cardio') { if (!set.w && prev?.w) patch.w = prev.w; if (!set.r && prev?.r) patch.r = prev.r; }
    setSet(i, s, patch);
    if (doneNow && !editingOld && kind !== 'cardio') setRestEnd(Date.now() + settings.restSeconds * 1000);
  };
  const addSet = (i) => setEx(i, (e) => {
    const last = e.sets[e.sets.length - 1];
    return { ...e, sets: [...e.sets, e.kind === 'cardio' ? blankSet('cardio') : { w: last?.w ?? '', r: last?.r ?? '', done: false }] };
  });
  const addExercise = (ex) => {
    setPicking(false);
    update((c) => ({ ...c, exercises: [...c.exercises, { name: ex.name, muscle: ex.muscle, kind: ex.kind, sets: [blankSet(ex.kind)] }] }));
  };
  const finish = async () => {
    const cleaned = w.exercises.map((e) => ({
      ...e,
      sets: e.sets.filter((s) => (e.kind === 'cardio' ? parseNum(s.min) > 0 : parseNum(s.r) > 0))
        .map((s) => (e.kind === 'cardio' ? { min: parseNum(s.min), km: parseNum(s.km) || 0, done: true } : { w: parseNum(s.w) || 0, r: parseNum(s.r), warmup: !!s.warmup, done: true })),
    })).filter((e) => e.sets.length);
    if (!cleaned.length) { toast('Enter reps for at least one set, or discard this workout.'); return; }
    const final = { ...w, exercises: cleaned, endedAt: w.endedAt || Date.now() };
    await db.workouts.put(final);
    if (!editingOld) await setDay(w.date, { rest: false });
    const all = await db.workouts.toArray();
    const prs = prsInRange(exerciseHistory(all), w.date, w.date).filter((p) => p.workoutId === w.id);
    toast(editingOld ? 'Workout updated' : `Workout saved: ${fmt(workoutVolume(final))} kg${prs.length ? `, ${prs.length} new personal best${prs.length > 1 ? 's' : ''}` : ''}`);
    onClose();
  };
  const discard = async () => { await db.workouts.delete(w.id); toast(editingOld ? 'Workout deleted' : 'Workout discarded'); onClose(); };

  if (!w) return null;
  return (
    <Sheet title={editingOld ? `Edit ${fmtDay(w.date)}` : friendlyDay(w.date)} onClose={onClose}>
      <div className="stack logger">
        <Field label="Workout name"><input type="text" value={w.name || ''} onChange={(e) => update((c) => ({ ...c, name: e.target.value }))} placeholder="Push day" /></Field>
        {w.exercises.length > 0 && <Notice>Enter your kg and reps, then tap the tick after each set. The rest timer starts by itself. Tap a set number to mark it as a warm-up.</Notice>}
        {w.exercises.map((e, i) => {
          const prev = lastSetsFor(e.name, history, w.id);
          return (
            <section className="ex" key={`${e.name}-${i}`}>
              <div className="ex-head"><h3>{e.name}</h3><button className="iconbtn small" aria-label={`Remove ${e.name}`} onClick={() => update((c) => ({ ...c, exercises: c.exercises.filter((_, j) => j !== i) }))}><Icon name="trash" size={18} /></button></div>
              <div className={`setgrid head ${e.kind === 'cardio' ? 'cardio' : ''}`}>
                {e.kind === 'cardio' ? <><span>Set</span><span>Minutes</span><span>Km</span><span /></> : <><span>Set</span><span>Last</span><span>Kg</span><span>Reps</span><span /></>}
              </div>
              {e.sets.map((s, si) => (
                <div className={`setgrid ${s.done ? 'isdone' : ''} ${e.kind === 'cardio' ? 'cardio' : ''}`} key={si}>
                  <button className="setno" aria-label={`Set ${si + 1}: ${s.warmup ? 'warm-up, tap to count it as a working set' : 'tap to mark as warm-up'}`} onClick={() => setSet(i, si, { warmup: !s.warmup })}>{s.warmup ? 'W' : si + 1}</button>
                  {e.kind === 'cardio' ? (
                    <>
                      <NumInput value={s.min} onChange={(v) => setSet(i, si, { min: v })} label={`Set ${si + 1} minutes`} />
                      <NumInput value={s.km} onChange={(v) => setSet(i, si, { km: v })} label={`Set ${si + 1} kilometres`} />
                    </>
                  ) : (
                    <>
                      <span className="prev">{prev[si] ? `${prev[si].w}×${prev[si].r}` : ''}</span>
                      <NumInput value={s.w} placeholder={prev[si]?.w ? String(prev[si].w) : ''} onChange={(v) => setSet(i, si, { w: v })} label={`${e.name} set ${si + 1} kilograms`} />
                      <NumInput value={s.r} placeholder={prev[si]?.r ? String(prev[si].r) : ''} integer onChange={(v) => setSet(i, si, { r: v })} label={`${e.name} set ${si + 1} reps`} />
                    </>
                  )}
                  <button className={`tick ${s.done ? 'on' : ''}`} aria-pressed={!!s.done} aria-label={`Mark set ${si + 1} done`} onClick={() => tick(i, si, e.kind, s)}><Icon name="check" size={20} /></button>
                </div>
              ))}
              <div className="chips">
                <button className="chip" onClick={() => addSet(i)}><Icon name="plus" size={16} /> Add set</button>
                {e.sets.length > 1 && <button className="chip" onClick={() => setEx(i, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}>Remove last set</button>}
              </div>
            </section>
          );
        })}
        <button className="btn" onClick={() => setPicking(true)}><Icon name="plus" size={18} /> Add exercise</button>
        <button className="btn primary" onClick={finish}>{editingOld ? 'Save changes' : 'Finish workout'}</button>
        <button className="btn danger" onClick={discard}>{editingOld ? 'Delete workout' : 'Discard workout'}</button>
        {restEnd && <div style={{ height: 60 }} />}
      </div>
      {restEnd && <RestTimer endsAt={restEnd} onAdjust={(d) => setRestEnd((x) => x + d * 1000)} onStop={() => setRestEnd(null)} />}
      {picking && <Picker onPick={addExercise} onClose={() => setPicking(false)} />}
    </Sheet>
  );
};

const RoutineEditor = ({ routine, onClose }) => {
  const [name, setName] = useState(routine?.name || '');
  const [items, setItems] = useState(routine?.items || []);
  const [picking, setPicking] = useState(false);
  const up = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const save = async () => {
    const row = { name: name.trim(), items: items.map((x) => ({ name: x.name, sets: parseNum(x.sets) || 3, reps: parseNum(x.reps) || 10 })) };
    if (routine?.id) await db.routines.update(routine.id, row); else await db.routines.add(row);
    onClose();
  };
  return (
    <Sheet title={routine ? 'Edit routine' : 'New routine'} onClose={onClose}>
      <div className="stack">
        <Field label="Routine name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Upper body" /></Field>
        {items.map((it, i) => (
          <div className="routine-item" key={`${it.name}-${i}`}>
            <span className="row-title">{it.name}</span>
            <NumInput value={it.sets} integer onChange={(v) => up(i, { sets: v })} unit="sets" label={`${it.name} sets`} />
            <NumInput value={it.reps} integer onChange={(v) => up(i, { reps: v })} unit="reps" label={`${it.name} reps`} />
            <button className="iconbtn small" aria-label={`Remove ${it.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
          </div>
        ))}
        <button className="btn" onClick={() => setPicking(true)}><Icon name="plus" size={18} /> Add exercise</button>
        <button className="btn primary" disabled={!name.trim() || !items.length} onClick={save}>Save routine</button>
        {routine?.id && <button className="btn danger" onClick={async () => { await db.routines.delete(routine.id); onClose(); }}>Delete routine</button>}
      </div>
      {picking && <Picker onPick={(e) => { setItems([...items, { name: e.name, sets: 3, reps: 10 }]); setPicking(false); }} onClose={() => setPicking(false)} />}
    </Sheet>
  );
};

export default function Gym({ settings, intent, clearIntent }) {
  const toast = useToast();
  const routines = useLiveQuery(() => db.routines.toArray(), [], []);
  const custom = useLiveQuery(() => db.exercises.toArray(), [], []);
  const workouts = useLiveQuery(() => db.workouts.orderBy('date').reverse().toArray(), [], []);
  const [openId, setOpenId] = useState(null);
  const [editRoutine, setEditRoutine] = useState(undefined);
  const [limit, setLimit] = useState(15);
  const active = workouts.find((w) => !w.endedAt);
  const finished = workouts.filter((w) => w.endedAt);
  const date = intent?.date || todayKey();
  const day = useLiveQuery(() => db.days.get(todayKey()), [], null);
  const start = async (routine) => {
    if (active) { toast('Finish or discard your open workout first.'); setOpenId(active.id); return; }
    const exercises = (routine?.items || []).map((it) => {
      const ex = findExercise(it.name, custom);
      return { name: ex.name, muscle: ex.muscle, kind: ex.kind, target: `${it.sets}×${it.reps}`, sets: Array.from({ length: it.sets }, () => blankSet(ex.kind)) };
    });
    const id = await db.workouts.add({ date, name: routine?.name || '', startedAt: Date.now(), endedAt: null, exercises });
    clearIntent?.();
    setOpenId(id);
  };
  const hist = useMemo(() => exerciseHistory(workouts), [workouts]);
  const recentPrs = useMemo(() => prsInRange(hist, '2000-01-01', '2999-01-01').slice(0, 5), [hist]);
  return (
    <div className="page">
      {intent?.date && intent.date !== todayKey() && <Notice>Logging a workout for {fmtDay(intent.date)}.</Notice>}
      <section className="gymhero arthero">
        <LifterArt />
        <h2>{active ? 'Finish the set' : finished.length ? 'Time to lift' : 'Your first workout'}</h2>
        <p>{active ? 'Everything you entered is saved. Carry on when you are ready.' : 'Tap Start on a routine below, or build your own as you go.'}</p>
        {active ? (
          <button className="btn primary" onClick={() => setOpenId(active.id)}><Icon name="bar" /> Continue {active.name || 'workout'}</button>
        ) : (
          <button className="btn primary" onClick={() => start(null)}><Icon name="plus" /> Start empty workout</button>
        )}
      </section>
      <div className="chips"><button className={`chip ${day?.rest ? 'selected' : ''}`} aria-pressed={!!day?.rest} onClick={() => setDay(todayKey(), { rest: !day?.rest })}>{day?.rest ? 'Today is a rest day' : 'Mark today as rest day'}</button></div>

      <section className="meal">
        <div className="meal-head"><h2>Routines</h2><span className="meal-total">Tap Start to begin</span><button className="iconbtn small" aria-label="New routine" onClick={() => setEditRoutine(null)}><Icon name="plus" size={20} /></button></div>
        {routines.map((r) => (
          <div className="row static" key={r.id}>
            <button className="row-main plain" onClick={() => setEditRoutine(r)} aria-label={`Edit ${r.name}`}><span className="row-title">{r.name}</span><span className="row-sub">{r.items.map((x) => x.name).slice(0, 3).join(', ')}{r.items.length > 3 ? ` and ${r.items.length - 3} more` : ''}</span></button>
            <button className="chip strong" onClick={() => start(r)}>Start</button>
          </div>
        ))}
        {routines.length === 0 && <p className="muted">Save your regular workouts here so you can start them in one tap.</p>}
      </section>

      {recentPrs.length > 0 && (
        <section className="meal">
          <div className="meal-head"><h2>Personal bests</h2></div>
          {recentPrs.map((p) => <div className="row static" key={`${p.name}-${p.date}`}><span className="row-main"><span className="row-title">{p.name}</span><span className="row-sub">{fmtDay(p.date)}</span></span><span className="row-side"><b>{p.w} kg</b> × {p.r}</span></div>)}
        </section>
      )}

      <section className="meal">
        <div className="meal-head"><h2>Past workouts</h2></div>
        {finished.length === 0 && <p className="muted">Your finished workouts will appear here.</p>}
        {finished.slice(0, limit).map((w) => (
          <button className="row" key={w.id} onClick={() => setOpenId(w.id)}>
            <span className="row-main"><span className="row-title">{w.name || 'Workout'}</span><span className="row-sub">{fmtDay(w.date)}, {w.exercises.length} exercises</span></span>
            <span className="row-side"><b>{fmt(workoutVolume(w))}</b> kg lifted</span>
          </button>
        ))}
        {finished.length > limit && <button className="linkbtn" onClick={() => setLimit(limit + 30)}>Show older workouts</button>}
      </section>

      <section className="meal">
        <div className="meal-head"><h2>Rest timer</h2><span className="meal-total">{settings.restSeconds} seconds</span></div>
        <div className="chips">{[60, 90, 120, 180].map((s) => <button key={s} className={`chip ${settings.restSeconds === s ? 'selected' : ''}`} onClick={() => saveSettings({ restSeconds: s })}>{s < 120 ? `${s} s` : `${s / 60} min`}</button>)}</div>
      </section>

      {openId && <Logger workoutId={openId} settings={settings} onClose={() => { setOpenId(null); clearIntent?.(); }} />}
      {editRoutine !== undefined && <RoutineEditor routine={editRoutine} onClose={() => setEditRoutine(undefined)} />}
    </div>
  );
}
