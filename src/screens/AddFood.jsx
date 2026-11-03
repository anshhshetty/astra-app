import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, rememberFood } from '../lib/db.js';
import { searchBuiltin } from '../data/foods.js';
import { fromPer100, parseNum, round } from '../lib/nutrition.js';
import { searchOnline, lookupBarcode } from '../lib/off.js';
import { analysePhoto, lookupFood, parseMealText, verifyItems } from '../lib/gemini.js';
import { fileToImages, decodeBarcodeFromFile } from '../lib/images.js';
import { Field, Icon, NumInput, Notice, Sheet, useToast, fmt } from '../components/ui.jsx';
import { Sources } from './Today.jsx';
import { layoutTags } from '../lib/coach.js';

const SOURCE_LABEL = { builtin: 'Built-in list', off: 'Open Food Facts', ai: 'Google AI', custom: 'My food', photo: 'Photo AI', typed: 'Typed with AI' };

const logFood = async ({ food, grams, date, meal, thumb }) => {
  const foodId = await rememberFood(food);
  const totals = fromPer100(food.per100, grams);
  await db.transaction('rw', db.logs, db.thumbs, async () => {
    const id = await db.logs.add({
      date, meal, name: food.name, grams, per100: food.per100, ...totals, foodId,
      links: food.links || [], hasPhoto: !!thumb, createdAt: Date.now(), sourceLabel: SOURCE_LABEL[food.source] || '',
    });
    if (thumb) await db.thumbs.put({ logId: id, data: thumb });
  });
};

const FoodRow = ({ food, onPick }) => (
  <button className="row" onClick={() => onPick(food)}>
    <span className="row-main"><span className="row-title">{food.name}</span><span className="row-sub">{SOURCE_LABEL[food.source] || 'My food'}, per 100 g</span></span>
    <span className="row-side"><b>{fmt(food.per100.kcal)}</b> kcal<br />{round(food.per100.p, 1)} g protein</span>
  </button>
);

const Per100Fields = ({ v, set }) => (
  <div className="row4">
    {[['kcal', 'Calories', 'kcal'], ['p', 'Protein', 'g'], ['c', 'Carbs', 'g'], ['f', 'Fat', 'g']].map(([k, label, unit]) => (
      <Field key={k} label={label}><NumInput value={v[k]} onChange={(x) => set({ ...v, [k]: x })} unit={unit} label={`${label} per 100 grams`} /></Field>
    ))}
  </div>
);
const toStrings = (p) => ({ kcal: String(p.kcal), p: String(p.p), c: String(p.c), f: String(p.f) });
const toPer100 = (s) => ({ kcal: parseNum(s.kcal) || 0, p: parseNum(s.p) || 0, c: parseNum(s.c) || 0, f: parseNum(s.f) || 0 });

