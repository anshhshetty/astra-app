import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, setDay } from '../lib/db.js';
import { addDays, fmtDay, fmtShort, friendlyDay, todayKey, weekDays } from '../lib/dates.js';
import { fmtClock, fmtDuration, fmtKm, haversine, runCalories, runPace, shouldAccept, swimCalories, swimPace, SWIM_EFFORT, SWIM_STROKES } from '../lib/geo.js';
import { fitView, project, drawTiles, drawRoute, MAP_CREDIT } from '../lib/mapdraw.js';
import { renderCard, cardBlob } from '../lib/card.js';
import { saveFile } from '../lib/exporters.js';
import { fileToImages } from '../lib/images.js';
import { buildSummaries, goalFor } from '../lib/stats.js';
import { computeStreaks } from '../lib/streaks.js';
import { parseNum } from '../lib/nutrition.js';
import { Field, Icon, Kpi, NumInput, Notice, Seg, Sheet, fmt, useToast } from '../components/ui.jsx';
import Gym from './Gym.jsx';
import { RunnerArt, SwimmerArt } from '../components/Art.jsx';

export const currentWeight = async () => {
  const rows = (await db.body.toArray()).filter((b) => b.weight).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length) return rows[rows.length - 1].weight;
  return (await getSettings()).profile?.weightKg || 70;
};

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark'
  || (document.documentElement.getAttribute('data-theme') !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

const LiveMap = ({ points, here, height = 260 }) => {
  const ref = useRef(null);
  const [credit, setCredit] = useState(false);
  const pts = points.length ? points : here ? [here] : [];
  useEffect(() => {
    const c = ref.current;
    if (!c || !pts.length) return;
    let gone = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = c.clientWidth || 360; const H = height;
    (async () => {
      const off = document.createElement('canvas'); off.width = W * dpr; off.height = H * dpr;
      const o = off.getContext('2d'); o.scale(dpr, dpr);
      const v = fitView(pts, W, H, { pad: 34, scale: 1, maxZoom: 17 });
      const any = await drawTiles(o, v, { dark: isDark() });
      if (gone) return;
      drawRoute(o, pts, (p) => project(v, p), 5);
      const last = project(v, pts[pts.length - 1]);
      o.beginPath(); o.arc(last[0], last[1], 7, 0, 7); o.fillStyle = '#3D8BFF'; o.fill(); o.lineWidth = 3; o.strokeStyle = '#fff'; o.stroke();
      c.width = W * dpr; c.height = H * dpr;
      c.getContext('2d').drawImage(off, 0, 0);
      setCredit(any);
    })();
    return () => { gone = true; };
  }, [pts.length, pts[pts.length - 1]?.[0], pts[pts.length - 1]?.[1], height]);
  return (
    <div className="livemap" style={{ height }}>
      <canvas ref={ref} style={{ width: '100%', height }} aria-label="Map of your route" role="img" />
      {!pts.length && <div className="livemap-empty"><span className="spin" /> Finding your location</div>}
      {credit && <span className="mapcredit">{MAP_CREDIT}</span>}
    </div>
  );
};

const GEO_HELP = {
  1: "Location is turned off for Astra. On your iPhone, open Settings, then Privacy & Security, then Location Services, and allow Safari Websites while using the app. Then try again.",
  2: "Your iPhone can't find your location right now. Go outside with a clear view of the sky.",
  3: 'Still waiting for GPS. Go outside with a clear view of the sky.',
};

// Live GPS run. Saved as it goes, so closing the app doesn't lose it.
const RunSession = ({ activityId, onFinish, onClose }) => {
  const toast = useToast();
  const [a, setA] = useState(null);
  const [points, setPoints] = useState([]);
  const [here, setHere] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [geoErr, setGeoErr] = useState(null);
  const [, tick] = useState(0);
  const ref = useRef({ pts: [], meters: 0, running: false, hiddenAt: null });
  const wake = useRef(null);

  useEffect(() => {
    (async () => {
      const row = await db.activities.get(activityId);
      const route = (await db.routes.get(activityId))?.points || [];
      ref.current.pts = route; ref.current.meters = row.meters || 0; ref.current.running = row.status === 'running';
      setA(row); setPoints(route);
    })();
  }, [activityId]);

  useEffect(() => {
    if (!navigator.geolocation) { setGeoErr('This phone has no location service available.'); return undefined; }
    const id = navigator.geolocation.watchPosition((pos) => {
      const p = [pos.coords.latitude, pos.coords.longitude, pos.timestamp || Date.now()];
      setGeoErr(null); setHere(p); setAccuracy(pos.coords.accuracy);
      const r = ref.current;
      if (!r.running) return;
      const prev = r.pts[r.pts.length - 1];
      if (!shouldAccept(prev, p, pos.coords.accuracy)) return;
      if (prev) r.meters += haversine(prev, p);
      r.pts = [...r.pts, p];
      setPoints(r.pts);
      db.routes.put({ activityId, points: r.pts });
      db.activities.update(activityId, { meters: r.meters });
    }, (err) => setGeoErr(GEO_HELP[err.code] || GEO_HELP[2]), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [activityId]);

  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const lock = async () => { try { wake.current = await navigator.wakeLock?.request('screen'); } catch { /* optional */ } };
    lock();
    const onVis = () => {
      const r = ref.current;
      if (document.hidden) { r.hiddenAt = Date.now(); return; }
      lock();
      if (r.running && r.hiddenAt && Date.now() - r.hiddenAt > 15000) toast('GPS paused while the app was closed, so that part of your route is estimated.');
      r.hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); wake.current?.release?.(); };
  }, []);

  if (!a) return null;
  const seconds = (a.seconds || 0) + (a.status === 'running' && a.segmentStart ? (Date.now() - a.segmentStart) / 1000 : 0);
  const meters = ref.current.meters;
  const started = a.status !== 'ready';
  const patch = async (p) => { await db.activities.update(activityId, p); setA((x) => ({ ...x, ...p })); };
  const start = () => { ref.current.running = true; patch({ status: 'running', segmentStart: Date.now(), startedAt: a.startedAt || Date.now() }); };
  const pause = () => { ref.current.running = false; patch({ status: 'paused', seconds, segmentStart: null }); };
  const resume = () => { ref.current.running = true; patch({ status: 'running', segmentStart: Date.now() }); };
  const finish = async () => {
    ref.current.running = false;
    const kg = await currentWeight();
    const final = { status: 'done', seconds, meters, kcal: runCalories(meters, seconds, kg), segmentStart: null, endedAt: Date.now() };
    await db.activities.update(activityId, final);
    await setDay(a.date, { rest: false });
    onFinish(activityId);
  };
  const discard = async () => {
    if (started && meters > 50 && !window.confirm('Discard this run? It will not be saved.')) return;
    ref.current.running = false;
    await db.transaction('rw', db.activities, db.routes, async () => { await db.activities.delete(activityId); await db.routes.delete(activityId); });
    onClose();
  };
  const weak = accuracy != null && accuracy > 35;
  return (
    <Sheet title={started ? 'Your run' : 'Ready to run'} onClose={onClose}>
      <div className="stack">
        <LiveMap points={points} here={here} />
        {geoErr && <Notice kind="error">{geoErr}</Notice>}
        {!geoErr && weak && <Notice kind="warn">GPS signal is weak. Move to an open area for a better route.</Notice>}
        <div className="runstats">
          <div className="runmain"><b>{fmtKm(meters)}</b><span>kilometres</span></div>
          <div><b>{fmtClock(seconds)}</b><span>time</span></div>
          <div><b>{runPace(meters, seconds)}</b><span>pace /km</span></div>
        </div>
        {a.status === 'ready' && <button className="btn primary huge" onClick={start}><Icon name="bolt" /> Start run</button>}
        {a.status === 'running' && <button className="btn fill huge" onClick={pause}>Pause</button>}
        {a.status === 'paused' && (
          <div className="cta">
            <button className="btn primary huge" onClick={resume}>Resume</button>
            <button className="btn fill huge" onClick={finish}>Finish</button>
          </div>
        )}
        <Notice>Keep the app open and your screen on. iPhone stops GPS for web apps when the screen locks or you switch apps.</Notice>
        <button className="btn danger" onClick={discard}>{started ? 'Discard run' : 'Cancel'}</button>
      </div>
    </Sheet>
  );
};

