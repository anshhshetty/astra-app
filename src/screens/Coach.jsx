import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, latestWeight, saveSettings, setGoal } from '../lib/db.js';
import { goalFor } from '../lib/stats.js';
import { todayKey } from '../lib/dates.js';
import { fromPer100, round, sumLogs, GOAL_TYPES } from '../lib/nutrition.js';
import { generateDietPlan, streamChat } from '../lib/gemini.js';
import { COACH_RULES, contextFromData, wantsPlan } from '../lib/coach-brain.js';
import { DIET_TYPES, fitToCalories, matchMeal, normalisePlan, planGuard, planTargets, planTotals, planWarnings } from '../lib/plan.js';
import { parseRich } from '../lib/rich.js';
import { loadAll, makePlanPdf, makePlanXlsx, saveFile } from '../lib/exporters.js';
import { defaultMeal } from '../lib/coach.js';
import { Field, Icon, Notice, Seg, Sheet, fmt, useToast } from '../components/ui.jsx';
import { ProfileForm } from './Onboarding.jsx';

const STARTERS = ['What should I eat for dinner tonight?', 'How much more protein do I need today?', 'Give me a high-protein veg snack', 'Build me a chest and triceps workout', 'How do I start running from zero?', 'Am I eating enough to build muscle?'];

const Inline = ({ parts }) => parts.map((p, i) => (p.b ? <strong key={i}>{p.t}</strong> : <React.Fragment key={i}>{p.t}</React.Fragment>));
const Rich = ({ text }) => parseRich(text).map((b, i) => {
  if (b.type === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}</ul>;
  if (b.type === 'ol') return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}</ol>;
  if (b.type === 'h') return <h4 key={i}><Inline parts={b.parts} /></h4>;
  return <p key={i}><Inline parts={b.parts} /></p>;
});

const Goals4 = ({ targets, totals }) => (
  <div className="plankpis">
    {[['kcal', 'Calories', 'kcal', 'var(--cal)', totals?.kcal], ['protein', 'Protein', 'g', 'var(--pro)', totals?.p], ['carbs', 'Carbs', 'g', 'var(--carb)', totals?.c], ['fat', 'Fat', 'g', 'var(--fat)', totals?.f]].map(([k, label, unit, color, got]) => (
      <div key={k}>
        <span className="plankpi-label"><i style={{ background: color }} />{label}</span>
        <b>{fmt(targets[k])}<small> {unit}</small></b>
        {got != null && <em>plan has {fmt(got)}</em>}
      </div>
    ))}
  </div>
);

export const DietPlan = ({ settings, onClose, goTo }) => {
  const latest = useLiveQuery(() => db.plans.orderBy('createdAt').reverse().first(), [], null);
  const [making, setMaking] = useState(false);
  const [viewing, setViewing] = useState(null);
  if (latest === null && !viewing) return null; // still loading
  const plan = viewing || (latest && !making ? latest : null);
  return plan
    ? <PlanResult plan={plan} settings={settings} onClose={onClose} onNew={() => { setViewing(null); setMaking(true); }} />
    : <PlanForm settings={settings} onClose={onClose} goTo={goTo} onMade={(p) => { setMaking(false); setViewing(p); }} />;
};

