import React, { useEffect, useState } from 'react';
import { db, saveSettings, setAvatar, useSettings, seedOnce, requestPersistence, setDay } from './lib/db.js';
import { todayKey } from './lib/dates.js';
import { defaultMeal } from './lib/coach.js';
import { fileToImages } from './lib/images.js';
import { Icon, NamePrompt, Sheet, SportsPrompt, ToastHost, haptic, useToast } from './components/ui.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Today from './screens/Today.jsx';
import Train from './screens/Train.jsx';
import Progress, { BodyEntry } from './screens/Progress.jsx';
import More from './screens/More.jsx';
import AddFood from './screens/AddFood.jsx';
import Coach, { DietPlan } from './screens/Coach.jsx';


const Quick = ({ onClose, onPhoto, onPick, sports }) => {
  const toast = useToast();
  const file = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { onPhoto(await fileToImages(f)); } catch (err) { toast(err.message); }
  };
  return (
    <Sheet title="What do you want to add?" onClose={onClose}>
      <div className="quick">
        <label className="quick-tile hero-tile"><span className="tile red"><Icon name="camera" size={26} /></span><b>Snap food</b><em>Photo, then enter the weight</em><input type="file" accept="image/*" capture="environment" onChange={file} aria-label="Snap food photo" /></label>
        <button className="quick-tile coach-tile" onClick={() => onPick('coach')}><span className="coachmark big"><Icon name="spark" size={24} /></span><b>Ask Astra Coach</b><em>Food, gym and training questions</em></button>
        <button className="quick-tile" onClick={() => onPick('type')}><span className="tile red"><Icon name="type" size={24} /></span><b>Type food</b><em>"2 roti and dal"</em></button>
        <button className="quick-tile" onClick={() => onPick('search')}><span className="tile blue"><Icon name="search" size={24} /></span><b>Search food</b><em>Dal, paneer, whey…</em></button>
        <button className="quick-tile" onClick={() => onPick('barcode')}><span className="tile yellow"><Icon name="scan" size={24} /></span><b>Scan barcode</b><em>For packaged food</em></button>
        {sports.includes('gym') && <button className="quick-tile" onClick={() => onPick('gym')}><span className="tile purple"><Icon name="bar" size={24} /></span><b>Start workout</b><em>Log sets and reps</em></button>}
        {sports.includes('run') && <button className="quick-tile" onClick={() => onPick('run')}><span className="tile red"><Icon name="bolt" size={24} /></span><b>Start a run</b><em>GPS route on a map</em></button>}
        {sports.includes('swim') && <button className="quick-tile" onClick={() => onPick('swim')}><span className="tile blue"><Icon name="drop" size={24} /></span><b>Log a swim</b><em>Laps and time</em></button>}
        <button className="quick-tile" onClick={() => onPick('plan')}><span className="tile green"><Icon name="list" size={24} /></span><b>Diet plan</b><em>Goals and daily meals</em></button>
        <button className="quick-tile" onClick={() => onPick('water')}><span className="tile blue"><Icon name="drop" size={24} /></span><b>Add water</b><em>Adds one glass, 250 ml</em></button>
        <button className="quick-tile" onClick={() => onPick('body')}><span className="tile green"><Icon name="scale" size={24} /></span><b>Log weight</b><em>Weight and body size</em></button>
      </div>
    </Sheet>
  );
};