const ManualEntry = ({ sport, initialDate, onClose, onSaved }) => {
  const [date, setDate] = useState(initialDate);
  const [mins, setMins] = useState('');
  const [secs, setSecs] = useState('');
  const [dist, setDist] = useState('');
  const [laps, setLaps] = useState('');
  const [pool, setPool] = useState('25');
  const [useLaps, setUseLaps] = useState(sport === 'swim');
  const [stroke, setStroke] = useState('Freestyle');
  const [effort, setEffort] = useState('steady');
  const swim = sport === 'swim';
  const seconds = (parseNum(mins) || 0) * 60 + (parseNum(secs) || 0);
  const meters = swim
    ? (useLaps ? (parseNum(laps) || 0) * (parseNum(pool) || 0) : parseNum(dist) || 0)
    : (parseNum(dist) || 0) * 1000;
  const ok = seconds > 0 && meters > 0 && date <= todayKey();
  const save = async () => {
    const kg = await currentWeight();
    const row = {
      date, sport, seconds, meters, status: 'done', manual: true, startedAt: Date.now(), endedAt: Date.now(),
      kcal: swim ? swimCalories(seconds, kg, effort) : runCalories(meters, seconds, kg),
      ...(swim ? { stroke, effort, laps: useLaps ? parseNum(laps) : null, poolM: useLaps ? parseNum(pool) : null } : {}),
    };
    const id = await db.activities.add(row);
    await setDay(date, { rest: false });
    onSaved(id);
  };
  return (
    <Sheet title={swim ? 'Log a swim' : 'Add a run'} onClose={onClose}>
      <div className="stack">
        <Field label="Date"><input type="date" max={todayKey()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
        <div className="row2">
          <Field label="Minutes"><NumInput value={mins} onChange={setMins} integer unit="min" label="Minutes" autoFocus /></Field>
          <Field label="Seconds"><NumInput value={secs} onChange={setSecs} integer unit="sec" label="Seconds" /></Field>
        </div>
        {swim && <Seg label="How to enter distance" value={useLaps ? 'laps' : 'metres'} onChange={(v) => setUseLaps(v === 'laps')} options={[['laps', 'Count laps'], ['metres', 'Enter metres']]} />}
        {swim && useLaps ? (
          <div className="row2">
            <Field label="Laps"><NumInput value={laps} onChange={setLaps} integer label="Number of laps" /></Field>
            <Field label="Pool length"><NumInput value={pool} onChange={setPool} integer unit="m" label="Pool length in metres" /></Field>
          </div>
        ) : (
          <Field label="Distance"><NumInput value={dist} onChange={setDist} unit={swim ? 'm' : 'km'} label={swim ? 'Distance in metres' : 'Distance in kilometres'} /></Field>
        )}
        {swim && (
          <>
            <Field label="Stroke"><select value={stroke} onChange={(e) => setStroke(e.target.value)}>{SWIM_STROKES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field group label="How hard was it?"><Seg label="How hard was it?" value={effort} onChange={setEffort} options={SWIM_EFFORT.map((e) => [e.id, e.label])} /></Field>
          </>
        )}
        {meters > 0 && seconds > 0 && <p className="totals">{swim ? `${fmt(meters)} m, ${swimPace(meters, seconds)} per 100 m` : `${fmtKm(meters)} km, ${runPace(meters, seconds)} per km`}</p>}
        <button className="btn primary" disabled={!ok} onClick={save}>Save {swim ? 'swim' : 'run'}</button>
      </div>
    </Sheet>
  );
};

const BG_LABEL = { photo: 'Photo', map: 'Map', plain: 'Colour', sticker: 'Sticker' };
const ShareCard = ({ activity, points, onClose }) => {
  const toast = useToast();
  const hasRoute = activity.sport !== 'swim' && points.length > 1;
  const [bg, setBg] = useState('plain');
  const [ratio, setRatio] = useState('post');
  const [mini, setMini] = useState(false);
  const [hideEnds, setHideEnds] = useState(true);
  const [photo, setPhoto] = useState(null);
  const [ready, setReady] = useState(null);
  const canvas = useRef(null);
  useEffect(() => {
    let gone = false;
    setReady(null);
    (async () => {
      const off = document.createElement('canvas');
      await renderCard(off, activity, points, { bg, ratio, mini, hideEnds, photo });
      if (gone) return;
      const c = canvas.current;
      c.width = off.width; c.height = off.height;
      const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(off, 0, 0);
      const blob = await cardBlob(off, bg === 'sticker');
      if (!gone) setReady(blob);
    })();
    return () => { gone = true; };
  }, [bg, ratio, mini, hideEnds, photo]);
  const addPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { full } = await fileToImages(f, { aiMax: 2000, aiQuality: 0.9 });
      const img = new Image();
      img.onload = () => { setPhoto(img); setBg('photo'); };
      img.src = full;
    } catch (err) { toast(err.message); }
  };
  const save = async () => {
    const name = `astra-${activity.sport}-${activity.date}.${bg === 'sticker' ? 'png' : 'jpg'}`;
    const res = await saveFile(ready, name);
    if (res !== 'cancelled') toast('Card ready');
  };
  const options = ['photo', ...(hasRoute ? ['map'] : []), 'plain', 'sticker'];
  return (
    <Sheet title="Share card" onClose={onClose}>
      <div className="stack">
        <div className={`cardpreview ${bg === 'sticker' ? 'checker' : ''} ${ratio}`}><canvas ref={canvas} aria-label="Preview of your share card" role="img" /></div>
        <div className="cardactions">
          <label className="btn primary filebtn"><Icon name="camera" size={18} /> Take photo<input type="file" accept="image/*" capture="environment" onChange={addPhoto} aria-label="Take a photo for your card" /></label>
          <label className="btn fill filebtn"><Icon name="plate" size={18} /> Gallery<input type="file" accept="image/*" onChange={addPhoto} aria-label="Choose a photo for your card" /></label>
        </div>
        <Field group label="Background"><Seg label="Background" value={bg} onChange={setBg} options={options.map((o) => [o, BG_LABEL[o]])} /></Field>
        {bg === 'photo' && !photo && <p className="muted small">Take or choose a photo to use it behind your stats.</p>}
        <Field group label="Size"><Seg label="Size" value={ratio} onChange={setRatio} options={[['post', 'Post'], ['story', 'Story']]} /></Field>
        {hasRoute && bg !== 'map' && <button className={`chip ${mini ? 'selected' : ''}`} aria-pressed={mini} onClick={() => setMini(!mini)}><Icon name="globe" size={16} /> Show map under the route</button>}
        {hasRoute && <button className={`chip ${hideEnds ? 'selected' : ''}`} aria-pressed={hideEnds} onClick={() => setHideEnds(!hideEnds)}><Icon name="target" size={16} /> Hide my start and finish</button>}
        {hasRoute && <p className="muted small">Hiding the first and last 200 m helps keep your home private when you share.</p>}
        <button className="btn primary huge" disabled={!ready} onClick={save}>{ready ? <><Icon name="download" size={18} /> Download or share</> : <><span className="spin" /> Making your card</>}</button>
        <p className="muted small center">On iPhone, choose Save Image, or pick an app to share to.</p>
      </div>
    </Sheet>
  );
};

