import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fileToSquare } from '../lib/images.js';
import { LOGO_H, LOGO_PATH, LOGO_W } from './logo.js';

const P = {
  plate: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /></>,
  bar: <path d="M2 12h20M6 7v10M9 5v14M15 5v14M18 7v10" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 13l4 4 10-11" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  scan: <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 8v8M11 8v8M14 8v8M17 8v8" />,
  pen: <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  flame: <path d="M12 3c1 4 6 6 6 11a6 6 0 01-12 0c0-2 1-4 2-5 0 2 1 3 2 3 1-3 0-6 2-9z" />,
  star: <path d="M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8z" />,
  drop: <path d="M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M4 20h16" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>,
  bell: <path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" />,
  moon: <path d="M20 14A8 8 0 0110 4a8 8 0 1010 10z" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  upload: <path d="M12 16V5M7 9l5-5 5 5M4 20h16" />,
  sunrise: <path d="M3 18h18M6 18a6 6 0 0112 0M12 4v5M5 9l2 2M19 9l-2 2M8 22h8" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  snack: <path d="M12 8c-2-2-7-1-7 5s3 8 5 8 2-1 2-1 0 1 2 1 5-2 5-8-5-7-7-5zM12 8c0-2 1-4 3-5" />,
  scale: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 9a5 5 0 018 0l-3 2h-2z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="3" /><path d="M11 18h2" /></>,
  spark: <path d="M12 3l1.8 5.4a3 3 0 001.8 1.8L21 12l-5.4 1.8a3 3 0 00-1.8 1.8L12 21l-1.8-5.4a3 3 0 00-1.8-1.8L3 12l5.4-1.8a3 3 0 001.8-1.8zM19 3v3M20.5 4.5h-3" />,
  send: <path d="M12 19V6M6 12l6-6 6 6" />,
  type: <path d="M5 7V5h14v2M12 5v14M9 19h6" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  apple: <path d="M12 8c-2-2-7-1-7 5s3 8 5 8 2-1 2-1 0 1 2 1 5-2 5-8-5-7-7-5zM12 8c0-2 1-4 3-5" />,
};
export const Icon = ({ name, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>
);

// iOS 18+ gives a light tap when a switch control toggles, the only haptic a web app can use.
export const haptic = () => {
  try {
    const l = document.createElement('label');
    l.style.display = 'none';
    const i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', '');
    l.append(i); document.body.append(l); l.click(); l.remove();
  } catch { /* optional */ }
};

export const useCountUp = (value, ms = 550) => {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { from.current = value; setShown(value); return undefined; }
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      const v = start + (value - start) * eased;
      from.current = v; setShown(v);
      if (k < 1) raf = requestAnimationFrame(step); else { from.current = value; setShown(value); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
};

export const Confetti = () => createPortal(
  <div className="confetti" aria-hidden="true">
    {Array.from({ length: 36 }, (_, i) => (
      <i key={i} style={{ left: `${(i * 37) % 100}%`, background: ['var(--cal)', 'var(--pro)', 'var(--carb)', 'var(--fat)', 'var(--gym)'][i % 5], animationDelay: `${(i % 9) * 40}ms`, '--dx': `${((i * 53) % 120) - 60}px`, '--rot': `${(i * 97) % 720}deg` }} />
    ))}
  </div>,
  document.body,
);

// Concentric progress rings, like Apple Fitness. rings: [{ value, max, color, label }]
export const Rings = ({ rings, size = 132, stroke = 13 }) => {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rings.map((r) => `${r.label} ${r.value} of ${r.max}`).join(', ')} className="rings">
      {rings.map((r, i) => {
        const rad = c - stroke / 2 - i * (stroke + 3);
        const len = 2 * Math.PI * rad;
        const pct = r.max > 0 ? Math.min(1, r.value / r.max) : 0;
        return (
          <g key={r.label} transform={`rotate(-90 ${c} ${c})`}>
            <circle cx={c} cy={c} r={rad} fill="none" stroke={r.color} strokeOpacity=".18" strokeWidth={stroke} />
            {pct > 0 && <circle cx={c} cy={c} r={rad} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len * pct} ${len}`} className="ring-on" />}
          </g>
        );
      })}
    </svg>
  );
};

export const Logo = ({ width = 120, className = '' }) => (
  <svg className={`logo ${className}`} width={width} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} role="img" aria-label="Astra"><path fill="currentColor" d={LOGO_PATH} /></svg>
);

// Round profile photo. Shows the first letter of the name until a photo is added.
export const Avatar = ({ src, name, size = 52, onClick, badge }) => {
  const letter = (name || '').trim().charAt(0).toUpperCase();
  const body = (
    <>
      {src ? <img src={src} alt="" /> : letter ? <b style={{ fontSize: size * 0.46 }}>{letter}</b> : <Icon name="camera" size={size * 0.44} />}
      {badge && <span className="avatar-badge"><Icon name="camera" size={13} /></span>}
    </>
  );
  const style = { width: size, height: size };
  return onClick
    ? <button type="button" className="avatar" style={style} onClick={onClick} aria-label="Open your profile">{body}</button>
    : <span className="avatar" style={style}>{body}</span>;
};

export const PhotoPicker = ({ src, name, size = 96, onPick }) => {
  const toast = useToast();
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { onPick(await fileToSquare(f)); } catch (err) { toast(err.message); }
  };
  return (
    <label className="photopick">
      <Avatar src={src} name={name} size={size} badge />
      <input type="file" accept="image/*" onChange={pick} aria-label="Choose your profile photo" />
    </label>
  );
};

export const NamePrompt = ({ initial = '', initialPhoto = null, onSave, onSkip, onCancel }) => {
  const [name, setName] = useState(initial);
  const [photo, setPhoto] = useState(initialPhoto);
  const clean = name.trim().slice(0, 30);
  return createPortal(
    <div className="alert-wrap">
      <form className="alert" role="dialog" aria-modal="true" aria-label="What should we call you?" onSubmit={(e) => { e.preventDefault(); if (clean) onSave(clean, photo); }}>
        <div className="alert-photo"><PhotoPicker src={photo} name={name} size={88} onPick={setPhoto} /></div>
        <h2>What should we call you?</h2>
        <p>Add your name and a photo if you like. You can change them anytime.</p>
        <input type="text" aria-label="Your name" autoFocus autoComplete="given-name" autoCapitalize="words" enterKeyHint="done" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <button type="submit" className="btn primary" disabled={!clean}>Continue</button>
        {onSkip && <button type="button" className="linkbtn center" onClick={onSkip}>Skip for now</button>}
        {onCancel && <button type="button" className="linkbtn center" onClick={onCancel}>Cancel</button>}
      </form>
    </div>,
    document.body,
  );
};

const SPORT_CHOICES = [['gym', 'Gym', 'Sets, reps and personal bests', 'bar', 'purple'], ['run', 'Running', 'GPS route, pace and calories', 'bolt', 'red'], ['swim', 'Swimming', 'Laps, time and calories', 'drop', 'blue']];
export const SportsPrompt = ({ initial = ['gym'], onSave, onCancel }) => {
  const [sel, setSel] = useState(initial);
  const toggle = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return createPortal(
    <div className="alert-wrap">
      <div className="alert" role="dialog" aria-modal="true" aria-label="What do you train?">
        <h2>What do you train?</h2>
        <p>Pick everything you do. You can change this later in More.</p>
        {SPORT_CHOICES.map(([id, title, sub, icon, tone]) => (
          <button key={id} type="button" className={`sportpick ${sel.includes(id) ? 'on' : ''}`} aria-pressed={sel.includes(id)} onClick={() => toggle(id)}>
            <span className={`tile ${tone}`}><Icon name={icon} size={20} /></span>
            <span className="row-main"><span className="row-title">{title}</span><span className="row-sub">{sub}</span></span>
            <span className="sportcheck">{sel.includes(id) && <Icon name="check" size={16} />}</span>
          </button>
        ))}
        <button type="button" className="btn primary" disabled={!sel.length} onClick={() => onSave(SPORT_CHOICES.map((c) => c[0]).filter((c) => sel.includes(c)))}>{sel.length ? 'Save sports' : 'Pick at least one'}</button>
        {onCancel && <button type="button" className="linkbtn center" onClick={onCancel}>Cancel</button>}
      </div>
    </div>,
    document.body,
  );
};

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export const ToastHost = ({ children }) => {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = (m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 3200); };
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
};

export const Sheet = ({ title, onClose, children, back, footer, className = '', keyboardAware }) => {
  const drag = useRef(null);
  const [dy, setDy] = useState(0);
  const onStart = (e) => { drag.current = e.touches[0].clientY; };
  const onMove = (e) => { if (drag.current != null) setDy(Math.max(0, e.touches[0].clientY - drag.current)); };
  const onEnd = () => { if (dy > 110 && onClose) onClose(); drag.current = null; setDy(0); };
  const box = useRef(null);
  // Keeps a chat box above the iPhone keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!keyboardAware || !vv) return undefined;
    const fit = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      box.current?.style.setProperty('--kb', `${gap}px`);
    };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, [keyboardAware]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="sheet-wrap">
    <div ref={box} className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
      <div className="grabber" aria-hidden="true" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} />
      <header className="sheet-head" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        {back ? <button className="iconbtn" onClick={back} aria-label="Back"><Icon name="left" /></button> : <span className="iconspace" />}
        <h2>{title}</h2>
        {onClose ? <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button> : <span className="iconspace" />}
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
    </div>,
    document.body,
  );
};

// A group of buttons must not sit inside a <label>, or the first button takes the label's name.
export const Field = ({ label, hint, children, group }) => {
  const Tag = group ? 'div' : 'label';
  return <Tag className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</Tag>;
};
export const NumInput = ({ value, onChange, placeholder, label, unit, autoFocus, integer }) => (
  <span className="numwrap">
    <input
      className="num" type="text" inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off" aria-label={label} placeholder={placeholder}
      autoFocus={autoFocus} value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
    />
    {unit && <span className="unit">{unit}</span>}
  </span>
);
export const Seg = ({ options, value, onChange, label }) => (
  <div className="seg" role="tablist" aria-label={label}>
    {options.map(([id, text]) => <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{text}</button>)}
  </div>
);
export const Meter = ({ value, max, color, label, right }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-top"><span>{label}</span><span className="meter-right">{right}</span></div>
      <div className="meter-track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
};
export { fmtNum as fmt } from '../lib/format.js';
// Shows a KPI with its unit set smaller: "5.15 km".
export const Kpi = ({ children }) => {
  const m = /^(.*\d)\s*([^\d\s].*)$/.exec(String(children));
  return m ? <>{m[1]}<small>{m[2].startsWith('/') ? ' ' : ' '}{m[2]}</small></> : children;
};
export const Notice = ({ kind = 'info', children }) => <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : undefined}>{children}</div>;
