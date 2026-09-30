/** Utilidades de zona horaria para las estadísticas (día local del usuario). */

function offsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}

/** Devuelve el instante (UTC) del inicio del día local en `timeZone`. */
export function startOfDayInTimezone(timeZone: string, now = new Date()): Date {
  try {
    const offset = offsetMs(now, timeZone);
    const local = new Date(now.getTime() + offset);
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - offset);
  } catch {
    const fallback = new Date(now);
    fallback.setUTCHours(0, 0, 0, 0);
    return fallback;
  }
}

/** Suma días a un instante UTC conservando la hora local del usuario. */
export function addDaysInTimezone(date: Date, days: number, timeZone: string): Date {
  return new Date(date.getTime() + days * 86_400_000 + offsetMs(date, timeZone) * 0);
}
