import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import { addDays, addMonths, fmtDay, fmtDow, fmtMonth, fmtShort, fromKey, monthDays, monthStart, todayKey, weekDays, weekStart } from '../lib/dates.js';
import { buildSummaries, exerciseHistory, goalFor, muscleSets, periodStats, prsInRange } from '../lib/stats.js';
import { computeStreaks } from '../lib/streaks.js';
import { calorieHit, parseNum, round } from '../lib/nutrition.js';
import { fileToImages } from '../lib/images.js';
import { Field, Icon, Kpi, Meter, NumInput, Rings, Seg, Sheet, fmt, useToast } from '../components/ui.jsx';
import { nextMilestone } from '../lib/coach.js';
import { BarChart, LineChart } from '../components/Charts.jsx';

const useData = (settings) => {
  const data = useLiveQuery(async () => {
    const [logs, days, workouts, body, activities] = await Promise.all([db.logs.toArray(), db.days.toArray(), db.workouts.toArray(), db.body.toArray(), db.activities.toArray()]);
    return { logs, days, workouts, body, activities };
  }, [], null);
  return useMemo(() => (data ? { ...data, summaries: buildSummaries({ ...data, goalHistory: settings.goalHistory }) } : null), [data, settings.goalHistory]);
};

const StreakRow = ({ label, s, unit = 'days' }) => (
  <div className={`streak-cell ${s.current > 0 ? 'live' : ''}`}><Icon name="flame" size={18} /><b>{s.current}</b><span>{label}</span><em>Best {s.best} {s.best === 1 ? unit.slice(0, -1) : unit}</em></div>
);

const StreakHero = ({ food, summaries, today }) => {
  const m = nextMilestone(food.current);
  const week = weekDays(today);
  return (
    <section className="streakhero">
      <div className={`flame ${food.current > 0 ? 'lit' : ''}`}><Icon name="flame" size={46} /></div>
      <div className="streakhero-main">
        <b>{food.current}<small> day{food.current === 1 ? '' : 's'}</small></b>
        <span>Food logging streak</span>
        <em>{m ? `${m.left} more to reach your ${m.at}-day badge` : 'You are a legend. Keep it up.'}</em>
      </div>
      <div className="weekdots" aria-label="Days logged this week">
        {week.map((k) => <span key={k} className={`${summaries[k]?.logged ? 'on' : ''} ${k === today ? 'now' : ''}`} title={fmtDay(k)}>{fmtDow(k)}</span>)}
      </div>
    </section>
  );
};

const Goals = ({ s, today, days }) => {
  const left = days[days.length - 1] >= today ? s.totalDays - s.elapsed : 0;
  return (
    <section className="goals">
      <div className="ringwrap">
        <Rings rings={[
          { label: 'Workouts', value: s.workouts, max: s.workoutTarget, color: 'var(--gym)' },
          { label: 'Protein target days', value: s.proteinDays, max: s.totalDays, color: 'var(--pro)' },
          { label: 'Calorie target days', value: s.calorieDays, max: s.totalDays, color: 'var(--cal)' },
        ]} />
        <div className="ringlegend">
          <p><u style={{ background: 'var(--gym)' }} />Workouts<b>{s.workouts} of {s.workoutTarget}</b></p>
          <p><u style={{ background: 'var(--pro)' }} />Protein target hit<b>{s.proteinDays} of {s.totalDays} days</b></p>
          <p><u style={{ background: 'var(--cal)' }} />Calories on target<b>{s.calorieDays} of {s.totalDays} days</b></p>
        </div>
      </div>
      <Meter label="Water target hit" value={s.waterDays} max={s.totalDays} color="var(--pro)" right={`${s.waterDays} of ${s.totalDays} days`} />
      <Meter label="Days with food logged" value={s.daysLogged} max={s.totalDays} color="var(--muted)" right={`${s.daysLogged} of ${s.totalDays} days`} />
      <p className="muted small">Calories count as on target within 10% either way{left > 0 ? `. ${left} days left in this period` : ''}.</p>
    </section>
  );
};