const ActivityDetail = ({ id, onClose, openShare }) => {
  const toast = useToast();
  const a = useLiveQuery(() => db.activities.get(id), [id]);
  const route = useLiveQuery(() => db.routes.get(id), [id]);
  // Opened after this sheet mounts, so the card sits on top of it.
  const [sharing, setSharing] = useState(false);
  const opened = useRef(false);
  useEffect(() => { if (openShare && a && !opened.current) { opened.current = true; setSharing(true); } }, [a]);
  if (!a) return null;
  const pts = route?.points || [];
  const swim = a.sport === 'swim';
  const remove = async () => {
    if (!window.confirm('Delete this activity?')) return;
    await db.transaction('rw', db.activities, db.routes, async () => { await db.activities.delete(id); await db.routes.delete(id); });
    toast('Activity deleted'); onClose();
  };
  return (
    <Sheet title={`${swim ? 'Swim' : 'Run'}, ${fmtShort(a.date)}`} onClose={onClose}>
      <div className="stack">
        {pts.length > 1 && <LiveMap points={pts} height={240} />}
        <section className="numbers">
          <div><b><Kpi>{swim ? `${fmt(a.meters)} m` : `${fmtKm(a.meters)} km`}</Kpi></b><span>distance</span></div>
          <div><b>{fmtDuration(a.seconds)}</b><span>time</span></div>
          <div><b>{swim ? swimPace(a.meters, a.seconds) : runPace(a.meters, a.seconds)}</b><span>{swim ? 'pace per 100 m' : 'pace per km'}</span></div>
          <div><b>{fmt(a.kcal)}</b><span>kcal burned (estimate)</span></div>
        </section>
        {swim && <p className="muted small">{a.stroke}{a.laps ? `, ${a.laps} laps of a ${a.poolM} m pool` : ''}</p>}
        <button className="btn primary huge" onClick={() => setSharing(true)}><Icon name="camera" size={20} /> Make a share card</button>
        <button className="btn danger" onClick={remove}><Icon name="trash" size={18} /> Delete activity</button>
      </div>
      {sharing && <ShareCard activity={a} points={pts} onClose={() => setSharing(false)} />}
    </Sheet>
  );
};