const PlanForm = ({ settings, onClose, goTo, onMade }) => {
  const [profile, setProfile] = useState(settings.profile);
  const [editing, setEditing] = useState(!settings.profile);
  const [diet, setDiet] = useState('veg');
  const [meals, setMeals] = useState(4);
  const [avoid, setAvoid] = useState('');
  const [goal, setGoalType] = useState(settings.profile?.goal || 'keep');
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');
  useEffect(() => {
    latestWeight().then((w) => { if (w) setProfile((p) => (p ? { ...p, weightKg: w } : p)); });
  }, []);
  const guard = profile ? planGuard({ ...profile, goal }) : { goal, notice: '' };
  const targets = profile ? planTargets(profile, guard.goal) : null;
  const make = async () => {
    setState('loading'); setErr('');
    try {
      const d = DIET_TYPES.find((x) => x.id === diet);
      const goalLabel = GOAL_TYPES.find((g) => g.id === guard.goal).label;
      const raw = await generateDietPlan(settings, { targets, dietPrompt: d.prompt, mealsPerDay: meals, avoid: avoid.trim(), goalLabel });
      const fitted = fitToCalories(normalisePlan(raw), targets.kcal);
      const row = { ...fitted, targets, totals: planTotals(fitted), dietLabel: d.label, goalLabel, mealsPerDay: meals, avoid: avoid.trim(), date: todayKey(), createdAt: Date.now() };
      row.id = await db.plans.add(row);
      await saveSettings({ profile: { ...profile, goal: guard.goal } });
      onMade(row);
    } catch (e) { setErr(e.kind === 'quota' ? "You've used today's free AI limit. Your goals above are still worked out, so try the meal plan again later." : e.message); setState('idle'); }
  };
  return (
    <Sheet title="Make my diet plan" onClose={onClose}>
      <div className="stack">
        {editing ? (
          <section>
            <h3 className="listhead">Your details</h3>
            <ProfileForm initial={profile} submitLabel="Work out my goals" onSubmit={(p) => { setProfile(p); setGoalType(p.goal); setEditing(false); }} />
          </section>
        ) : (
          <>
            <section className="plangoals">
              <div className="meal-head"><h2>Your daily goals</h2><button className="linkbtn" onClick={() => setEditing(true)}>Edit details</button></div>
              <p className="muted small">{profile.sex === 'female' ? 'Female' : 'Male'}, {profile.age} years, {profile.heightCm} cm, {profile.weightKg} kg</p>
              <Goals4 targets={targets} />
            </section>
            <Field group label="Your goal"><Seg label="Your goal" value={goal} onChange={setGoalType} options={GOAL_TYPES.map((g) => [g.id, g.label])} /></Field>
            {guard.notice && <Notice kind="warn">{guard.notice}</Notice>}
            <Field group label="What do you eat?"><Seg label="What do you eat?" value={diet} onChange={setDiet} options={DIET_TYPES.map((d) => [d.id, d.label])} /></Field>
            <Field group label="Meals a day"><Seg label="Meals a day" value={String(meals)} onChange={(v) => setMeals(Number(v))} options={['3', '4', '5', '6'].map((n) => [n, n])} /></Field>
            <Field label="Foods to leave out (optional)"><input type="text" value={avoid} maxLength={200} onChange={(e) => setAvoid(e.target.value)} placeholder="Peanuts, mushrooms, onion, garlic" /></Field>
            {!settings.geminiKey ? (
              <>
                <Notice kind="warn">Your goals are worked out above. To create the meals, add your free Google AI key.</Notice>
                <button className="btn primary" onClick={() => { onClose(); goTo('more', 'ai'); }}>Add my key</button>
              </>
            ) : (
              <button className="btn primary huge" disabled={state === 'loading'} onClick={make}>{state === 'loading' ? <><span className="spin" /> Writing your meals</> : <><Icon name="spark" /> Make my diet plan</>}</button>
            )}
            {err && <Notice kind="error">{err}</Notice>}
            <p className="muted small">AI estimates and general guidance, not medical advice. If you have a health condition, are pregnant, or are under 18, check with a doctor or dietitian first.</p>
          </>
        )}
      </div>
    </Sheet>
  );
};