const FoodDetail = ({ food, date, meal, onBack, onDone }) => {
  const [grams, setGrams] = useState(food.servings?.[0] ? String(food.servings[0].grams) : '100');
  const [count, setCount] = useState(null);
  const [editing, setEditing] = useState(false);
  const [per, setPer] = useState(toStrings(food.per100));
  const per100 = toPer100(per);
  const g = parseNum(grams);
  const t = g > 0 ? fromPer100(per100, g) : null;
  const serving = (s) => { setGrams(String(s.grams)); setCount({ ...s, n: 1 }); };
  const bump = (d) => setCount((c) => { const n = Math.max(1, c.n + d); setGrams(String(round(c.grams * n, 1))); return { ...c, n }; });
  return (
    <Sheet title={food.name} back={onBack} onClose={onDone}>
      <div className="stack">
        <Field label="How much did you eat?"><NumInput value={grams} onChange={(v) => { setGrams(v); setCount(null); }} unit="g" label="Weight in grams" autoFocus /></Field>
        {food.servings?.length > 0 && (
          <div className="chips">
            {food.servings.map((s) => <button key={s.label} className="chip" onClick={() => serving(s)}>{s.label} ({s.grams} g)</button>)}
            {[50, 100, 200].map((x) => <button key={x} className="chip" onClick={() => { setGrams(String(x)); setCount(null); }}>{x} g</button>)}
          </div>
        )}
        {count && (
          <div className="stepper">
            <button className="iconbtn" aria-label="One less" onClick={() => bump(-1)}>−</button>
            <span>{count.n} × {count.label.replace(/^1\s/, '')}</span>
            <button className="iconbtn" aria-label="One more" onClick={() => bump(1)}>+</button>
          </div>
        )}
        <div className="result">
          <div><b>{t ? fmt(t.kcal) : '0'}</b><span>kcal</span></div>
          <div><b>{t ? t.p : 0}</b><span>g protein</span></div>
          <div><b>{t ? t.c : 0}</b><span>g carbs</span></div>
          <div><b>{t ? t.f : 0}</b><span>g fat</span></div>
        </div>
        <button className="linkbtn" onClick={() => setEditing(!editing)}>{editing ? 'Hide per-100 g values' : `Correct the values (${per100.kcal} kcal, ${per100.p} g protein per 100 g)`}</button>
        {editing && <Per100Fields v={per} set={setPer} />}
        {food.source === 'builtin' && <p className="muted small">Typical value. Home cooking varies with oil, so correct it if you know better. Your correction is remembered.</p>}
        {food.links?.length > 0 && <Sources links={food.links} />}
        <button className="btn primary" disabled={!(g > 0)} onClick={async () => { await logFood({ food: { ...food, per100 }, grams: g, date, meal }); onDone(`Added ${food.name} to ${meal}`); }}>Add to {meal}</button>
      </div>
    </Sheet>
  );
};

const Manual = ({ date, meal, onBack, onDone, initialName = '', barcode }) => {
  const [name, setName] = useState(initialName);
  const [per, setPer] = useState({ kcal: '', p: '', c: '', f: '' });
  const [grams, setGrams] = useState('100');
  const g = parseNum(grams);
  const per100 = toPer100(per);
  const ok = name.trim() && per.kcal !== '' && g > 0;
  return (
    <Sheet title="Add your own food" back={onBack} onClose={onDone}>
      <div className="stack">
        <Field label="Food name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mom's dal" /></Field>
        <p className="muted small">Enter the values per 100 g from the pack. They are saved for next time.</p>
        <Per100Fields v={per} set={setPer} />
        <Field label="How much did you eat?"><NumInput value={grams} onChange={setGrams} unit="g" label="Weight in grams" /></Field>
        {ok && <p className="totals"><strong>{fromPer100(per100, g).kcal}</strong> kcal, <strong>{fromPer100(per100, g).p}</strong> g protein</p>}
        <button className="btn primary" disabled={!ok} onClick={async () => { await logFood({ food: { name, per100, source: 'custom', servings: [], barcode }, grams: g, date, meal }); onDone(`Added ${name.trim()} to ${meal}`); }}>Add to {meal}</button>
      </div>
    </Sheet>
  );
};

const Quick = ({ date, meal, onBack, onDone }) => {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  return (
    <Sheet title="Quick add" back={onBack} onClose={onDone}>
      <div className="stack">
        <Field label="What was it?"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Office lunch" /></Field>
        <div className="row2">
          <Field label="Calories"><NumInput value={kcal} onChange={setKcal} unit="kcal" label="Calories" autoFocus /></Field>
          <Field label="Protein"><NumInput value={p} onChange={setP} unit="g" label="Protein" /></Field>
        </div>
        <button className="btn primary" disabled={!(parseNum(kcal) > 0)} onClick={async () => {
          await db.logs.add({ date, meal, name: name.trim() || 'Quick add', kcal: parseNum(kcal), p: parseNum(p) || 0, c: 0, f: 0, createdAt: Date.now(), sourceLabel: 'Quick add' });
          onDone(`Added to ${meal}`);
        }}>Add to {meal}</button>
      </div>
    </Sheet>
  );
};

