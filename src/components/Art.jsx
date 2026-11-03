import React from 'react';

// Original anime-style scenes drawn for Astra: a nameless hero with spiky hair, in silhouette.
const INK = '#060B11';
const RIM = '#FF8A3D';

const Hair = ({ x = 0, y = 0, s = 1, flip = 1 }) => (
  <path transform={`translate(${x} ${y}) scale(${s * flip} ${s})`} d="M-40 8 L-62 -6 L-40 -14 L-60 -42 L-28 -34 L-34 -74 L-8 -44 L4 -86 L18 -46 L46 -72 L38 -34 L68 -38 L44 -12 L66 2 L40 8 Z" />
);
const SpeedLines = ({ n = 16, w = 400, h = 500, angle = 0, o = 0.16 }) => (
  <g opacity={o} stroke="#fff" strokeLinecap="round" transform={`rotate(${angle} ${w / 2} ${h / 2})`}>
    <g className="art-lines">
      {Array.from({ length: n }, (_, i) => {
        const y = (i * 37 + 11) % h;
        const x = (i * 83) % (w - 60) - 40;
        return <line key={i} x1={x} x2={x + 60 + (i * 29) % 150} y1={y} y2={y} strokeWidth={1 + (i % 3)} />;
      })}
    </g>
  </g>
);
const Sun = ({ cx, cy, r }) => (
  <g className="art-sun">
    <circle cx={cx} cy={cy} r={r * 1.7} fill="url(#artGlow)" />
    <circle cx={cx} cy={cy} r={r} fill="url(#artDisc)" />
  </g>
);
const Defs = () => (
  <defs>
    <radialGradient id="artGlow"><stop offset="0" stopColor="#FF7A2F" stopOpacity=".7" /><stop offset="1" stopColor="#FF7A2F" stopOpacity="0" /></radialGradient>
    <linearGradient id="artDisc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFB067" /><stop offset="1" stopColor="#F2571B" /></linearGradient>
    <pattern id="artDots" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2" cy="2" r="1.1" fill="#fff" /></pattern>
  </defs>
);
// A silhouette drawn twice: glowing colour underneath, ink on top shifted away from the light.
const Rimlit = ({ children, dx = -3, dy = 1 }) => (
  <>
    <g fill={RIM} stroke={RIM}>{children}</g>
    <g fill={INK} stroke={INK} transform={`translate(${dx} ${dy})`}>{children}</g>
  </>
);
const Limb = ({ d, w }) => <path d={d} fill="none" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
const Svg = ({ view = '0 0 400 500', children, label, pos = 'xMidYMin slice' }) => (
  <svg className="art" viewBox={view} preserveAspectRatio={pos} role="img" aria-label={label}><Defs />{children}</svg>
);
const Embers = ({ n = 10 }) => (
  <g className="art-embers">
    {Array.from({ length: n }, (_, i) => <circle key={i} cx={(i * 47 + 20) % 400} cy={440 - (i * 61) % 260} r={1.5 + (i % 3)} fill="#FFB067" style={{ animationDelay: `${(i % 7) * 0.5}s` }} />)}
  </g>
);

// Standing with his back to the sunrise, cape torn, dumbbell in hand.
export const WarriorArt = () => (
  <Svg view="0 -70 400 570" label="A hero with spiky hair and a torn cape facing the rising sun">
    <Sun cx={250} cy={165} r={105} />
    <rect width="400" height="500" fill="url(#artDots)" opacity=".05" />
    <SpeedLines n={14} angle={-18} o={0.1} />
    <g className="art-float">
      <Rimlit dx={-3}>
        <Hair x={205} y={128} s={1.05} />
        <ellipse cx="205" cy="136" rx="36" ry="38" />
        <path d="M186 160 h38 v26 h-38 Z" />
        <path d="M205 176 C150 178 108 196 92 232 C78 268 84 300 96 330 L122 324 L132 372 L160 356 L168 410 L198 380 L222 412 L240 358 L272 378 L278 322 L306 332 C322 296 330 262 316 230 C300 196 258 178 205 176 Z" />
        <Limb d="M172 390 L160 500" w={46} />
        <Limb d="M240 390 L256 500" w={46} />
        <Limb d="M326 240 L344 330" w={34} />
        <Limb d="M90 240 L68 330" w={34} />
        <Limb d="M344 330 L350 372" w={26} />
        <Limb d="M68 330 L62 372" w={26} />
        <rect x="316" y="378" width="70" height="11" rx="5" />
        <rect x="310" y="360" width="16" height="47" rx="5" />
        <rect x="376" y="360" width="16" height="47" rx="5" />
      </Rimlit>
      <path d="M160 258 l34 -22 l-8 34 l30 -6 l-40 38 l6 -28 Z" fill={RIM} opacity=".85" />
    </g>
    <Embers />
  </Svg>
);

