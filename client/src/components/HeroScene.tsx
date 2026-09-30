/**
 * Escena costera original para la portada: bahía al atardecer, pueblo a los
 * lados, dos faros y veleros en la canal. El cielo va transparente para que se
 * vea el degradado cálido del hero y la costura entre ambos sea invisible.
 */

interface HouseProps {
  x: number;
  y: number;
  s?: number;
  roof?: string;
}

function House({ x, y, s = 1, roof = '#E2603F' }: HouseProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-17} y={-24} width={34} height={24} rx={2.5} fill="#FFFCF6" stroke="#E9DECD" strokeWidth={1.2} />
      <path d="M-21.5,-23 L0,-36 L21.5,-23 Z" fill={roof} />
      <path d="M-21.5,-23 L0,-36 L21.5,-23 Z" fill="none" stroke="#C4472C" strokeWidth={1} strokeOpacity={0.5} />
      <rect x={-4} y={-13} width={8} height={13} rx={1} fill="#C8B49A" />
      <rect x={-13} y={-19} width={7} height={7} rx={1} fill="#C6DEE8" />
      <rect x={6} y={-19} width={7} height={7} rx={1} fill="#C6DEE8" />
    </g>
  );
}

function Lighthouse({ x, y, s = 1, dir = 1 }: { x: number; y: number; s?: number; dir?: 1 | -1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s * dir} ${s})`}>
      {/* haz de luz */}
      <path d="M4,-86 L170,-136 L170,-36 Z" fill="#FFE7B0" opacity={0.4} />
      <path d="M4,-86 L170,-36 L60,-30 Z" fill="#FFE7B0" opacity={0.22} />
      {/* base */}
      <ellipse cx={0} cy={1} rx={20} ry={6} fill="#4E8A3A" opacity={0.55} />
      {/* torre */}
      <path d="M-13,0 L-8.5,-70 L8.5,-70 L13,0 Z" fill="#FFFCF6" stroke="#E9DECD" strokeWidth={1.2} />
      <path d="M-11.8,-12 L11.8,-12 L11.2,-26 L-11.2,-26 Z" fill="#E2603F" />
      <path d="M-10.4,-42 L10.4,-42 L9.8,-56 L-9.8,-56 Z" fill="#E2603F" />
      {/* galería y linterna */}
      <rect x={-13} y={-74} width={26} height={5} rx={2.5} fill="#E2603F" />
      <rect x={-8.5} y={-88} width={17} height={14} rx={2} fill="#FFD98A" stroke="#E9DECD" strokeWidth={1} />
      <path d="M-11,-88 L0,-99 L11,-88 Z" fill="#E2603F" />
    </g>
  );
}

function Sailboat({ x, y, s = 1, tilt = 0 }: { x: number; y: number; s?: number; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
      <ellipse cx={0} cy={13} rx={26} ry={5} fill="#FFFFFF" opacity={0.35} />
      <path d="M-4,-46 L0,-46 L0,-2" stroke="#8A6A55" strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M3,-44 L26,-4 L3,-4 Z" fill="#FFF7EE" stroke="#E9DECD" strokeWidth={1.2} />
      <path d="M-3,-40 L-22,-4 L-3,-4 Z" fill="#F08A5D" />
      <path d="M-25,-2 L25,-2 L15,11 L-15,11 Z" fill="#FFFCF6" stroke="#E9DECD" strokeWidth={1.2} />
      <path d="M-25,-2 L25,-2 L21,3 L-21,3 Z" fill="#E2603F" />
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-1.6} y={-9} width={3.2} height={10} fill="#8A6A55" />
      <circle cx={0} cy={-14} r={9} fill="#4E8A3A" />
      <circle cx={-6} cy={-9} r={7} fill="#5E9B44" />
      <circle cx={6} cy={-9} r={7} fill="#5E9B44" />
    </g>
  );
}

/** Matas y flores del primer plano; lo último que se pinta. */
const FLOWERS = [
  [60, 372], [128, 384], [196, 366], [262, 388], [330, 374], [398, 392],
  [466, 378], [540, 394], [612, 382], [686, 396], [754, 384], [826, 394],
  [898, 380], [966, 392], [1038, 376], [1110, 390], [1182, 374], [1254, 388],
  [1326, 372], [1394, 386],
];

const FLOWER_COLORS = ['#FFD166', '#FFF3D6', '#F27A85', '#FFB4A2'];

export function HeroScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1440 400" preserveAspectRatio="xMidYMin slice" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="hs-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CDE9E4" />
          <stop offset="1" stopColor="#8FC9C5" />
        </linearGradient>
        <linearGradient id="hs-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#BBDB8F" />
          <stop offset="1" stopColor="#79AE58" />
        </linearGradient>
        <linearGradient id="hs-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5E9B44" />
          <stop offset="1" stopColor="#43793A" />
        </linearGradient>
        <radialGradient id="hs-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFE3AE" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFD79A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ---------- cielo: nubes, sol, pájaros, globo ---------- */}
      <circle cx={1148} cy={72} r={34} fill="#FFD9A0" />
      <circle cx={1148} cy={72} r={110} fill="url(#hs-sun)" />

      <g fill="#FFFFFF" opacity={0.72}>
        <ellipse cx={230} cy={54} rx={64} ry={17} />
        <ellipse cx={276} cy={44} rx={40} ry={14} />
        <ellipse cx={648} cy={36} rx={54} ry={14} />
        <ellipse cx={690} cy={46} rx={34} ry={11} />
        <ellipse cx={1006} cy={58} rx={46} ry={13} />
        <ellipse cx={1352} cy={34} rx={58} ry={15} />
      </g>

      {/* globo aerostático */}
      <g transform="translate(420 68)">
        <path
          d="M0,-46 C24,-46 34,-28 34,-14 C34,0 20,14 0,30 C-20,14 -34,0 -34,-14 C-34,-28 -24,-46 0,-46 Z"
          fill="#F08A5D"
        />
        <path d="M0,-46 C12,-46 18,-30 18,-14 C18,2 10,18 0,30 Z" fill="#FFFCF6" opacity={0.85} />
        <path d="M-6,30 L6,30 L4,38 L-4,38 Z" fill="none" stroke="#8A6A55" strokeWidth={1.2} />
        <rect x={-6} y={37} width={12} height={8} rx={2} fill="#8A6A55" />
      </g>

      <g stroke="#8A6A55" strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.55}>
        <path d="M470,60 q8,-8 16,0 q8,-8 16,0" />
        <path d="M524,80 q6,-6 12,0 q6,-6 12,0" />
        <path d="M742,52 q7,-7 14,0 q7,-7 14,0" />
      </g>

      {/* ---------- mar ---------- */}
      <rect x={0} y={118} width={1440} height={282} fill="url(#hs-sea)" />

      {/* colinas lejanas en el horizonte */}
      <path
        d="M0,118 L0,104 C60,86 120,102 176,96 C232,90 268,74 322,80 C376,86 404,104 462,100 C520,96 556,82 612,88 C668,94 700,106 760,102 L760,118 Z"
        fill="#E4EFD3"
      />
      <path
        d="M780,118 L780,104 C836,90 878,100 930,94 C982,88 1020,72 1074,78 C1128,84 1160,102 1216,98 C1272,94 1310,80 1364,86 C1400,90 1424,100 1440,96 L1440,118 Z"
        fill="#E4EFD3"
      />

      {/* reflejo del sol y destellos del agua */}
      <g stroke="#FFF3DC" strokeWidth={4} strokeLinecap="round" opacity={0.6}>
        <path d="M1136,142 h26" />
        <path d="M1124,166 h50" />
        <path d="M1140,192 h22" />
        <path d="M1128,218 h44" />
      </g>
      <g stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" opacity={0.45}>
        <path d="M180,152 h72" />
        <path d="M330,196 h58" />
        <path d="M610,146 h84" />
        <path d="M860,178 h64" />
        <path d="M1010,236 h70" />
        <path d="M470,248 h66" />
        <path d="M740,262 h92" />
        <path d="M432,284 h54" />
        <path d="M940,300 h60" />
        <path d="M600,320 h78" />
      </g>

      {/* ---------- cabos con el pueblo ---------- */}
      <path
        d="M0,150 C90,158 180,180 260,225 C340,268 430,320 520,400 L0,400 Z"
        fill="url(#hs-land)"
        stroke="#FFFFFF"
        strokeOpacity={0.55}
        strokeWidth={6}
      />
      <path
        d="M1440,150 C1350,158 1260,180 1180,225 C1100,268 1010,320 920,400 L1440,400 Z"
        fill="url(#hs-land)"
        stroke="#FFFFFF"
        strokeOpacity={0.55}
        strokeWidth={6}
      />

      {/* sombreado interior de los cabos */}
      <path d="M0,400 L0,300 C120,308 240,340 340,400 Z" fill="#4E8A3A" opacity={0.25} />
      <path d="M1440,400 L1440,300 C1320,308 1200,340 1100,400 Z" fill="#4E8A3A" opacity={0.25} />

      {/* faros */}
      <Lighthouse x={92} y={176} s={1} />
      <Lighthouse x={1348} y={176} s={1} dir={-1} />

      {/* casas del pueblo */}
      <House x={44} y={214} s={1.15} />
      <House x={126} y={232} s={1} />
      <House x={202} y={266} s={0.95} roof="#D4552F" />
      <House x={286} y={312} s={0.9} />
      <House x={372} y={358} s={0.85} roof="#D4552F" />
      <House x={168} y={300} s={0.8} roof="#E8825A" />
      <House x={70} y={300} s={0.85} roof="#E8825A" />

      <House x={1396} y={214} s={1.15} />
      <House x={1314} y={232} s={1} />
      <House x={1238} y={266} s={0.95} roof="#D4552F" />
      <House x={1154} y={312} s={0.9} />
      <House x={1068} y={358} s={0.85} roof="#D4552F" />
      <House x={1272} y={300} s={0.8} roof="#E8825A" />
      <House x={1370} y={300} s={0.85} roof="#E8825A" />

      <Tree x={252} y={224} s={1.1} />
      <Tree x={340} y={288} s={1} />
      <Tree x={152} y={262} s={0.9} />
      <Tree x={1188} y={224} s={1.1} />
      <Tree x={1100} y={288} s={1} />
      <Tree x={1288} y={262} s={0.9} />

      {/* veleros en la canal */}
      <Sailboat x={660} y={286} s={1} tilt={-2} />
      <Sailboat x={806} y={236} s={0.75} tilt={2} />
      <Sailboat x={744} y={334} s={1.1} tilt={1} />
      <Sailboat x={892} y={296} s={0.7} tilt={-3} />

      {/* ---------- pradera del primer plano ---------- */}
      <path
        d="M0,350 C220,326 420,360 640,376 C880,394 1140,362 1440,340 L1440,400 L0,400 Z"
        fill="url(#hs-grass)"
      />
      <path
        d="M0,368 C240,348 460,378 680,392 L680,400 L0,400 Z"
        fill="#43793A"
        opacity={0.5}
      />

      {FLOWERS.map(([x, y], index) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 1} y={y - 6} width={2} height={7} fill="#3B6E33" />
          <circle cx={x} cy={y - 7} r={3.4} fill={FLOWER_COLORS[index % FLOWER_COLORS.length]} />
        </g>
      ))}
    </svg>
  );
}