const emptyItem = () => ({ name: '', per: { kcal: '', p: '', c: '', f: '' }, grams: '', estimatedGrams: null, confidence: 'low', note: '' });

// The food photo: a scan line while AI looks, then a label on each food it found.
const ScanPhoto = ({ src, scanning, items = [], calc = [] }) => {
  const [ratio, setRatio] = useState(1.33);
  const wide = ratio >= 1.15;
  return (
    <div className={`scanphoto ${scanning ? 'scanning' : ''}`} style={{ aspectRatio: String(ratio), ...(wide ? { width: '100%' } : { height: 310 }) }}>
      <img src={src} alt="Your food" onLoad={(e) => setRatio(e.target.naturalWidth / e.target.naturalHeight || 1.33)} />
      <i className="scancorners" />
      {scanning && <><i className="scangrid" /><i className="scanbeam" /></>}
      {!scanning && layoutTags(items).map(({ x, y }, i) => {
        const it = items[i];
        const c = calc[i];
        return (
          <span key={i} className={`scantag ${x > 56 ? 'flip' : ''}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${0.1 + i * 0.14}s` }}>
            <i />
            <span className="scantag-box"><b>{it.name || 'Food'}</b><em>{c ? `${c.kcal} kcal, ${c.p} g protein` : `${it.per.kcal} kcal per 100 g`}</em></span>
          </span>
        );
      })}
    </div>
  );
};

