/**
 * Descarga de archivos desde el navegador: el panel exporta los leads a CSV y
 * la web no depende de ninguna librería para hacerlo.
 */

/** Un valor limpio de comas, comillas y saltos de línea, listo para una celda. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\r?\n/g, ' ').trim();
  // El separador decimal español rompería la columna: el CSV va con punto.
  return /[",;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // BOM para que Excel abra los acentos y la ñ como toca.
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Lanza la descarga y libera el enlace temporal. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revocar al instante cancela la descarga en algunos navegadores: se espera un poco.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "reddit-leads-2026-10-03.csv": el nombre lleva la fecha para no pisarse. */
export function timestampedFilename(prefix: string, extension: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