// Heavy squat, bar across the shoulders, screaming through the rep.
export const LifterArt = () => (
  <Svg view="0 -24 400 524" label="A spiky-haired hero squatting a heavy barbell">
    <Sun cx={200} cy={160} r={118} />
    <SpeedLines n={18} angle={90} o={0.13} />
    <g className="art-float">
      <Rimlit dx={-3}>
        <rect x="6" y="176" width="388" height="10" rx="5" />
        <rect x="20" y="98" width="24" height="166" rx="8" />
        <rect x="48" y="112" width="20" height="138" rx="7" />
        <rect x="72" y="130" width="14" height="102" rx="6" />
        <rect x="356" y="98" width="24" height="166" rx="8" />
        <rect x="332" y="112" width="20" height="138" rx="7" />
        <rect x="314" y="130" width="14" height="102" rx="6" />
        <Hair x={200} y={120} s={0.92} />
        <ellipse cx="200" cy="126" rx="31" ry="34" />
        <path d="M122 184 C150 158 250 158 278 184 L288 226 C276 268 256 300 248 330 L152 330 C144 300 124 268 112 226 Z" />
        <Limb d="M126 192 L92 214 L112 178" w={30} />
        <Limb d="M274 192 L308 214 L288 178" w={30} />
        <Limb d="M170 330 L94 374 L118 472" w={50} />
        <Limb d="M230 330 L306 374 L282 472" w={50} />
        <path d="M84 462 h58 l6 26 h-76 Z" />
        <path d="M258 462 h58 l12 26 h-76 Z" />
      </Rimlit>
    </g>
    <Embers />
  </Svg>
);

// Sprinting with hair streaming behind.
export const RunnerArt = () => (
  <Svg view="20 -20 380 480" label="A spiky-haired hero sprinting at full speed">
    <Sun cx={272} cy={185} r={112} />
    <SpeedLines n={24} o={0.2} />
    <g className="art-run">
      <Rimlit dx={-3}>
        <g transform="rotate(-28 240 96)"><Hair x={240} y={78} s={0.74} /></g>
        <path d="M214 84 L164 66 L196 94 L150 102 L204 118 Z" />
        <ellipse cx="242" cy="100" rx="29" ry="31" />
        <path d="M230 122 L262 126 L276 174 L238 268 L176 256 L196 164 Z" />
        <Limb d="M252 152 L300 204 L334 150" w={27} />
        <Limb d="M206 160 L150 186 L126 244" w={27} />
        <Limb d="M214 256 L286 296 L270 382" w={46} />
        <Limb d="M196 252 L128 330 L52 332" w={44} />
        <path d="M252 374 h56 l14 22 h-76 Z" />
        <path d="M36 306 l20 -6 l6 54 l-22 8 Z" />
      </Rimlit>
    </g>
    <path d="M0 412 H400 V500 H0 Z" fill={INK} opacity=".55" />
    <SpeedLines n={8} h={80} o={0.35} />
    <Embers n={7} />
  </Svg>
);

// Cutting through water.
export const SwimmerArt = () => (
  <Svg view="0 50 400 450" label="A spiky-haired hero swimming through a breaking wave">
    <Sun cx={110} cy={120} r={80} />
    <g className="art-float">
      <Rimlit dx={-2}>
        <path d="M262 214 L232 178 L258 192 L240 150 L272 182 L280 142 L296 186 L322 164 L312 204 L304 226 Z" />
        <ellipse cx="282" cy="222" rx="28" ry="24" />
        <path d="M256 224 C200 212 130 226 72 268 L92 306 C150 288 214 276 268 252 Z" />
        <Limb d="M302 216 L350 170 L392 186" w={25} />
        <Limb d="M190 232 L148 188 L100 168" w={24} />
        <Limb d="M92 282 L26 314" w={32} />
        <Limb d="M84 292 L18 276" w={27} />
      </Rimlit>
    </g>
    <g className="art-wave" fill="none" strokeLinecap="round">
      <path d="M-40 300 C10 270 50 330 100 300 S190 270 240 300 S330 330 380 296 S470 280 500 310" stroke="#7FD6FF" strokeWidth="6" />
      <path d="M-60 340 C0 310 40 370 100 340 S190 310 250 340 S340 370 400 336 S490 320 520 350" stroke="#2FA8E8" strokeWidth="9" opacity=".8" />
      <path d="M-40 388 C20 358 60 418 120 388 S210 358 270 388 S360 418 420 384" stroke="#165E8C" strokeWidth="14" opacity=".8" />
    </g>
    <path d="M0 400 H400 V500 H0 Z" fill="#0B2C43" opacity=".9" />
    <g fill="#CDEFFF">{[[330, 158], [366, 208], [120, 150], [86, 140], [46, 280], [320, 268]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2 + (i % 3)} />)}</g>
  </Svg>
);
