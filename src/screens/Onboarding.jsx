import React, { useState } from 'react';
import { WarriorArt } from '../components/Art.jsx';
import { saveSettings, setGoal, db } from '../lib/db.js';
import { ACTIVITY, GOAL_TYPES, suggestTargets, parseNum } from '../lib/nutrition.js';
import { todayKey } from '../lib/dates.js';
import { Field, Logo, NumInput, NamePrompt, Seg, Notice, Icon } from '../components/ui.jsx';
import { setAvatar, useSettings } from '../lib/db.js';

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isInstalled = () => window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

export const ProfileForm = ({ initial, onSubmit, submitLabel }) => {
  const [f, setF] = useState(initial || { sex: 'male', age: '', heightCm: '', weightKg: '', activity: 1.55, goal: 'gain' });
  const up = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const nums = { age: parseNum(f.age), heightCm: parseNum(f.heightCm), weightKg: parseNum(f.weightKg) };
  const valid = nums.age >= 13 && nums.age <= 100 && nums.heightCm >= 120 && nums.heightCm <= 230 && nums.weightKg >= 30 && nums.weightKg <= 250;
  return (
    <div className="stack">
      <Field group label="Sex (used in the calorie formula)"><Seg label="Sex" value={f.sex} onChange={up('sex')} options={[['male', 'Male'], ['female', 'Female']]} /></Field>
      <div className="row3">
        <Field label="Age"><NumInput value={f.age} onChange={up('age')} integer label="Age" /></Field>
        <Field label="Height"><NumInput value={f.heightCm} onChange={up('heightCm')} unit="cm" label="Height in cm" /></Field>
        <Field label="Weight"><NumInput value={f.weightKg} onChange={up('weightKg')} unit="kg" label="Weight in kg" /></Field>
      </div>
      <Field label="How active are you?">
        <select value={f.activity} onChange={(e) => up('activity')(Number(e.target.value))}>{ACTIVITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      </Field>
      <Field group label="Your goal"><Seg label="Your goal" value={f.goal} onChange={up('goal')} options={GOAL_TYPES.map((g) => [g.id, g.label])} /></Field>
      <button className="btn primary" disabled={!valid} onClick={() => onSubmit({ ...f, ...nums })}>{submitLabel}</button>
      {!valid && (f.age || f.heightCm || f.weightKg) ? <p className="muted small">Enter your age, height in cm and weight in kg.</p> : null}
    </div>
  );
};

export const TargetsForm = ({ initial, onSubmit, submitLabel }) => {
  const [g, setG] = useState(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  const up = (k) => (v) => setG((x) => ({ ...x, [k]: v }));
  const out = { kcal: parseNum(g.kcal), protein: parseNum(g.protein), carbs: parseNum(g.carbs), fat: parseNum(g.fat), water: parseNum(g.water), workouts: parseNum(g.workouts) };
  const valid = out.kcal > 0 && out.protein > 0 && out.water > 0 && out.workouts >= 1 && out.workouts <= 7 && out.carbs >= 0 && out.fat >= 0;
  return (
    <div className="stack">
      <div className="row2">
        <Field label="Calories a day"><NumInput value={g.kcal} onChange={up('kcal')} unit="kcal" integer label="Calories a day" /></Field>
        <Field label="Protein a day"><NumInput value={g.protein} onChange={up('protein')} unit="g" integer label="Protein a day" /></Field>
        <Field label="Carbs a day"><NumInput value={g.carbs} onChange={up('carbs')} unit="g" integer label="Carbs a day" /></Field>
        <Field label="Fat a day"><NumInput value={g.fat} onChange={up('fat')} unit="g" integer label="Fat a day" /></Field>
        <Field label="Water a day"><NumInput value={g.water} onChange={up('water')} unit="ml" integer label="Water a day" /></Field>
        <Field label="Gym days a week"><NumInput value={g.workouts} onChange={up('workouts')} integer label="Gym days a week" /></Field>
      </div>
      <button className="btn primary" disabled={!valid} onClick={() => onSubmit(out)}>{submitLabel}</button>
    </div>
  );
};

export default function Onboarding() {
  const [step, setStep] = useState(-1);
  const [asking, setAsking] = useState(false);
  const settings = useSettings();
  const [profile, setProfile] = useState(null);
  const [targets, setTargets] = useState(null);
  const gymDays = (a) => (a >= 1.725 ? 6 : a >= 1.55 ? 4 : 3);
  const warn = !isInstalled() && isIos() && (
    <Notice kind="warn"><strong>Install first.</strong> Tap Share in Safari, then Add to Home Screen, and open it from there. Anything saved in the Safari tab stays separate from the installed app.</Notice>
  );
  return (
    <div className={`onboard ${step === -1 ? 'first' : ''}`}>
      {step === -1 && (
        <div className="welcome">
          <div className="welcome-art">
            <div className="art-tilt"><WarriorArt /></div>
            <div className="bigword"><span>Never</span><span>Give up</span></div>
          </div>
          <div className="welcome-body">
          <h1 className="wordmark"><Logo width={190} /></h1>
          <p className="lead">Eat right. Lift heavier. Never break the streak.</p>
          <ul className="howto">
            <li><span className="tile red"><Icon name="camera" size={20} /></span><span><b>Snap your food</b>Enter the weight and see calories and protein.</span></li>
            <li><span className="tile purple"><Icon name="bar" size={20} /></span><span><b>Log your gym</b>Sets, reps and your personal bests.</span></li>
            <li><span className="tile yellow"><Icon name="flame" size={20} /></span><span><b>Keep your streak</b>Weekly and monthly goals in one place.</span></li>
          </ul>
          {warn}
          <button className="btn primary" onClick={() => (settings?.displayName || settings?.nameAsked ? setStep(0) : setAsking(true))}>Get started</button>
          {asking && <NamePrompt onSave={async (displayName, photo) => { await saveSettings({ displayName, nameAsked: true }); if (photo) await setAvatar(photo); setAsking(false); setStep(0); }} onSkip={async () => { await saveSettings({ nameAsked: true }); setAsking(false); setStep(0); }} />}
          <p className="muted small center">Free. Your data stays on this iPhone.</p>
          </div>
        </div>
      )}
      {step === 0 && (
        <>
          <button className="linkback" onClick={() => setStep(-1)}><Icon name="left" size={18} /> Back</button>
          <h1>{settings?.displayName ? `Hi ${settings.displayName}, tell me about you` : 'About you'}</h1>
          <p className="lead">I'll work out how much you should eat each day.</p>
          <ProfileForm submitLabel="Suggest my targets" onSubmit={(p) => {
            setProfile(p);
            setTargets({ ...suggestTargets(p), water: 3000, workouts: gymDays(p.activity) });
            setStep(1);
          }} />
        </>
      )}
      {step === 1 && (
        <>
          <button className="linkback" onClick={() => setStep(0)}><Icon name="left" size={18} /> Back</button>
          <h1>Your daily targets</h1>
          <p className="lead">Calories are your energy. Protein builds muscle. Change anything now or later in More.</p>
          <TargetsForm initial={targets} submitLabel="Start tracking" onSubmit={async (g) => {
            await setGoal(g, '2000-01-01');
            await db.body.put({ date: todayKey(), weight: profile.weightKg });
            await saveSettings({ profile, onboarded: true });
          }} />
        </>
      )}
    </div>
  );
}