const SPORT = {
  run: { word: 'run', title: 'Running', icon: 'bolt', tone: 'red' },
  swim: { word: 'swim', title: 'Swimming', icon: 'drop', tone: 'blue' },
};

const SportView = ({ sport, settings, intent, clearIntent }) => {
  const swim = sport === 'swim';
  const today = todayKey();
  const rows = useLiveQuery(() => db.activities.where('sport').equals(sport).toArray(), [sport], []);
  const allData = useLiveQuery(async () => {
    const [logs, days, workouts, activities] = await Promise.all([db.logs.toArray(), db.days.toArray(), db.workouts.toArray(), db.activities.toArray()]);
    return { logs, days, workouts, activities };
  }, [], null);
  const [session, setSession] = useState(null);
  const [manual, setManual] = useState(false);
  const [detail, setDetail] = useState(null);
  const done = rows.filter((a) => a.status === 'done').sort((a, b) => b.date.localeCompare(a.date) || b.endedAt - a.endedAt);
  const active = rows.find((a) => a.status !== 'done');
  const date = intent?.date || today;
  const streak = useMemo(() => {
    if (!allData) return { current: 0, best: 0 };
    const s = buildSummaries({ ...allData, goalHistory: settings.goalHistory });
    return computeStreaks(s, today, goalFor(settings.goalHistory, today).workouts)[sport];
  }, [allData, settings.goalHistory, sport]);
  const week = weekDays(today);
  const weekRows = done.filter((a) => a.date >= week[0] && a.date <= week[6]);
  const weekM = weekRows.reduce((s, a) => s + a.meters, 0);
  const weekKcal = weekRows.reduce((s, a) => s + (a.kcal || 0), 0);
  const startRun = async () => {
    if (active) { setSession(active.id); return; }
    const id = await db.activities.add({ date, sport: 'run', status: 'ready', meters: 0, seconds: 0, kcal: 0 });
    clearIntent?.();
    setSession(id);
  };
  return (
    <div className="page">
      <section className={`sporthero arthero ${sport}`}>
        {swim ? <SwimmerArt /> : <RunnerArt />}
        <div className="sporthero-top">
          <div className={`streakmini ${streak.current > 0 ? 'lit' : ''}`}><Icon name="flame" size={18} /><b>{streak.current}</b><span>day streak</span></div>
        </div>
        <h2>{swim ? 'Into the water' : active ? 'Finish what you started' : 'Run like you mean it'}</h2>
        <p>{swim ? 'Enter your time and laps after you swim. GPS can\'t track you in the water.' : 'GPS draws your route on the map and measures your distance.'}</p>
        {swim
          ? <button className="btn primary huge" onClick={() => setManual(true)}><Icon name="plus" /> Log a swim</button>
          : <button className="btn primary huge" onClick={startRun}><Icon name="bolt" /> {active ? 'Continue run' : 'Start run'}</button>}
        {!swim && <button className="linkbtn center" onClick={() => setManual(true)}>Ran without your phone? Add it yourself</button>}
      </section>

      <section className="numbers">
        <div><b><Kpi>{swim ? `${fmt(weekM)} m` : `${fmtKm(weekM)} km`}</Kpi></b><span>this week</span></div>
        <div><b>{fmt(weekKcal)}</b><span>kcal burned this week</span></div>
        <div><b>{weekRows.length}</b><span>{swim ? 'swims' : 'runs'} this week</span></div>
        <div><b>{streak.best}</b><span>best streak (days)</span></div>
      </section>

      <section className="meal">
        <div className="meal-head"><h2>Past {swim ? 'swims' : 'runs'}</h2></div>
        {done.length === 0 && <p className="muted">Your {swim ? 'swims' : 'runs'} will appear here. Open one to make a share card.</p>}
        {done.slice(0, 40).map((a) => (
          <button className="row" key={a.id} onClick={() => setDetail({ id: a.id })}>
            <span className="row-main"><span className="row-title">{swim ? `${fmt(a.meters)} m` : `${fmtKm(a.meters)} km`}</span><span className="row-sub">{friendlyDay(a.date)}, {fmtDuration(a.seconds)}</span></span>
            <span className="row-side"><b>{fmt(a.kcal)}</b> kcal<br />{swim ? `${swimPace(a.meters, a.seconds)} /100 m` : `${runPace(a.meters, a.seconds)} /km`}</span>
          </button>
        ))}
      </section>

      {session && <RunSession activityId={session} onClose={() => setSession(null)} onFinish={(id) => { setSession(null); setDetail({ id, share: true }); }} />}
      {manual && <ManualEntry sport={sport} initialDate={date} onClose={() => setManual(false)} onSaved={(id) => { setManual(false); clearIntent?.(); setDetail({ id, share: false }); }} />}
      {detail && <ActivityDetail id={detail.id} openShare={!!detail.share} onClose={() => setDetail(null)} />}
    </div>
  );
};

export default function Train({ settings, intent, clearIntent }) {
  const sports = settings.sports || ['gym'];
  const [view, setView] = useState(intent?.sport && sports.includes(intent.sport) ? intent.sport : sports[0]);
  const LABEL = { gym: 'Gym', run: 'Running', swim: 'Swimming' };
  useEffect(() => { if (!sports.includes(view)) setView(sports[0]); }, [sports.join()]);
  return (
    <>
      {sports.length > 1 && <div className="page trainbar"><Seg label="Sport" value={view} onChange={setView} options={sports.map((s) => [s, LABEL[s]])} /></div>}
      {view === 'gym' ? <Gym settings={settings} intent={intent} clearIntent={clearIntent} /> : <SportView key={view} sport={view} settings={settings} intent={intent} clearIntent={clearIntent} />}
    </>
  );
}