const PlanResult = ({ plan, settings, onClose, onNew }) => {
  const toast = useToast();
  const [files, setFiles] = useState(null);
  const warnings = useMemo(() => planWarnings(plan.totals, plan.targets), [plan]);
  const cur = goalFor(settings.goalHistory, todayKey());
  const isCurrent = cur.kcal === plan.targets.kcal && cur.protein === plan.targets.protein && cur.fat === plan.targets.fat && cur.carbs === plan.targets.carbs;
  // Made ahead, because iPhone only allows sharing straight after a tap.
  useEffect(() => {
    let gone = false;
    (async () => {
      const [pdf, xlsx] = await Promise.all([makePlanPdf(plan, settings.displayName), makePlanXlsx(plan)]);
      if (!gone) setFiles({ pdf, xlsx });
    })().catch(() => toast('Could not prepare the download files.'));
    return () => { gone = true; };
  }, [plan.id]);
  const setGoals = async () => {
    const { from, ...keep } = cur;
    await setGoal({ ...keep, ...plan.targets }, todayKey());
    toast('Daily goals updated. Past days keep their old goals.');
  };
  const logMeal = async (m) => {
    const when = matchMeal(m.name, settings.meals, defaultMeal(settings.meals));
    await db.logs.bulkAdd(m.items.map((it) => ({
      date: todayKey(), meal: when, name: it.food, grams: it.grams, kcal: it.kcal, p: it.p, c: it.c, f: it.f,
      per100: it.grams > 0 ? { kcal: round((it.kcal / it.grams) * 100), p: round((it.p / it.grams) * 100, 1), c: round((it.c / it.grams) * 100, 1), f: round((it.f / it.grams) * 100, 1) } : undefined,
      createdAt: Date.now(), sourceLabel: 'Diet plan',
    })));
    toast(`Added ${m.name} to ${when}`);
  };
  return (
    <Sheet title="My diet plan" onClose={onClose}>
      <div className="stack">
        <section className="plangoals">
          <div className="meal-head"><h2>Your daily goals</h2></div>
          <p className="muted small">{plan.goalLabel}, {plan.dietLabel}, {plan.mealsPerDay} meals</p>
          <Goals4 targets={plan.targets} totals={plan.totals} />
        </section>
        {warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
        {isCurrent
          ? <p className="muted small center">These are your current daily goals.</p>
          : <button className="btn primary" onClick={setGoals}><Icon name="target" size={18} /> Use these as my daily goals</button>}
        {plan.meals.map((m, i) => {
          const t = sumLogs(m.items);
          return (
            <section className="planmeal" key={i}>
              <div className="meal-head"><h2>{m.name}</h2><span className="meal-total">{m.time ? `${m.time}, ` : ''}{fmt(t.kcal)} kcal, {fmt(t.p)} g protein</span></div>
              {m.items.map((it, j) => (
                <div className="row static" key={j}>
                  <span className="row-main"><span className="row-title">{it.food}</span><span className="row-sub">{[it.amount, `${it.grams} g`].filter(Boolean).join(', ')}</span></span>
                  <span className="row-side"><b>{fmt(it.kcal)}</b> kcal<br />{it.p} g protein</span>
                </div>
              ))}
              <div className="chips"><button className="chip" onClick={() => logMeal(m)}><Icon name="plus" size={16} /> I ate this today</button></div>
            </section>
          );
        })}
        {plan.tips?.length > 0 && (
          <section><h3 className="listhead">Coach tips</h3><ul className="plantips">{plan.tips.map((t) => <li key={t}>{t}</li>)}</ul></section>
        )}
        <div className="cta even">
          <button className="btn primary" disabled={!files} onClick={() => saveFile(files.pdf, `astra-diet-plan-${plan.date}.pdf`)}><Icon name="download" size={18} /> Download PDF</button>
          <button className="btn fill" disabled={!files} onClick={() => saveFile(files.xlsx, `astra-diet-plan-${plan.date}.xlsx`)}><Icon name="download" size={18} /> Download Excel</button>
        </div>
        <button className="btn fill" onClick={onNew}><Icon name="spark" size={18} /> Make a new plan</button>
        <p className="muted small">AI estimates and general guidance, not medical advice. If you have a health condition, are pregnant, or are under 18, check with a doctor or dietitian first.</p>
      </div>
    </Sheet>
  );
};

export default function Coach({ settings, onClose, goTo, openPlan, initialPrompt }) {
  const rows = useLiveQuery(() => db.coach.orderBy('createdAt').toArray(), [], null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState(null);
  const [err, setErr] = useState(null);
  const end = useRef(null);
  const ctl = useRef(null);
  const input = useRef(null);
  const sentFirst = useRef(false);
  const messages = rows || [];
  const busy = live !== null;

  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, live, err]);

  const ask = async (text, { saveUser = true } = {}) => {
    const clean = text.trim().slice(0, 1500);
    if (!clean || busy) return;
    setErr(null); setDraft(''); setLive('');
    if (saveUser) await db.coach.add({ role: 'user', text: clean, createdAt: Date.now() });
    const history = (await db.coach.orderBy('createdAt').toArray()).slice(-12);
    ctl.current = new AbortController();
    try {
      const [all, weight, plan] = await Promise.all([loadAll(), latestWeight(), db.plans.orderBy('createdAt').reverse().first()]);
      const now = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      const system = `${COACH_RULES}\n\n${contextFromData({ all, today: todayKey(), now, weight, plan })}`;
      const reply = await streamChat(settings, { system, messages: history, onText: setLive, signal: ctl.current.signal });
      await db.coach.add({ role: 'coach', text: reply, createdAt: Date.now() });
      setLive(null);
    } catch (e) {
      if (e.partial) await db.coach.add({ role: 'coach', text: e.partial, createdAt: Date.now() });
      setLive(null);
      if (e.kind !== 'aborted') setErr({ message: e.kind === 'quota' ? "You've used today's free AI limit. Try again later, or tomorrow." : e.message, retry: !e.partial });
    }
  };
  useEffect(() => {
    if (initialPrompt && rows && settings.geminiKey && !sentFirst.current) { sentFirst.current = true; ask(initialPrompt); }
  }, [rows === null]);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastIsUser = messages[messages.length - 1]?.role === 'user';
  const planHint = !busy && lastUser && wantsPlan(lastUser.text);

  const clear = async () => { if (window.confirm('Clear this chat?')) { await db.coach.clear(); setErr(null); } };

  const composer = settings.geminiKey ? (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
      <textarea ref={input} rows={1} value={draft} maxLength={1500} enterKeyHint="send" placeholder="Ask about food, gym or training" aria-label="Ask Astra Coach"
        onChange={(e) => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`; }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); } }} />
      {busy
        ? <button type="button" className="sendbtn stop" aria-label="Stop" onClick={() => ctl.current?.abort()}><i /></button>
        : <button type="submit" className="sendbtn" aria-label="Send" disabled={!draft.trim()}><Icon name="send" size={20} /></button>}
    </form>
  ) : null;

  return (
    <Sheet title="Astra Coach" onClose={onClose} footer={composer} className="coachsheet" keyboardAware>
      <div className="chat">
        {!settings.geminiKey && (
          <div className="stack">
            <section className="coachhero"><span className="coachmark big"><Icon name="spark" size={30} /></span><h2>Your personal coach</h2><p>Ask anything about food, the gym, running or swimming. Astra Coach needs your free Google AI key to answer.</p></section>
            <button className="btn primary" onClick={() => { onClose(); goTo('more', 'ai'); }}>Add my key</button>
          </div>
        )}
        {settings.geminiKey && rows && messages.length === 0 && !busy && (
          <div className="stack">
            <section className="coachhero">
              <span className="coachmark big"><Icon name="spark" size={30} /></span>
              <h2>{settings.displayName ? `Hey ${settings.displayName}, I'm your coach` : "Hey, I'm your coach"}</h2>
              <p>Ask me anything about food, the gym, running or swimming. I can see today's food and your goals, so my answers fit you.</p>
            </section>
            <button className="planlink" onClick={openPlan}>
              <span className="tile red"><Icon name="list" size={20} /></span>
              <span className="row-main"><span className="row-title">Make my diet plan</span><span className="row-sub">Calorie, protein, carb and fat goals, with daily meals to download</span></span>
              <Icon name="right" size={18} />
            </button>
            <div className="starters">{STARTERS.map((s) => <button key={s} className="chip starter" onClick={() => ask(s)}>{s}</button>)}</div>
            <p className="muted small">To answer, your question, today's food, your goals, basic profile and recent training go to Google. Your name, photos and routes don't. Answers are AI suggestions, not medical advice.</p>
          </div>
        )}
        {messages.length > 0 && <div className="chat-top"><button className="linkbtn" onClick={openPlan}>My diet plan</button><button className="linkbtn" onClick={clear}>Clear chat</button></div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            {m.role === 'coach' && <span className="coachmark"><Icon name="spark" size={15} /></span>}
            <div className="bubble">{m.role === 'coach' ? <Rich text={m.text} /> : m.text}</div>
          </div>
        ))}
        {busy && (
          <div className="msg msg-coach" role="status">
            <span className="coachmark"><Icon name="spark" size={15} /></span>
            <div className="bubble">{live ? <Rich text={live} /> : <span className="dots" aria-label="Astra Coach is thinking"><i /><i /><i /></span>}</div>
          </div>
        )}
        {planHint && <button className="planlink" onClick={openPlan}><span className="tile red"><Icon name="list" size={20} /></span><span className="row-main"><span className="row-title">Make my diet plan</span><span className="row-sub">Your daily goals and meals, ready to download</span></span><Icon name="right" size={18} /></button>}
        {err && (
          <div className="stack">
            <Notice kind="error">{err.message}</Notice>
            {err.retry && lastIsUser && <button className="btn fill" onClick={() => ask(lastUser.text, { saveUser: false })}>Try again</button>}
          </div>
        )}
        <div ref={end} />
      </div>
    </Sheet>
  );
}