const AiItemCard = ({ it, i, up, onRemove, calc }) => (
  <div className="ai-item">
    <div className="ai-head">
      <input type="text" aria-label="Food name" value={it.name} onChange={(e) => up(i, { name: e.target.value })} placeholder="Food name" />
      <button className="iconbtn small" aria-label={`Remove ${it.name}`} onClick={onRemove}><Icon name="trash" size={18} /></button>
    </div>
    {it.note && <p className="muted small">{it.note}</p>}
    <Field label="Weight"><NumInput value={it.grams} onChange={(v) => up(i, { grams: v })} unit="g" label={`Weight of ${it.name} in grams`} /></Field>
    {it.estimatedGrams > 0 && String(it.estimatedGrams) !== it.grams && <button className="chip" onClick={() => up(i, { grams: String(it.estimatedGrams) })}>Use AI's guess: {it.estimatedGrams} g ({it.confidence} confidence)</button>}
    <details><summary>Per 100 g: {it.per.kcal} kcal, {it.per.p} g protein</summary><Per100Fields v={it.per} set={(per) => up(i, { per })} /></details>
    {calc && <p className="totals"><strong>{calc.kcal}</strong> kcal, <strong>{calc.p}</strong> g protein</p>}
  </div>
);

const Photo = ({ settings, date, meal, images, onBack, onDone, goSettings }) => {
  const [state, setState] = useState(settings.geminiKey ? 'loading' : 'nokey');
  const [err, setErr] = useState('');
  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [hint, setHint] = useState('');
  const [checkState, setCheckState] = useState('idle');
  const [checkMsg, setCheckMsg] = useState('');
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (state !== 'loading') return undefined;
    setSeconds(0);
    const t = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  const run = async () => {
    setState('loading'); setErr('');
    try {
      const r = await analysePhoto(settings, images.full, hint);
      setItems((r.items.length ? r.items : []).map((it) => ({ ...it, per: toStrings(it.per100), grams: '' })));
      setLinks([]); setCheckState('idle'); setCheckMsg('');
      setState(r.items.length ? 'done' : 'empty');
    } catch (e) { setErr(e.message); setState('error'); }
  };
  useEffect(() => { if (settings.geminiKey) run(); }, []);
  const checkOnline = async () => {
    setCheckState('loading'); setCheckMsg('');
    try {
      const r = await verifyItems(settings, items.map((it) => it.name));
      setItems((xs) => xs.map((x, i) => (r.items[i] ? { ...x, per: toStrings(r.items[i].per100), note: r.items[i].note || x.note } : x)));
      setLinks(r.sources);
      setCheckState('done');
    } catch (e) { setCheckMsg(e.message); setCheckState('idle'); }
  };
  const up = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const calc = items.map((it) => (parseNum(it.grams) > 0 ? fromPer100(toPer100(it.per), parseNum(it.grams)) : null));
  const missing = items.filter((it, i) => !it.name.trim() || !calc[i]);
  const total = calc.reduce((a, c) => ({ kcal: a.kcal + (c?.kcal || 0), p: a.p + (c?.p || 0) }), { kcal: 0, p: 0 });
  const save = async () => {
    for (const it of items) {
      await logFood({ food: { name: it.name.trim(), per100: toPer100(it.per), source: 'photo', servings: [], links }, grams: parseNum(it.grams), date, meal, thumb: images.thumb });
    }
    onDone(`Added ${items.length} item${items.length > 1 ? 's' : ''} to ${meal}`);
  };
  return (
    <Sheet title="Food photo" back={onBack} onClose={onDone}>
      <div className="stack">
        <ScanPhoto src={images.full} scanning={state === 'loading'} items={state === 'done' ? items : []} calc={calc} />
        {state === 'nokey' && (
          <>
            <Notice kind="warn">Photo recognition needs your free Google AI key. Add it once in More, under Google AI.</Notice>
            <button className="btn primary" onClick={() => { onDone(); goSettings('more'); }}>Go to More</button>
          </>
        )}
        {state === 'loading' && (
          <>
            <div className="loading" role="status"><span className="spin" /> Astra AI is reading your plate ({seconds} s)</div>
            {seconds >= 12 && (
              <>
                <p className="muted small">Free Google AI can be slow at busy times. It stops by itself after 40 seconds.</p>
                <button className="btn" onClick={onBack}>Stop and search by name instead</button>
              </>
            )}
          </>
        )}
        {(state === 'error' || state === 'empty') && (
          <>
            <Notice kind="error">{state === 'error' ? err : "I couldn't find food in this photo. Add a note or take it closer."}</Notice>
            <Field label="Add a note (optional)"><input type="text" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Paneer bhurji with 2 tsp oil" /></Field>
            <button className="btn primary" onClick={run}>Try again</button>
          </>
        )}
        {state === 'done' && (
          <>
            <p className="muted small">AI estimate{checkState === 'done' ? ', checked with Google Search' : ''}. Weigh each item, and correct anything that looks wrong. Oil and ghee can't be seen in a photo.</p>
            {items.map((it, i) => <AiItemCard key={i} it={it} i={i} up={up} calc={calc[i]} onRemove={() => setItems(items.filter((_, j) => j !== i))} />)}
            <button className="linkbtn" onClick={() => setItems([...items, emptyItem()])}>Add another item</button>
            {checkState !== 'done' && items.length > 0 && (
              <button className="btn" disabled={checkState === 'loading'} onClick={checkOnline}>
                {checkState === 'loading' ? <><span className="spin" /> Checking on Google</> : <><Icon name="globe" size={18} /> Check values on Google</>}
              </button>
            )}
            {checkMsg && <Notice kind="error">{checkMsg}</Notice>}
            {links.length > 0 && <Sources links={links} />}
            <div className="sticky-save">
              {items.length > 0 && <p className="totals">Total <strong>{fmt(total.kcal)}</strong> kcal, <strong>{round(total.p, 1)}</strong> g protein</p>}
              <button className="btn primary" disabled={!items.length || missing.length > 0} onClick={save}>
                {missing.length ? `Enter the weight for ${missing[0].name || 'each item'}` : `Add to ${meal}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};

// "2 roti, dal and 200 g paneer" becomes reviewable food items.
const TextLog = ({ settings, date, meal, said, onBack, onDone, goSettings }) => {
  const [state, setState] = useState(settings.geminiKey ? 'loading' : 'nokey');
  const [err, setErr] = useState('');
  const [items, setItems] = useState([]);
  const run = async () => {
    setState('loading'); setErr('');
    try {
      const r = await parseMealText(settings, said);
      setItems(r.items.map((it) => ({ ...it, per: toStrings(it.per100), grams: it.estimatedGrams ? String(it.estimatedGrams) : '' })));
      setState(r.items.length ? 'done' : 'empty');
    } catch (e) { setErr(e.message); setState('error'); }
  };
  useEffect(() => { if (settings.geminiKey) run(); }, []);
  const up = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const calc = items.map((it) => (parseNum(it.grams) > 0 ? fromPer100(toPer100(it.per), parseNum(it.grams)) : null));
  const missing = items.filter((it, i) => !it.name.trim() || !calc[i]);
  const total = calc.reduce((a, c) => ({ kcal: a.kcal + (c?.kcal || 0), p: a.p + (c?.p || 0) }), { kcal: 0, p: 0 });
  const save = async () => {
    for (const it of items) await logFood({ food: { name: it.name.trim(), per100: toPer100(it.per), source: 'typed', servings: [] }, grams: parseNum(it.grams), date, meal });
    onDone(`Added ${items.length} item${items.length > 1 ? 's' : ''} to ${meal}`);
  };
  return (
    <Sheet title="Check your food" back={onBack} onClose={onDone}>
      <div className="stack">
        <div className="saidline"><Icon name="type" size={18} /><span>{said}</span></div>
        {state === 'nokey' && (
          <>
            <Notice kind="warn">Typing your food needs your free Google AI key. Add it once in More, under Google AI.</Notice>
            <button className="btn primary" onClick={() => { onDone(); goSettings('more', 'ai'); }}>Add my key</button>
          </>
        )}
        {state === 'loading' && <div className="loading" role="status"><span className="spin" /> Astra AI is working out your meal</div>}
        {(state === 'error' || state === 'empty') && (
          <>
            <Notice kind="error">{state === 'error' ? err : "That didn't look like food. Go back and try describing what you ate."}</Notice>
            {state === 'error' && <button className="btn primary" onClick={run}>Try again</button>}
          </>
        )}
        {state === 'done' && (
          <>
            <p className="muted small">AI estimates. Check the weights and correct anything that looks wrong.</p>
            {items.map((it, i) => <AiItemCard key={i} it={it} i={i} up={up} calc={calc[i]} onRemove={() => setItems(items.filter((_, j) => j !== i))} />)}
            <div className="sticky-save">
              {items.length > 0 && <p className="totals">Total <strong>{fmt(total.kcal)}</strong> kcal, <strong>{round(total.p, 1)}</strong> g protein</p>}
              <button className="btn primary" disabled={!items.length || missing.length > 0} onClick={save}>
                {missing.length ? `Enter the weight for ${missing[0].name || 'each item'}` : `Add to ${meal}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};

const Barcode = ({ date, meal, onBack, onDone, pick }) => {
  const [code, setCode] = useState('');
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState('');
  const look = async (c) => {
    setCode(c); setState('loading'); setMsg('');
    try {
      const own = await db.foods.where('barcode').equals(c).first();
      if (own) { pick(own); return; }
      const f = await lookupBarcode(c);
      if (f) pick(f); else setState('missing');
    } catch { setMsg('Could not reach the online food list. Check your internet and try again.'); setState('idle'); }
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setState('loading'); setMsg('');
    try { await look(await decodeBarcodeFromFile(file)); }
    catch { setMsg("I couldn't read a barcode in that photo. Hold the phone closer with the bars flat and sharp, or type the number."); setState('idle'); }
  };
  if (state === 'missing') return <Manual date={date} meal={meal} onBack={() => setState('idle')} onDone={onDone} barcode={code} />;
  return (
    <Sheet title="Scan barcode" back={onBack} onClose={onDone}>
      <div className="stack">
        <label className="btn primary filebtn"><Icon name="camera" /> Photograph the barcode
          <input type="file" accept="image/*" capture="environment" onChange={onFile} />
        </label>
        {msg && <Notice kind="error">{msg}</Notice>}
        {state === 'loading' && <div className="loading" role="status"><span className="spin" /> Looking it up</div>}
        <Field label="Or type the number"><NumInput value={code} onChange={setCode} integer label="Barcode number" placeholder="8901262010016" /></Field>
        <button className="btn" disabled={code.length < 6 || state === 'loading'} onClick={() => look(code)}>Look up</button>
      </div>
    </Sheet>
  );
};

export default function AddFood({ date, meal: initialMeal, settings, onClose, goTo, initialImages = null, initialView = 'home', focusType = false }) {
  const toast = useToast();
  const [meal, setMeal] = useState(initialMeal);
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [view, setView] = useState(initialImages ? 'photo' : initialView);
  const [food, setFood] = useState(null);
  const [images, setImages] = useState(initialImages);
  const [online, setOnline] = useState({ state: 'idle', rows: [], msg: '' });
  const [ai, setAi] = useState({ state: 'idle', rows: [], msg: '' });
  const qId = useRef(0);
  const recent = useLiveQuery(() => db.foods.orderBy('lastUsed').reverse().limit(25).toArray(), [], []);
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const mine = words.length ? recent.filter((f) => words.every((w) => f.nameLower.includes(w))) : recent;
  const myNames = new Set(recent.map((f) => f.nameLower));
  const builtin = searchBuiltin(q).filter((f) => !myNames.has(f.name.toLowerCase())).slice(0, 25);

  useEffect(() => { qId.current++; setOnline({ state: 'idle', rows: [], msg: '' }); setAi({ state: 'idle', rows: [], msg: '' }); }, [q]);

  const done = (msg) => { if (typeof msg === 'string') toast(msg); onClose(); };
  const pick = (f) => { setFood(f); setView('detail'); };
  const onPhoto = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { setImages(await fileToImages(file)); setView('photo'); } catch (err) { toast(err.message); }
  };
  const searchOff = async () => {
    const id = qId.current; setOnline({ state: 'loading', rows: [], msg: '' });
    try { const rows = await searchOnline(q.trim()); if (id === qId.current) setOnline({ state: 'done', rows, msg: rows.length ? '' : `No packaged foods found for "${q.trim()}".` }); }
    catch { if (id === qId.current) setOnline({ state: 'done', rows: [], msg: 'Could not reach the online food list. Check your internet and try again.' }); }
  };
  const searchAi = async () => {
    if (!settings.geminiKey) { setAi({ state: 'done', rows: [], msg: 'Add your free Google AI key in More to search this way.' }); return; }
    const id = qId.current; setAi({ state: 'loading', rows: [], msg: '' });
    try {
      const r = await lookupFood(settings, q.trim());
      if (id !== qId.current) return;
      const rows = r.items.map((it) => ({ name: it.name, per100: it.per100, source: 'ai', links: r.sources, servings: it.estimatedGrams ? [{ label: '1 serving', grams: it.estimatedGrams }] : [] }));
      setAi({ state: 'done', rows, msg: rows.length ? '' : 'Google AI found no values for this.' });
    } catch (e) { if (id === qId.current) setAi({ state: 'done', rows: [], msg: e.message }); }
  };

  if (view === 'detail') return <FoodDetail food={food} date={date} meal={meal} onBack={() => setView('home')} onDone={done} />;
  if (view === 'manual') return <Manual date={date} meal={meal} initialName={q} onBack={() => setView('home')} onDone={done} />;
  if (view === 'quick') return <Quick date={date} meal={meal} onBack={() => setView('home')} onDone={done} />;
  if (view === 'barcode') return <Barcode date={date} meal={meal} onBack={() => setView('home')} onDone={done} pick={pick} />;
  if (view === 'text') return <TextLog settings={settings} date={date} meal={meal} said={typed.trim()} onBack={() => setView('home')} onDone={done} goSettings={goTo} />;
  if (view === 'photo') return <Photo settings={settings} date={date} meal={meal} images={images} onBack={() => setView('home')} onDone={done} goSettings={goTo} />;

  return (
    <Sheet title="Add food" onClose={onClose}>
      <div className="stack">
        <p className="muted small">Which meal is this for?</p>
        <div className="chips" role="group" aria-label="Meal">
          {settings.meals.map((m) => <button key={m} className={`chip ${m === meal ? 'selected' : ''}`} aria-pressed={m === meal} onClick={() => setMeal(m)}>{m}</button>)}
        </div>
        <form className="typelog" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) setView('text'); }}>
          <label htmlFor="typelog-input"><Icon name="spark" size={16} /> Just type what you ate</label>
          <div className="typelog-row">
            <input id="typelog-input" type="text" autoFocus={focusType} enterKeyHint="go" maxLength={400} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="2 roti, dal and 200 g paneer" />
            <button type="submit" className="sendbtn" aria-label="Work out this meal" disabled={!typed.trim()}><Icon name="send" size={20} /></button>
          </div>
          <span className="muted small">Or tap the mic on your iPhone keyboard and say it.</span>
        </form>
        <div className="methods">
          <label className="method"><Icon name="camera" /><span>Photo</span><input type="file" accept="image/*" capture="environment" onChange={onPhoto} aria-label="Take a food photo" /></label>
          <label className="method"><Icon name="plate" /><span>Gallery</span><input type="file" accept="image/*" onChange={onPhoto} aria-label="Choose a food photo" /></label>
          <button className="method" onClick={() => setView('barcode')}><Icon name="scan" /><span>Barcode</span></button>
          <button className="method" onClick={() => setView('quick')}><Icon name="bolt" /><span>Quick add</span></button>
        </div>
        <div className="searchbox"><Icon name="search" size={20} /><input type="search" aria-label="Search foods" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search one food: dal, paneer, whey…" /></div>

        {words.length > 0 && (
          <div className="chips">
            <button className="chip strong" disabled={ai.state === 'loading'} onClick={searchAi}><Icon name="globe" size={18} /> Search Google with AI</button>
            <button className="chip" disabled={online.state === 'loading'} onClick={searchOff}><Icon name="search" size={18} /> Packaged foods</button>
          </div>
        )}
        {ai.state === 'loading' && <div className="loading" role="status"><span className="spin" /> Searching Google for nutrition values</div>}
        {ai.msg && <Notice kind="error">{ai.msg}</Notice>}
        {ai.rows.length > 0 && <section><h3 className="listhead">From Google, via AI</h3>{ai.rows.map((f, i) => <FoodRow key={i} food={f} onPick={pick} />)}</section>}
        {online.state === 'loading' && <div className="loading" role="status"><span className="spin" /> Searching packaged foods</div>}
        {online.msg && <Notice kind="error">{online.msg}</Notice>}
        {online.rows.length > 0 && <section><h3 className="listhead">Packaged foods</h3>{online.rows.map((f, i) => <FoodRow key={i} food={f} onPick={pick} />)}</section>}

        {mine.length > 0 && <section><h3 className="listhead">{words.length ? 'My foods' : 'Recent'}</h3>{mine.map((f) => <FoodRow key={f.id} food={f} onPick={pick} />)}</section>}
        {builtin.length > 0 && <section><h3 className="listhead">Common foods</h3>{builtin.map((f) => <FoodRow key={f.key} food={f} onPick={pick} />)}</section>}
        {words.length > 0 && !mine.length && !builtin.length && ai.state === 'idle' && online.state === 'idle' && <p className="muted">Not in your list. Search online above, or add it yourself.</p>}
        <button className="btn" onClick={() => setView('manual')}><Icon name="pen" size={18} /> Add your own food</button>
      </div>
    </Sheet>
  );
}
