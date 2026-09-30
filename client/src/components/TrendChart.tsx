import { formatDate } from '../lib/format';

export interface DayPoint {
  day: string;
  count: number;
  averageRelevance: number | null;
}

interface TrendChartProps {
  data: DayPoint[];
}

/**
 * Gráfica de evolución de posts por día. SVG a medida: sin dependencias
 * externas y con el peso visual justo para no competir con las tarjetas.
 */
export function TrendChart({ data }: TrendChartProps) {
  const width = 720;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 24, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">Todavía no hay datos.</p>;
  }

  const max = Math.max(1, ...data.map((point) => point.count));
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const ticks = [0, Math.round(max / 2), max];

  const points = data.map((point, index) => {
    const x = padding.left + (data.length > 1 ? index * step : plotWidth / 2);
    const y = padding.top + plotHeight - (point.count / max) * plotHeight;
    return { x, y, ...point };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const baseline = padding.top + plotHeight;
  const area =
    points.length > 1
      ? [
          `M ${points[0]?.x} ${baseline}`,
          ...points.map((point) => `L ${point.x} ${point.y}`),
          `L ${points[points.length - 1]?.x} ${baseline}`,
          'Z',
        ].join(' ')
      : '';

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[190px] w-full"
        role="img"
        aria-label="Evolución de posts encontrados por día"
        preserveAspectRatio="none"
      >
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / max) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className="stroke-surface-line"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-ink-faint text-[10px]"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {area ? <path d={area} fill="url(#trend-fill)" /> : null}
        <polyline
          points={line}
          fill="none"
          stroke="#E63946"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point) => (
          <circle
            key={point.day}
            cx={point.x}
            cy={point.y}
            r={point.count > 0 ? 2.6 : 1.6}
            fill={point.count > 0 ? '#E63946' : '#D4D4D8'}
          >
            <title>
              {`${formatDate(point.day)}: ${point.count} ${
                point.count === 1 ? 'post' : 'posts'
              }${point.averageRelevance ? ` · relevancia media ${point.averageRelevance}` : ''}`}
            </title>
          </circle>
        ))}

        {points.map((point, index) =>
          index % Math.ceil(data.length / 6) === 0 ? (
            <text
              key={`label-${point.day}`}
              x={point.x}
              y={height - 6}
              textAnchor="middle"
              className="fill-ink-faint text-[10px]"
            >
              {formatDate(point.day)}
            </text>
          ) : null,
        )}

        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E63946" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#E63946" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