const Numbers = ({ s, prev, prs }) => {
  const diff = (a, b) => (b ? `${a - b >= 0 ? '+' : '−'}${fmt(Math.abs(a - b))} vs last period` : 'No earlier data');
  return (
    <section className="numbers">
      <div><b>{fmt(s.avgKcal)}</b><span>average kcal a day</span><em>{diff(s.avgKcal, prev.avgKcal)}</em></div>
      <div><b><Kpi>{`${fmt(s.avgProtein)} g`}</Kpi></b><span>average protein a day</span><em>{diff(s.avgProtein, prev.avgProtein)}</em></div>
      <div><b><Kpi>{`${fmt(s.volume)} kg`}</Kpi></b><span>total weight lifted</span><em>across {s.sets} sets</em></div>
      <div><b><Kpi>{s.weightChange == null ? 'None' : `${s.weightChange > 0 ? '+' : ''}${s.weightChange} kg`}</Kpi></b><span>weight change</span><em>{s.weightEnd ? `Now ${s.weightEnd} kg` : 'Log 2 weigh-ins'}</em></div>
      <div><b>{prs.length}</b><span>new personal bests</span><em>{prs[0] ? prs[0].name : 'Keep lifting'}</em></div>
      <div><b>{s.restDays}</b><span>rest days</span><em>Marked by you</em></div>
    </section>
  );
};

const DayTable = ({ days, summaries }) => (
  <details className="tablewrap"><summary>See the numbers as a table</summary>
    <table><thead><tr><th>Day</th><th>Kcal</th><th>Protein</th><th>Water</th><th>Training</th></tr></thead>
      <tbody>{days.map((k) => { const d = summaries[k]; return <tr key={k}><td>{fmtShort(k)}</td><td>{fmt(d?.kcal)}</td><td>{fmt(d?.p)} g</td><td>{fmt(d?.water)} ml</td><td>{[d?.workout && 'Gym', d?.run && 'Run', d?.swim && 'Swim'].filter(Boolean).join(', ') || (d?.rest ? 'Rest' : '')}</td></tr>; })}</tbody>
    </table>
  </details>
);

const Muscles = ({ rows }) => (rows.length ? (
  <section className="goals"><h3 className="listhead">Sets per muscle</h3>
    {rows.map(([m, n]) => <Meter key={m} label={m} value={n} max={rows[0][1]} color="var(--ink)" right={`${n} sets`} />)}
  </section>
) : null);

