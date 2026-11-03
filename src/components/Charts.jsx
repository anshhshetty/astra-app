import React, { useState } from 'react';
import { fmt } from './ui.jsx';

const niceMax = (v) => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) if (m * p >= v) return m * p;
  return v;
};

export const BarChart = ({ title, days, values, labels, target, color, unit, fullLabel }) => {
  const [sel, setSel] = useState(null);
  const W = 360; const HT = 170; const L = 34; const B = 20; const T = 12;
  const max = niceMax(Math.max(...values, target || 0) * 1.05);
  const y = (v) => T + (HT - T - B) * (1 - v / max);
  const slot = (W - L) / values.length;
  const bw = Math.min(24, slot - 2);
  const ticks = [0, max / 2, max];
  const sparse = values.length > 10;
  const text = sel != null
    ? `${fullLabel(days[sel])}: ${values[sel] ? `${fmt(values[sel])} ${unit}` : 'nothing logged'}`
    : target ? `Target ${fmt(target)} ${unit}. Tap a bar for its value.` : 'Tap a bar for its value.';
  return (
    <figure className="chart">
      <figcaption><h3>{title}</h3><p aria-live="polite">{text}</p></figcaption>
      <svg viewBox={`0 0 ${W} ${HT}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 5} y={y(t) + 4} textAnchor="end" className="axis">{t >= 10000 ? `${Math.round(t / 1000)}K` : fmt(t)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          const h = Math.max(0, y(0) - y(v));
          const r = Math.min(5, bw / 2, h);
          return (
            <g key={days[i]}>
              {v > 0 && <path d={`M${x} ${y(0)}V${y(v) + r}Q${x} ${y(v)} ${x + r} ${y(v)}H${x + bw - r}Q${x + bw} ${y(v)} ${x + bw} ${y(v) + r}V${y(0)}Z`} fill={color} opacity={sel == null || sel === i ? 1 : 0.4} />}
              <rect x={L + i * slot} y={T} width={slot} height={HT - T - B + 18} fill="transparent" onClick={() => setSel(sel === i ? null : i)} className="hit" />
              {(!sparse || i % 5 === 0) && <text x={L + i * slot + slot / 2} y={HT - 5} textAnchor="middle" className="axis">{labels[i]}</text>}
            </g>
          );
        })}
        {target > 0 && <line x1={L} x2={W} y1={y(target)} y2={y(target)} className="target" />}
      </svg>
    </figure>
  );
};

export const LineChart = ({ title, points, unit, color = 'var(--pro)', note }) => {
  const [sel, setSel] = useState(null);
  if (points.length < 2) return <figure className="chart"><figcaption><h3>{title}</h3><p>Add at least 2 entries to see a trend.</p></figcaption></figure>;
  const W = 360; const HT = 160; const L = 38; const R = 10; const B = 20; const T = 12;
  const vals = points.map((p) => p.v);
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.15, 1); lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
  const x = (i) => L + (W - L - R) * (i / (points.length - 1));
  const y = (v) => T + (HT - T - B) * (1 - (v - lo) / (hi - lo));
  const last = points.length - 1;
  const s = sel ?? last;
  return (
    <figure className="chart">
      <figcaption><h3>{title}</h3><p aria-live="polite">{points[s].label}: {points[s].v} {unit}{note ? `. ${note}` : ''}</p></figcaption>
      <svg viewBox={`0 0 ${W} ${HT}`} role="img" aria-label={title}>
        {[lo, (lo + hi) / 2, hi].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 5} y={y(t) + 4} textAnchor="end" className="axis">{Math.round(t * 10) / 10}</text></g>
        ))}
        <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.v)}`).join('')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(s)} cy={y(points[s].v)} r="5" fill={color} className="ringed" />
        {points.map((p, i) => <rect key={i} x={x(i) - (W / points.length) / 2} y={T} width={W / points.length} height={HT - T - B} fill="transparent" onClick={() => setSel(i)} className="hit" />)}
        <text x={L} y={HT - 5} className="axis">{points[0].label}</text>
        <text x={W - R} y={HT - 5} textAnchor="end" className="axis">{points[last].label}</text>
      </svg>
    </figure>
  );
};
