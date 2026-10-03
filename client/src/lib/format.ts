const RELATIVE = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "hace 3 h", "hace 2 días"… a partir de una fecha ISO. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);

  if (absolute < 60) return 'hace un momento';
  if (absolute < 3_600) return RELATIVE.format(Math.round(diffSeconds / 60), 'minute');
  if (absolute < 86_400) return RELATIVE.format(Math.round(diffSeconds / 3_600), 'hour');
  if (absolute < 2_592_000) return RELATIVE.format(Math.round(diffSeconds / 86_400), 'day');
  if (absolute < 31_536_000) return RELATIVE.format(Math.round(diffSeconds / 2_592_000), 'month');
  return RELATIVE.format(Math.round(diffSeconds / 31_536_000), 'year');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 1200 → "1,2 mil", 45000 → "45 mil" */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands < 10 ? thousands.toFixed(1).replace('.', ',') : Math.round(thousands)} mil`;
  }
  return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
}

/** "1,2 mil" no sirve para un contador de tarjetas: aquí va entero con separador. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('es-ES').format(Math.round(value));
}

/** 42 de 100 → "42 %". Los nulos salen como guion, no como 0 %. */
export function formatPercent(part: number, total: number, digits = 0): string {
  if (!total) return '—';
  return `${new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(part / total)}`;
}

/** La variación de un KPI: cuánto sube o baja frente al periodo anterior. */
export interface Delta {
  /** Puntos porcentuales de diferencia, ya redondeados. */
  points: number;
  label: string;
  direction: 'up' | 'down' | 'flat';
}

/**
 * Compara dos cifras y devuelve la variación legible. Cuando el periodo
 * anterior estaba vacío no hay con qué comparar, así que devuelve `null`.
 */
export function computeDelta(current: number, previous: number, digits = 0): Delta | null {
  if (previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change * 10 ** digits) / 10 ** digits;
  return {
    points: rounded,
    label: `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits).replace('.', ',')} %`,
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
  };
}

/** Traduce las claves de `localStorage` de este navegador. */
export const STORAGE_KEYS = {
  goals: 'reddit-leads:goals',
  density: 'reddit-leads:densidad',
  chartMetric: 'reddit-leads:metrica',
} as const;

/** Lee una preferencia guardada y, si no hay o está corrupta, devuelve la de inicio. */
export function readPreference<T extends string | number | boolean>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === typeof fallback ? (parsed as T) : fallback;
  } catch {
    // Modo privado, cuota llena o JSON roto: la app sigue con el valor por defecto.
    return fallback;
  }
}

export function writePreference(key: string, value: string | number | boolean): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Si no se puede guardar, la preferencia solo dura esta visita.
  }
}

/** Colorea la puntuación: rojo = oportunidad, gris = poco relevante. */
export function relevanceTone(relevance: number | null): string {
  if (relevance === null) return 'bg-surface-muted text-ink-faint dark:bg-neutral-800 dark:text-neutral-400';
  if (relevance >= 80) return 'bg-brand-500 text-white';
  if (relevance >= 60) return 'bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-200';
  if (relevance >= 40) return 'bg-surface-muted text-ink-soft dark:bg-neutral-800 dark:text-neutral-300';
  return 'bg-surface-subtle text-ink-faint dark:bg-neutral-900 dark:text-neutral-500';
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Copia texto al portapapeles con fallback para navegadores sin permiso. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

export const TONE_LABELS: Record<string, string> = {
  conversational: 'Natural y conversacional',
  professional: 'Profesional y directo',
  friendly: 'Amigable e informal',
};

export const TONE_DESCRIPTIONS: Record<string, string> = {
  conversational: 'Como si lo escribiera una persona normal en Reddit.',
  professional: 'Preciso y sin rodeos, con tono de experto.',
  friendly: 'Cercano y cálido, como un consejo entre iguales.',
};
