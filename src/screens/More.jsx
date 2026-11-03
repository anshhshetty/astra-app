import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DATA_TABLES, saveSettings, setAvatar, setGoal, setHeroPicture, useAvatar, useHeroPicture } from '../lib/db.js';
import { fileToImages } from '../lib/images.js';
import { addDays, fmtMonth, fmtShort, monthDays, todayKey, weekDays } from '../lib/dates.js';
import { goalFor } from '../lib/stats.js';
import { suggestTargets, parseNum, round } from '../lib/nutrition.js';
import { testKey } from '../lib/gemini.js';
import { buildRows, loadAll, makeBackup, makeCsv, makePdf, makeReminderIcs, makeXlsx, markBackedUp, restoreBackup, saveFile } from '../lib/exporters.js';
import { Field, Icon, NamePrompt, NumInput, Notice, PhotoPicker, Seg, Sheet, SportsPrompt, useToast } from '../components/ui.jsx';
import { ProfileForm, TargetsForm, isInstalled, isIos } from './Onboarding.jsx';

const Row = ({ icon, title, sub, onClick, tone = 'blue' }) => (
  <button className="row" onClick={onClick}>
    <span className={`row-icon tile ${tone}`}><Icon name={icon} size={20} /></span>
    <span className="row-main"><span className="row-title">{title}</span>{sub && <span className="row-sub">{sub}</span>}</span>
    <Icon name="right" size={18} />
  </button>
);

const GoalsSheet = ({ settings, onClose }) => {
  const toast = useToast();
  const today = todayKey();
  const cur = goalFor(settings.goalHistory, today);
  const [mode, setMode] = useState('goals');
  const [suggest, setSuggest] = useState(null);
  const { from, ...initial } = cur;
  return (
    <Sheet title="Goals" onClose={onClose}>
      <div className="stack">
        <Seg label="Goals view" value={mode} onChange={setMode} options={[['goals', 'My targets'], ['calc', 'Recalculate']]} />
        {mode === 'goals' && <>
          <TargetsForm key={JSON.stringify(suggest || initial)} initial={suggest || initial} submitLabel="Save targets" onSubmit={async (g) => { await setGoal(g, today); toast('Targets saved. Past days keep their old targets.'); onClose(); }} />
        </>}
        {mode === 'calc' && <ProfileForm initial={settings.profile} submitLabel="Suggest targets" onSubmit={async (p) => {
          await saveSettings({ profile: p });
          setSuggest({ ...suggestTargets(p), water: cur.water, workouts: cur.workouts });
          setMode('goals');
        }} />}
      </div>
    </Sheet>
  );
};

const AiSheet = ({ settings, onClose }) => {
  const toast = useToast();
  const [key, setKey] = useState(settings.geminiKey);
  const [state, setState] = useState('idle');
  const [msg, setMsg] = useState('');
  const test = async () => {
    setState('testing'); setMsg('');
    try {
      const model = await testKey(key.trim());
      await saveSettings({ geminiKey: key.trim(), lastGoodModel: model });
      setState('ok'); setMsg(`Key works. Using ${model}.`);
    } catch (e) { setState('bad'); setMsg(e.message); }
  };
  return (
    <Sheet title="Google AI" onClose={onClose}>
      <div className="stack">
        <p>Photo recognition and online search use your own free Google key. It stays on this phone and is never put in your backup or export files.</p>
        <ol className="steps">
          <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> and sign in.</li>
          <li>Tap Create API key, then copy it.</li>
          <li>Paste it below and tap Test and save.</li>
        </ol>
        <Notice kind="warn">To keep this free, don't turn on billing for this Google project.</Notice>
        <Field label="API key"><input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your key" /></Field>
        <button className="btn primary" disabled={!key.trim() || state === 'testing'} onClick={test}>{state === 'testing' ? 'Testing…' : 'Test and save'}</button>
        {msg && <Notice kind={state === 'ok' ? 'good' : 'error'}>{msg}</Notice>}
        {settings.geminiKey && <button className="btn danger" onClick={async () => { await saveSettings({ geminiKey: '', lastGoodModel: '' }); setKey(''); toast('Key removed'); }}>Remove key</button>}
        <p className="muted small">Food photos and searches go to Google to get an answer. On the free tier Google may use them to improve its products, so photograph only your food.</p>
      </div>
    </Sheet>
  );
};