const MonthGrid = ({ month, summaries, today }) => {
  const [sel, setSel] = useState(null);
  const days = monthDays(month);
  const blanks = (fromKey(days[0]).getDay() + 6) % 7;
  const d = sel && summaries[sel];
  return (
    <section className="monthgrid">
      <h3 className="listhead">Calendar</h3>
      <div className="cal" role="grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i} className="cal-dow">{x}</span>)}
        {Array.from({ length: blanks }, (_, i) => <span key={i} />)}
        {days.map((k) => {
          const s = summaries[k];
          const cal = s && calorieHit(s.kcal, s.goal.kcal);
          const pro = s && s.logged && s.p >= s.goal.protein;
          return (
            <button key={k} className={`cal-day ${k === today ? 'today' : ''} ${sel === k ? 'sel' : ''} ${k > today ? 'future' : ''}`} onClick={() => setSel(sel === k ? null : k)}
              aria-label={`${fmtDay(k)}: ${[s?.logged && 'food logged', cal && 'calories on target', pro && 'protein on target', s?.workout && 'workout', s?.rest && 'rest day'].filter(Boolean).join(', ') || 'nothing logged'}`}>
              <span>{Number(k.slice(8))}</span>
              <i>{cal && <u style={{ background: 'var(--cal)' }} />}{pro && <u style={{ background: 'var(--pro)' }} />}{s?.workout && <u className="sq" style={{ background: 'var(--ink)' }} />}</i>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span><u style={{ background: 'var(--cal)' }} />Calories on target</span>
        <span><u style={{ background: 'var(--pro)' }} />Protein on target</span>
        <span><u className="sq" style={{ background: 'var(--ink)' }} />Workout</span>
      </div>
      {sel && <p className="totals">{fmtDay(sel)}: {d?.logged ? `${fmt(d.kcal)} kcal, ${fmt(d.p)} g protein` : 'no food logged'}{d?.workout ? `, workout ${fmt(d.volume)} kg` : d?.rest ? ', rest day' : ''}</p>}
    </section>
  );
};

const Period = ({ mode, data, settings }) => {
  const sports = settings.sports || ['gym'];
  const today = todayKey();
  const [anchor, setAnchor] = useState(today);
  const isWeek = mode === 'week';
  const days = isWeek ? weekDays(anchor) : monthDays(anchor);
  const prevDays = isWeek ? weekDays(addDays(weekStart(anchor), -7)) : monthDays(addMonths(anchor, -1));
  const canNext = days[days.length - 1] < today;
  const s = periodStats(days, data.summaries, today, data.body, settings.goalHistory);
  const prev = periodStats(prevDays, data.summaries, today, data.body, settings.goalHistory);
  const hist = exerciseHistory(data.workouts);
  const prs = prsInRange(hist, days[0], days[days.length - 1]);
  const g = goalFor(settings.goalHistory, days[days.length - 1]);
  const labels = isWeek ? days.map(fmtDow) : days.map((k) => String(Number(k.slice(8))));
  const move = (d) => setAnchor(isWeek ? addDays(weekStart(anchor), d * 7) : addMonths(anchor, d));
  return (
    <>
      <header className="daybar sub">
        <button className="iconbtn" aria-label="Previous" onClick={() => move(-1)}><Icon name="left" /></button>
        <h2>{isWeek ? `${fmtShort(days[0])} to ${fmtShort(days[6])}` : fmtMonth(anchor)}</h2>
        <button className="iconbtn" aria-label="Next" disabled={!canNext} onClick={() => move(1)}><Icon name="right" /></button>
      </header>
      <Goals s={s} today={today} days={days} />
      {!isWeek && <MonthGrid month={monthStart(anchor)} summaries={data.summaries} today={today} />}
      <Numbers s={s} prev={prev} prs={prs} />
      {(sports.includes('run') || sports.includes('swim')) && (
        <section className="numbers">
          {sports.includes('run') && <div><b><Kpi>{`${s.runKm} km`}</Kpi></b><span>run in {s.runs} {s.runs === 1 ? 'session' : 'sessions'}</span></div>}
          {sports.includes('swim') && <div><b><Kpi>{`${fmt(s.swimM)} m`}</Kpi></b><span>swum in {s.swims} {s.swims === 1 ? 'session' : 'sessions'}</span></div>}
          <div><b>{fmt(s.burned)}</b><span>kcal burned running and swimming</span></div>
        </section>
      )}
      <BarChart title="Calories" days={days} labels={labels} values={days.map((k) => round(data.summaries[k]?.kcal))} target={g.kcal} color="var(--cal)" unit="kcal" fullLabel={fmtDay} />
      <BarChart title="Protein" days={days} labels={labels} values={days.map((k) => round(data.summaries[k]?.p))} target={g.protein} color="var(--pro)" unit="g" fullLabel={fmtDay} />
      {sports.includes('run') && <BarChart title="Running distance" days={days} labels={labels} values={days.map((k) => round((data.summaries[k]?.runM || 0) / 1000, 2))} color="var(--cal)" unit="km" fullLabel={fmtDay} />}
      {sports.includes('swim') && <BarChart title="Swimming distance" days={days} labels={labels} values={days.map((k) => round(data.summaries[k]?.swimM))} color="var(--pro)" unit="m" fullLabel={fmtDay} />}
      {sports.includes('gym') && <BarChart title="Weight lifted" days={days} labels={labels} values={days.map((k) => round(data.summaries[k]?.volume))} color="var(--ink)" unit="kg" fullLabel={fmtDay} />}
      <Muscles rows={muscleSets(data.workouts, days[0], days[days.length - 1])} />
      <DayTable days={days} summaries={data.summaries} />
    </>
  );
};

const Lifts = ({ data }) => {
  const hist = useMemo(() => exerciseHistory(data.workouts), [data.workouts]);
  const names = Object.keys(hist).sort((a, b) => hist[b].sessions.length - hist[a].sessions.length);
  const [name, setName] = useState(names[0] || '');
  if (!names.length) return <p className="muted pad">Finish a workout and your lifts will appear here.</p>;
  const r = hist[name] || hist[names[0]];
  return (
    <div className="stack">
      <Field label="Exercise"><select value={r.name} onChange={(e) => setName(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select></Field>
      <section className="numbers two">
        <div><b><Kpi>{`${r.bestWeight} kg`}</Kpi></b><span>heaviest set</span></div>
        <div><b><Kpi>{`${round(r.bestE1rm)} kg`}</Kpi></b><span>strength score</span></div>
      </section>
      <LineChart note="Your estimated 1-rep max, worked out from your best set" title="Strength score" unit="kg" points={r.sessions.map((s) => ({ v: s.e1rm, label: fmtShort(s.date) }))} />
      <section>
        <h3 className="listhead">Sessions</h3>
        {[...r.sessions].reverse().slice(0, 20).map((s) => (
          <div className="row static" key={`${s.date}-${s.workoutId}`}><span className="row-main"><span className="row-title">{s.w} kg × {s.r}{s.pr ? ' (personal best)' : ''}</span><span className="row-sub">{fmtDay(s.date)}</span></span><span className="row-side"><b>{fmt(s.volume)}</b> kg total</span></div>
        ))}
      </section>
    </div>
  );
};

const MEASURES = [['weight', 'Weight', 'kg'], ['waist', 'Waist', 'cm'], ['chest', 'Chest', 'cm'], ['arm', 'Arm', 'cm'], ['thigh', 'Thigh', 'cm'], ['hip', 'Hip', 'cm']];
export const BodyEntry = ({ date, onClose }) => {
  const [v, setV] = useState(null);
  useLiveQuery(async () => { const r = (await db.body.get(date)) || {}; setV((x) => x || Object.fromEntries(MEASURES.map(([k]) => [k, r[k] != null ? String(r[k]) : '']))); return r; }, [date]);
  if (!v) return null;
  const save = async () => {
    const out = { date };
    MEASURES.forEach(([k]) => { const n = parseNum(v[k]); if (n > 0) out[k] = n; });
    if (Object.keys(out).length > 1) await db.body.put(out); else await db.body.delete(date);
    onClose();
  };
  return (
    <Sheet title={`Body, ${fmtDay(date)}`} onClose={onClose}>
      <div className="stack">
        <div className="row2">{MEASURES.map(([k, label, unit]) => <Field key={k} label={label}><NumInput value={v[k]} onChange={(x) => setV({ ...v, [k]: x })} unit={unit} label={`${label} in ${unit}`} /></Field>)}</div>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
};

const Body = ({ data }) => {
  const toast = useToast();
  const [entry, setEntry] = useState(null);
  const [metric, setMetric] = useState('weight');
  const [view, setView] = useState(null);
  const photos = useLiveQuery(() => db.photos.orderBy('date').reverse().toArray(), [], []);
  const sorted = [...data.body].sort((a, b) => a.date.localeCompare(b.date));
  const m = MEASURES.find((x) => x[0] === metric);
  const points = sorted.filter((b) => b[metric]).map((b) => ({ v: b[metric], label: fmtShort(b.date) }));
  const addPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { const { large } = await fileToImages(f); await db.photos.add({ date: todayKey(), data: large }); toast('Progress photo saved'); } catch (err) { toast(err.message); }
  };
  return (
    <div className="stack">
      <button className="btn primary" onClick={() => setEntry(todayKey())}><Icon name="plus" /> Log today's weight and size</button>
      <div className="chips scroll">{MEASURES.map(([k, label]) => <button key={k} className={`chip ${metric === k ? 'selected' : ''}`} onClick={() => setMetric(k)}>{label}</button>)}</div>
      <LineChart title={m[1]} unit={m[2]} points={points} />
      <section>
        <h3 className="listhead">Progress photos</h3>
        <p className="muted small">Saved only on this phone. They go into your full backup file.</p>
        <div className="photogrid">
          <label className="photoadd"><Icon name="camera" /><span>Add</span><input type="file" accept="image/*" onChange={addPhoto} aria-label="Add a progress photo" /></label>
          {photos.map((p) => <button key={p.id} onClick={() => setView(p)} aria-label={`Progress photo, ${fmtDay(p.date)}`}><img src={p.data} alt="" /><span>{fmtShort(p.date)}</span></button>)}
        </div>
      </section>
      <section>
        <h3 className="listhead">Entries</h3>
        {[...sorted].reverse().slice(0, 30).map((b) => (
          <button className="row" key={b.date} onClick={() => setEntry(b.date)}><span className="row-main"><span className="row-title">{b.weight ? `${b.weight} kg` : 'Measurements'}</span><span className="row-sub">{fmtDay(b.date)}</span></span></button>
        ))}
      </section>
      {entry && <BodyEntry date={entry} onClose={() => setEntry(null)} />}
      {view && (
        <Sheet title={fmtDay(view.date)} onClose={() => setView(null)}>
          <div className="stack"><img className="fullphoto" src={view.data} alt="Progress" />
            <button className="btn danger" onClick={async () => { await db.photos.delete(view.id); setView(null); }}>Delete photo</button></div>
        </Sheet>
      )}
    </div>
  );
};

export default function Progress({ settings }) {
  const [tab, setTab] = useState('week');
  const data = useData(settings);
  if (!data) return null;
  const today = todayKey();
  const st = computeStreaks(data.summaries, today, goalFor(settings.goalHistory, today).workouts);
  const sports = settings.sports || ['gym'];
  return (
    <div className="page">
      <header className="pagehead"><h1>Progress</h1></header>
      <StreakHero food={st.food} summaries={data.summaries} today={today} />
      <section className="streak-grid" aria-label="Other streaks">
        {sports.includes('gym') && <StreakRow label="Gym" s={st.gym} />}
        {sports.includes('run') && <StreakRow label="Running" s={st.run} />}
        {sports.includes('swim') && <StreakRow label="Swimming" s={st.swim} />}
        {sports.length > 1 && <StreakRow label="Any training" s={st.active} />}
        <StreakRow label="Protein target" s={st.protein} />
        <StreakRow label="Calorie target" s={st.calories} />
        <StreakRow label="Water target" s={st.water} />
      </section>
      <p className="muted small note">Rest days you mark keep your gym streak alive, up to {7 - goalFor(settings.goalHistory, today).workouts} a week.</p>
      <Seg label="Progress view" value={tab} onChange={setTab} options={[['week', 'Week'], ['month', 'Month'], ['lifts', 'Lifts'], ['body', 'Body']]} />
      {tab === 'week' && <Period key="w" mode="week" data={data} settings={settings} />}
      {tab === 'month' && <Period key="m" mode="month" data={data} settings={settings} />}
      {tab === 'lifts' && <Lifts data={data} />}
      {tab === 'body' && <Body data={data} />}
    </div>
  );
}
