import { formatCount, formatDate } from '../lib/format';

export interface DayPoint {
  day: string;
  count: number;
  averageRelevance: number | null;
}

export type ChartMetric = 'count' | 'relevance';

interface TrendChartProps {
  data: DayPoint[];
  /** `count` = posts por día; `relevance` = media de relevancia (0–100). */
  metric?: ChartMetric;
  className?: string;
}

/**
 * Gráfica de evolución por día. SVG a medida: sin dependencias externas y con
 * el peso visual justo para no competir con las tarjetas.
 *
 * En modo `relevance` los días sin posts puntúan 0 y quedan marcados, porque
 * la media solo existe donde hubo datos.
 */
export function TrendChart({ data, metric = 'count', className }: TrendChartProps) {
  const width = 720;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 24, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const isRelevance = metric === 'relevance';

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted dark:text-neutral-400">
        Todavía no hay datos.
      </p>
    );
  }

  const values = data.map((point) => (isRelevance ? (point.averageRelevance ?? 0) : point.count));
  const max = Math.max(1, ...values);
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const ticks = isRelevance ? [0, 50, 100] : uniqueTicks(max);

  const points = values.map((value, index) => {
    const x = padding.left + (data.length > 1 ? index * step : plotWidth / 2);
    const y = padding.top + plotHeight - (value / max) * plotHeight;
    const point = data[index];
    return { x, y, value, point };
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

  const summary = (point: DayPoint): string => {
    const head = `${formatDate(point.day)}: ${formatCount(point.count)} ${
      point.count === 1 ? 'post' : 'posts'
    }`;
    return point.averageRelevance === null
      ? head
      : `${head} · relevancia media ${point.averageRelevance}`;
  };

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[190px] w-full"
        role="img"
        aria-label={
          isRelevance
            ? 'Relevancia media por día'
            : 'Evolución de posts encontrados por día'
        }
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
                className="stroke-surface-line dark:stroke-neutral-800"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-ink-faint text-[10px] dark:fill-neutral-500"
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

        {points.map(({ x, y, point }) => (
          <circle
            key={point.day}
            cx={x}
            cy={y}
            r={point.count > 0 ? 2.6 : 1.6}
            fill={point.count > 0 ? '#E63946' : 'currentColor'}
            className={point.count > 0 ? undefined : 'text-[#D4D4D8] dark:text-neutral-700'}
          >
            <title>{summary(point)}</title>
          </circle>
        ))}

        {points.map(({ x, point }, index) =>
          index % Math.max(1, Math.ceil(data.length / 6)) === 0 ? (
            <text
              key={`label-${point.day}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              className="fill-ink-faint text-[10px] dark:fill-neutral-500"
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

      {/* El valor de hoy, que en un SVG a escala no se lee con claridad. */}
      {isRelevance ? (
        <p className="mt-2 text-xs text-ink-muted dark:text-neutral-400">
          Hoy:{' '}
          <span className="font-medium text-ink-soft dark:text-neutral-200">
            {data[data.length - 1]?.averageRelevance ?? '—'}
          </span>{' '}
          de media. Los días sin posts puntúan 0.
        </p>
      ) : null}
    </div>
  );
}

/** Tres marcas legibles: 0, la mitad y el máximo, sin repetir si son iguales. */
function uniqueTicks(max: number): number[] {
  const middle = Math.round(max / 2);
  return [...new Set([0, middle, max])];
}
