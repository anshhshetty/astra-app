import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';

const Bar3D = lazy(() => import('./Bar3D.jsx'));
// If 3D fails on a phone for any reason, show the flat bar instead of breaking the app.
class Safe3D extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
const canUse3D = () => {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    return !!document.createElement('canvas').getContext('webgl2');
  } catch { return false; }
};


// The day's food as a loaded bar: calories on the left, protein on the right.
// Plates fill as you eat, and the bar tips toward whichever side is ahead.
const COUNT = 8;
const H = [58, 55, 52, 48, 44, 39, 33, 27];
const W = 10; const GAP = 2.5;
const FLOOR = 136; const MID = 70;

const Sleeve = ({ dir, pct, color }) => {
  const filled = Math.max(0, Math.min(1, pct)) * COUNT;
  return H.map((h, i) => {
    const x = 180 + dir * (58 + i * (W + GAP)) - (dir < 0 ? W : 0);
    const fill = Math.max(0, Math.min(1, filled - i));
    const fh = h * 2 * fill;
    return (
      <g key={i}>
        <rect x={x} y={MID - h} width={W} height={h * 2} rx="3" className="plate-ghost" />
        {fill > 0 && (
          <g className="plate-on">
            <rect x={x} y={MID - fh / 2} width={W} height={fh} rx="3" fill={color} />
            <rect x={x} y={MID - fh / 2} width={W} height={fh} rx="3" fill="url(#plateSheen)" />
          </g>
        )}
      </g>
    );
  });
};

const Rig = ({ c, p }) => (
  <>
    <rect x="4" y={MID - 3.5} width="352" height="7" rx="3.5" fill="url(#barSteel)" />
    <rect x="102" y={MID - 11} width="7" height="22" rx="2" fill="url(#barSteel)" />
    <rect x="251" y={MID - 11} width="7" height="22" rx="2" fill="url(#barSteel)" />
    <Sleeve dir={-1} pct={c} color="var(--cal)" />
    <Sleeve dir={1} pct={p} color="var(--pro)" />
  </>
);

export default function Barbell({ kcal, kcalGoal, protein, proteinGoal }) {
  const c = kcalGoal ? kcal / kcalGoal : 0;
  const p = proteinGoal ? protein / proteinGoal : 0;
  const three = useMemo(canUse3D, []);
  const flat = <FlatBar kcal={kcal} protein={protein} c={c} p={p} />;
  return three ? (
    <div className="barstage three" style={{ '--c': Math.min(1, c), '--p': Math.min(1, p) }} role="img" aria-label={`3D barbell. Calories ${Math.round(c * 100)} percent of target, protein ${Math.round(p * 100)} percent of target. Drag to spin.`}>
      <div className="aura left" /><div className="aura right" />
      <Safe3D fallback={flat}><Suspense fallback={flat}><Bar3D c={c} p={p} /></Suspense></Safe3D>
    </div>
  ) : flat;
}

const FlatBar = ({ kcal, protein, c, p }) => {
  const tilt = Math.max(-5, Math.min(5, (Math.min(p, 1) - Math.min(c, 1)) * 10));
  const prev = useRef(kcal + protein);
  const [slam, setSlam] = useState(0);
  useEffect(() => {
    const now = kcal + protein;
    if (now > prev.current) setSlam((x) => x + 1);
    prev.current = now;
  }, [kcal, protein]);
  return (
    <div className="barstage" style={{ '--c': Math.min(1, c), '--p': Math.min(1, p) }}>
      <div className="aura left" /><div className="aura right" />
      <svg viewBox="0 0 360 190" className="barbell" role="img" aria-label={`Calories ${Math.round(c * 100)} percent of target, protein ${Math.round(p * 100)} percent of target`}>
        <defs>
          <linearGradient id="plateSheen" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset=".35" stopColor="#fff" stopOpacity=".38" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".4" />
          </linearGradient>
          <linearGradient id="barSteel" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--steel-hi)" /><stop offset=".5" stopColor="var(--steel)" /><stop offset="1" stopColor="var(--steel-lo)" />
          </linearGradient>
          <linearGradient id="fadeDown" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".3" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="reflectMask" maskUnits="userSpaceOnUse" x="0" y={FLOOR - 4} width="360" height="60"><rect x="0" y={FLOOR - 4} width="360" height="54" fill="url(#fadeDown)" /></mask>
        </defs>
        <g mask="url(#reflectMask)"><g transform={`translate(0 ${FLOOR * 2 - 8}) scale(1 -1)`}><Rig c={c} p={p} /></g></g>
        {slam > 0 && <ellipse key={slam} cx="180" cy={FLOOR + 2} rx="170" ry="9" className="shock" />}
        <g key={slam} className={slam ? 'slam' : ''}>
          <g className="barbell-tilt" style={{ transform: `rotate(${tilt}deg)`, transformOrigin: `180px ${MID}px` }}>
            <Rig c={c} p={p} />
          </g>
        </g>
      </svg>
    </div>
  );
};