const DownloadSheet = ({ onClose, settings }) => {
  const toast = useToast();
  const today = todayKey();
  const week = weekDays(today);
  const month = monthDays(today);
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [ready, setReady] = useState(null);
  const [busy, setBusy] = useState('');
  const span = () => {
    if (range === 'week') return [week[0], week[6], `Week of ${fmtShort(week[0])}`];
    if (range === 'month') return [month[0], month[month.length - 1], fmtMonth(today)];
    return [from, to, `${fmtShort(from)} to ${fmtShort(to)}`];
  };
  const build = async (kind) => {
    setBusy(kind); setReady(null);
    try {
      const [a, b, title] = span();
      if (a > b) throw new Error('The start date is after the end date.');
      const stamp = `${a}_to_${b}`;
      let blob; let name;
      if (kind === 'backup') { blob = await makeBackup(); name = `astra-backup-${today}.json`; }
      else {
        const all = await loadAll();
        const rows = buildRows(all, a, b);
        if (kind === 'xlsx') { blob = await makeXlsx(rows); name = `astra-${stamp}.xlsx`; }
        if (kind === 'pdf') { blob = await makePdf(all, a, b, title); name = `astra-report-${stamp}.pdf`; }
        if (kind.startsWith('csv')) { const key = kind.split('-')[1]; blob = makeCsv(rows, key); name = `astra-${key}-${stamp}.csv`; }
      }
      setReady({ blob, name, kind });
    } catch (e) { toast(e.message || 'Could not create the file.'); }
    setBusy('');
  };
  const save = async () => {
    const res = await saveFile(ready.blob, ready.name);
    if (res === 'cancelled') return;
    if (ready.kind === 'backup') await markBackedUp();
    toast('File ready');
  };
  useEffect(() => setReady(null), [range, from, to]);
  return (
    <Sheet title="Downloads" onClose={onClose}>
      <div className="stack">
        <Field group label="Period"><Seg label="Period" value={range} onChange={setRange} options={[['week', 'This week'], ['month', 'This month'], ['custom', 'Custom']]} /></Field>
        {range === 'custom' && <div className="row2">
          <Field label="From"><input type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></Field>
        </div>}
        <button className="row" disabled={!!busy} onClick={() => build('xlsx')}><span className="row-main"><span className="row-title">Excel workbook</span><span className="row-sub">Daily summary, food, workouts, runs, swims, body</span></span>{busy === 'xlsx' ? <span className="spin" /> : <Icon name="download" />}</button>
        <button className="row" disabled={!!busy} onClick={() => build('pdf')}><span className="row-main"><span className="row-title">PDF report</span><span className="row-sub">Goals, streaks and a day-by-day table</span></span>{busy === 'pdf' ? <span className="spin" /> : <Icon name="download" />}</button>
        <div className="chips">
          {[['daily', 'Daily CSV'], ['food', 'Food CSV'], ['sets', 'Workout CSV'], ['activities', 'Run and swim CSV'], ['body', 'Body CSV']].map(([k, label]) => <button key={k} className="chip" disabled={!!busy} onClick={() => build(`csv-${k}`)}>{label}</button>)}
        </div>
        <button className="row" disabled={!!busy} onClick={() => build('backup')}><span className="row-main"><span className="row-title">Full backup</span><span className="row-sub">Everything, including photos. All dates. Use it to restore.</span></span>{busy === 'backup' ? <span className="spin" /> : <Icon name="download" />}</button>
        {ready && (
          <div className="ready" role="status">
            <p><strong>{ready.name}</strong><br /><span className="muted small">{round(ready.blob.size / 1024)} KB</span></p>
            <button className="btn primary" onClick={save}><Icon name="download" size={18} /> Save or share file</button>
            <p className="muted small">On iPhone, choose Save to Files in the share menu.</p>
          </div>
        )}
        {settings.lastBackup && <p className="muted small">Last backup: {new Date(settings.lastBackup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
      </div>
    </Sheet>
  );
};

const FoodsSheet = ({ onClose }) => {
  const toast = useToast();
  const foods = useLiveQuery(() => db.foods.orderBy('nameLower').toArray(), [], []);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const rows = foods.filter((f) => f.nameLower.includes(q.toLowerCase().trim()));
  return (
    <Sheet title="My foods" onClose={onClose}>
      <div className="stack">
        <div className="searchbox"><Icon name="search" size={20} /><input type="search" aria-label="Search my foods" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my foods" /></div>
        {foods.length === 0 && <p className="muted">Foods you log are saved here, so they're one tap away next time.</p>}
        {rows.map((f) => <button key={f.id} className="row" onClick={() => setEdit({ ...f, per: { kcal: String(f.per100.kcal), p: String(f.per100.p), c: String(f.per100.c), f: String(f.per100.f) } })}><span className="row-main"><span className="row-title">{f.name}</span><span className="row-sub">{f.per100.kcal} kcal, {f.per100.p} g protein per 100 g</span></span></button>)}
      </div>
      {edit && (
        <Sheet title={edit.name} onClose={() => setEdit(null)}>
          <div className="stack">
            <Field label="Food name"><input type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="row4">{[['kcal', 'Calories', 'kcal'], ['p', 'Protein', 'g'], ['c', 'Carbs', 'g'], ['f', 'Fat', 'g']].map(([k, label, unit]) => <Field key={k} label={label}><NumInput value={edit.per[k]} onChange={(v) => setEdit({ ...edit, per: { ...edit.per, [k]: v } })} unit={unit} label={`${label} per 100 grams`} /></Field>)}</div>
            <p className="muted small">Per 100 g. Changes apply to future logs, not to days already logged.</p>
            <button className="btn primary" disabled={!edit.name.trim()} onClick={async () => {
              await db.foods.update(edit.id, { name: edit.name.trim(), nameLower: edit.name.trim().toLowerCase(), per100: { kcal: parseNum(edit.per.kcal) || 0, p: parseNum(edit.per.p) || 0, c: parseNum(edit.per.c) || 0, f: parseNum(edit.per.f) || 0 } });
              setEdit(null); toast('Food saved');
            }}>Save food</button>
            <button className="btn danger" onClick={async () => { await db.foods.delete(edit.id); setEdit(null); toast('Removed from My foods'); }}>Remove from My foods</button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
};

const ReminderSheet = ({ onClose }) => {
  const toast = useToast();
  const [t, setT] = useState({ b: '09:00', l: '13:30', d: '20:30', g: '18:00' });
  const make = async () => {
    const blob = makeReminderIcs([
      { time: t.b, title: 'Log your breakfast' }, { time: t.l, title: 'Log your lunch' },
      { time: t.g, title: 'Gym time' }, { time: t.d, title: 'Log your dinner and keep your streak' },
    ]);
    await saveFile(blob, 'astra-reminders.ics');
    toast('Open the file to add the reminders to Calendar');
  };
  return (
    <Sheet title="Daily reminders" onClose={onClose}>
      <div className="stack">
        <p>This creates a free Calendar file with daily alerts. Open it on your iPhone to add them to Calendar.</p>
        <div className="row2">
          {[['b', 'Breakfast'], ['l', 'Lunch'], ['g', 'Gym'], ['d', 'Dinner']].map(([k, label]) => <Field key={k} label={label}><input type="time" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} /></Field>)}
        </div>
        <button className="btn primary" onClick={make}><Icon name="bell" size={18} /> Create Calendar file</button>
      </div>
    </Sheet>
  );
};

const DataSheet = ({ usage, persisted, settings, onBackup, onClose }) => (
  <Sheet title="Where is my data?" onClose={onClose}>
    <div className="stack">
      <section className="datahero">
        <div className="tile green big"><Icon name="phone" size={30} /></div>
        <h3>On this iPhone</h3>
        <p>Your food, workouts, streaks and photos are saved inside this app on your phone{usage?.usage ? `, using ${round(usage.usage / 1048576, 1)} MB` : ''}. They are not on any server.</p>
      </section>
      <section>
        <h3 className="listhead">How it works</h3>
        <div className="row static"><span className="row-main"><span className="row-title">No backend or online database</span><span className="row-sub">Cloudflare only delivers the app's files. It never receives your data.</span></span></div>
        <div className="row static"><span className="row-main"><span className="row-title">Closing the app is safe</span><span className="row-sub">So is restarting your phone or going offline.</span></span></div>
        <div className="row static"><span className="row-main"><span className="row-title">What goes online</span><span className="row-sub">Food photos, typed meals, AI searches and Astra Coach chats go to Google, along with the food, goals, profile and training details the coach needs. Your name, photos and routes aren't sent to the coach. Packaged-food searches and barcodes go to Open Food Facts. Map images come from OpenStreetMap, which sees the map area you're viewing. Your saved routes and everything else stay on your phone.</span></span></div>
      </section>
      <section>
        <h3 className="listhead">How you could lose it</h3>
        <div className="row static"><span className="row-main"><span className="row-title">Deleting the app icon</span><span className="row-sub">Or clearing Safari's website data.</span></span></div>
        <div className="row static"><span className="row-main"><span className="row-title">Changing your iPhone</span><span className="row-sub">It doesn't move by itself. Restore from your backup file.</span></span></div>
        {persisted === false && <div className="row static"><span className="row-main"><span className="row-title">Very low iPhone storage</span><span className="row-sub">iPhone may clear website data if it runs out of space.</span></span></div>}
      </section>
      <button className="btn primary" onClick={onBackup}><Icon name="download" size={18} /> Save a backup now</button>
      {settings.lastBackup && <p className="muted small">Last backup: {new Date(settings.lastBackup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
    </div>
  </Sheet>
);

export default function More({ settings, initialOpen = null, openCoach, openPlan }) {
  const toast = useToast();
  const [open, setOpen] = useState(initialOpen);
  const [usage, setUsage] = useState(null);
  const [persisted, setPersisted] = useState(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then(setUsage).catch(() => {});
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);
  const picture = useHeroPicture();
  const avatar = useAvatar();
  const pickPicture = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { const { large } = await fileToImages(f); await setHeroPicture(large); toast('Picture set on Today'); } catch (err) { toast(err.message); }
  };
  const onRestore = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!window.confirm('Restore this backup? It replaces everything now in the app.')) return;
    try { await restoreBackup(await f.text()); toast('Backup restored'); } catch (err) { toast(err.message); }
  };
  const erase = async () => {
    if (!window.confirm('Erase all your food, gym and body data from this phone? This cannot be undone.')) return;
    await db.transaction('rw', DATA_TABLES.map((t) => db[t]), async () => { for (const t of DATA_TABLES) await db[t].clear(); });
    toast('All data erased');
  };
  const g = goalFor(settings.goalHistory, todayKey());
  return (
    <div className="page">
      <section className="profilecard">
        <PhotoPicker src={avatar} name={settings.displayName} size={92} onPick={async (d) => { await setAvatar(d); toast('Profile photo saved'); }} />
        <div className="profile-main">
          <h1 className={`bigname ${(settings.displayName || '').length <= 9 ? 'lg' : 'md'}`}>{settings.displayName || 'Your name'}</h1>
          <div className="chips">
            <button className="chip" onClick={() => setOpen('name')}><Icon name="pen" size={15} /> Edit name</button>
            {avatar && <button className="chip" onClick={() => setAvatar(null)}>Remove photo</button>}
          </div>
        </div>
      </section>
      {!isInstalled() && isIos() && <Notice kind="warn">Add this app to your Home Screen: Share, then Add to Home Screen. Data in a Safari tab stays separate.</Notice>}
      <section>
        <Row icon="spark" tone="yellow" title="Astra Coach" sub="Ask about food, training and recovery" onClick={openCoach} />
        <Row icon="list" tone="green" title="Diet plan" sub="Daily meals you can save as PDF or Excel" onClick={openPlan} />
        <Row icon="bolt" tone="red" title="My sports" sub={(settings.sports || ['gym']).map((x) => ({ gym: 'Gym', run: 'Running', swim: 'Swimming' }[x])).join(', ')} onClick={() => setOpen('sports')} />
        <Row icon="target" tone="red" title="Goals" sub={`${g.kcal} kcal, ${g.protein} g protein, ${g.workouts} gym days a week`} onClick={() => setOpen('goals')} />
        <Row icon="key" tone="purple" title="Google AI" sub={settings.geminiKey ? 'Key added. Photo and online search are on.' : 'Add your free key to turn on photo recognition'} onClick={() => setOpen('ai')} />
        <Row icon="plate" tone="green" title="My foods" sub="Edit or remove saved foods" onClick={() => setOpen('foods')} />
        <Row icon="bell" tone="yellow" title="Daily reminders" sub="Add free alerts to your Calendar" onClick={() => setOpen('remind')} />
      </section>
      <section>
        <h3 className="listhead">Your data</h3>
        <Row icon="phone" tone="green" title="Where is my data?" sub="On this iPhone. See exactly how it works." onClick={() => setOpen('data')} />
        <Row icon="download" title="Downloads and backup" sub="Excel, PDF, CSV and full backup" onClick={() => setOpen('dl')} />
        <label className="row filerow"><span className="row-icon tile yellow"><Icon name="upload" size={20} /></span><span className="row-main"><span className="row-title">Restore a backup</span><span className="row-sub">Replaces everything in the app</span></span><input type="file" accept=".json,application/json" onChange={onRestore} aria-label="Restore a backup file" /></label>
      </section>
      <section>
        <h3 className="listhead">Appearance</h3>
        <div className="piccard pad">
          {picture ? <img src={picture} alt="Your Today picture" /> : <div className="picempty" />}
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <span className="row-sub">Use any picture from your phone at the top of Today. It stays on this iPhone only.</span>
            <div className="chips">
              <label className="chip strong filebtn">Choose picture<input type="file" accept="image/*" onChange={pickPicture} aria-label="Choose your Today picture" /></label>
              {picture && <button className="chip" onClick={() => setHeroPicture(null)}>Remove</button>}
            </div>
          </div>
        </div>
        <div className="pad"><Seg label="Theme" value={settings.theme} onChange={(theme) => saveSettings({ theme })} options={[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} /></div>
      </section>
      <section className="pad"><button className="btn danger" onClick={erase}><Icon name="trash" size={18} /> Erase all my data</button></section>
      {open === 'sports' && <SportsPrompt initial={settings.sports || ['gym']} onCancel={() => setOpen(null)} onSave={async (sports) => { await saveSettings({ sports }); setOpen(null); toast('Sports saved'); }} />}
      {open === 'name' && <NamePrompt initial={settings.displayName || ''} initialPhoto={avatar} onCancel={() => setOpen(null)} onSave={async (displayName, photo) => { await saveSettings({ displayName, nameAsked: true }); await setAvatar(photo); setOpen(null); toast('Profile saved'); }} />}
      {open === 'data' && <DataSheet usage={usage} persisted={persisted} settings={settings} onBackup={() => setOpen('dl')} onClose={() => setOpen(null)} />}
      {open === 'goals' && <GoalsSheet settings={settings} onClose={() => setOpen(null)} />}
      {open === 'ai' && <AiSheet settings={settings} onClose={() => setOpen(null)} />}
      {open === 'dl' && <DownloadSheet settings={settings} onClose={() => setOpen(null)} />}
      {open === 'foods' && <FoodsSheet onClose={() => setOpen(null)} />}
      {open === 'remind' && <ReminderSheet onClose={() => setOpen(null)} />}
    </div>
  );
}