const Shell = ({ settings }) => {
  const toast = useToast();
  const [tab, setTab] = useState('today');
  const [moreOpen, setMoreOpen] = useState(null);
  const [date, setDate] = useState(todayKey());
  const [gymIntent, setGymIntent] = useState(null);
  const [quick, setQuick] = useState(false);
  const [food, setFood] = useState(null);
  const [body, setBody] = useState(false);
  const [coach, setCoach] = useState(null);
  const [plan, setPlan] = useState(false);
  const sports = settings.sports || ['gym'];
  const trainLabel = sports.length > 1 ? 'Train' : { gym: 'Gym', run: 'Run', swim: 'Swim' }[sports[0]];
  const trainIcon = sports.length > 1 || sports[0] === 'gym' ? 'bar' : sports[0] === 'run' ? 'bolt' : 'drop';
  const TABS = [['today', 'Today', 'plate'], ['train', trainLabel, trainIcon], null, ['progress', 'Progress', 'chart'], ['more', 'More', 'more']];

  const goTo = (t, open = null) => { setMoreOpen(open); setTab(t); };
  const pick = async (what) => {
    setQuick(false);
    if (what === 'coach') setCoach({});
    if (what === 'plan') setPlan(true);
    if (what === 'type') setFood({ focusType: true });
    if (what === 'search') setFood({});
    if (what === 'barcode') setFood({ view: 'barcode' });
    if (['gym', 'run', 'swim'].includes(what)) { setGymIntent({ date, sport: what }); goTo('train'); }
    if (what === 'body') setBody(true);
    if (what === 'water') {
      const d = await db.days.get(date);
      await setDay(date, { water: (d?.water || 0) + 250 });
      toast('Added 250 ml of water');
    }
  };

  return (
    <>
      <main className="screen" key={tab}>
        {tab === 'today' && <Today openCoach={(prompt) => setCoach({ prompt })} date={date} setDate={setDate} settings={settings} goTo={goTo} startTrain={(sport, d) => { setGymIntent({ date: d, sport }); goTo('train'); }} />}
        {tab === 'train' && <Train settings={settings} intent={gymIntent} clearIntent={() => setGymIntent(null)} />}
        {tab === 'progress' && <Progress settings={settings} />}
        {tab === 'more' && <More settings={settings} initialOpen={moreOpen} openCoach={() => setCoach({})} openPlan={() => setPlan(true)} />}
      </main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (t ? (
          <button key={t[0]} className={tab === t[0] ? 'on' : ''} aria-current={tab === t[0] ? 'page' : undefined} onClick={() => goTo(t[0])}>
            <Icon name={t[2]} /><span>{t[1]}</span>
          </button>
        ) : <button key="add" className="tab-add" aria-label="Add" onClick={() => setQuick(true)}><Icon name="plus" size={28} /></button>))}
      </nav>
      {quick && <Quick sports={sports} onClose={() => setQuick(false)} onPick={pick} onPhoto={(images) => { setQuick(false); setFood({ images }); }} />}
      {food && <AddFood date={date} meal={defaultMeal(settings.meals)} settings={settings} initialImages={food.images || null} initialView={food.view || 'home'} focusType={!!food.focusType} onClose={() => setFood(null)} goTo={goTo} />}
      {body && <BodyEntry date={date} onClose={() => setBody(false)} />}
      {coach && <Coach settings={settings} initialPrompt={coach.prompt} onClose={() => setCoach(null)} goTo={goTo} openPlan={() => setPlan(true)} />}
      {plan && <DietPlan settings={settings} onClose={() => setPlan(false)} goTo={goTo} />}
      {!settings.displayName && !settings.nameAsked && <NamePrompt onSave={async (displayName, photo) => { await saveSettings({ displayName, nameAsked: true }); if (photo) await setAvatar(photo); }} onSkip={() => saveSettings({ nameAsked: true })} />}
      {(settings.displayName || settings.nameAsked) && !settings.sports && <SportsPrompt onSave={(s) => saveSettings({ sports: s })} />}
    </>
  );
};

export default function App() {
  const settings = useSettings();

  useEffect(() => { seedOnce(); requestPersistence(); }, []);
  useEffect(() => {
    const onTap = (e) => { if (e.target.closest?.('.btn.primary, .tick, .tab-add, .tabs button, .quick-tile')) haptic(); };
    document.addEventListener('click', onTap);
    return () => document.removeEventListener('click', onTap);
  }, []);
  useEffect(() => {
    if (!settings) return;
    const r = document.documentElement;
    if (settings.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', settings.theme);
  }, [settings?.theme]);

  if (!settings) return null;
  return <ToastHost>{settings.onboarded ? <Shell settings={settings} /> : <Onboarding />}</ToastHost>;
}
