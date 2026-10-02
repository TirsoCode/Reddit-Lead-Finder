import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseHTML } from 'linkedom';
import { HttpError } from '../errors.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('scraper');

const MAX_HTML_BYTES = 3_000_000;
const MAX_TEXT_CHARS = 8000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; RedditLeadsBot/1.0; +https://github.com/TirsoCode/Reddit-Lead-Finder)';
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const TIMEOUT_MS = 15_000;

/**
 * Analizador de HTML: `linkedom` en lugar de `cheerio`.
 *
 * Es el único cambio de dependencia que hace falta para portar este fichero a
 * Supabase Edge Functions: cheerio arrastra `undici`, que no arranca en el
 * runtime de Deno. `linkedom` es JavaScript puro y sirve para lo mismo aquí:
 * quitar los elementos de navegación, extraer los encabezados y quedarse con el
 * texto del contenido principal.
 */
const NOISE_SELECTOR = 'script, style, noscript, svg, iframe, nav, footer, aside, form, template';

/**
 * Lo mínimo de la API de linkedom que usa este fichero.
 *
 * Los tipos que trae linkedom describen el documento como `Window & typeof
 * globalThis`, y el `document` no aparece ahí, así que el resultado de
 * `parseHTML` hay que Narrowing a mano. Se declara justo lo que se necesita en
 * lugar de `any`, para que siga habiendo comprobación de tipos dentro de las
 * funciones de abajo.
 */
interface ParsedElement {
  textContent: string | null;
  getAttribute(name: string): string | null;
  remove(): void;
}

interface ParsedDocument {
  body: ParsedElement | null;
  querySelector(selector: string): ParsedElement | null;
  querySelectorAll(selector: string): Iterable<ParsedElement>;
}

/** Analiza el HTML y devuelve el documento con el tipo que usa el resto del fichero. */
function parseDocument(html: string): ParsedDocument {
  return (parseHTML(html) as unknown as { document: ParsedDocument }).document;
}

/** Normaliza lo que la gente pega: "ejemplo.com", "www.x.com/path", etc. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw HttpError.badRequest('Introduce la URL de tu producto');

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw HttpError.badRequest('Esa URL no es válida. Ejemplo: https://miproteo.com');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw HttpError.badRequest('Solo se admiten URLs http o https');
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    throw HttpError.badRequest('Esa URL no parece válida');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  return url.toString();
}

function isPrivateAddress(hostname: string): boolean {
  const kind = isIP(hostname);
  if (kind === 4) return isPrivateV4(hostname);
  if (kind === 6) {
    const value = hostname.toLowerCase();
    return (
      value === '::1' ||
      value === '::' ||
      value.startsWith('fe80') ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('::ffff:127.') ||
      value.startsWith('::ffff:10.') ||
      value.startsWith('::ffff:192.168.')
    );
  }
  return false;
}

function isPrivateV4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a = 0, b = 0] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Evita SSRF: solo se permite descargar sitios públicos. */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isPrivateAddress(hostname)) throw HttpError.badRequest('Esa URL no es accesible');

  if (isIP(hostname) === 0) {
    try {
      const found = await lookup(hostname);
      const addresses = (Array.isArray(found) ? found : [found]).map((entry) => entry.address);
      if (addresses.some((address) => isPrivateAddress(address))) {
        throw HttpError.badRequest('Esa URL no es accesible');
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw HttpError.badRequest('No se pudo resolver el dominio de la URL');
    }
  }
}

export interface ScrapedPage {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  headings: string[];
  truncated: boolean;
}

/** Convierte el HTML en texto legible, quitando script, style y navegabilidad. */
function htmlToText(document: ParsedDocument): { text: string; headings: string[] } {
  for (const element of document.querySelectorAll(NOISE_SELECTOR)) element.remove();

  const headings: string[] = [];
  for (const element of document.querySelectorAll('h1, h2, h3')) {
    const value = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (value.length >= 3 && value.length <= 120) headings.push(value);
  }

  const container =
    document.querySelector('main') ?? document.querySelector('article') ?? document.body;

  const text = (container?.textContent ?? '')
    .replace(/\u00a0/g, ' ') // espacio duro: en algunas webs no se ve
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return { text, headings: [...new Set(headings)].slice(0, 25) };
}

/** Lee el título y la descripción que las páginas ponen en sus etiquetas meta. */
function readMetadata(document: ParsedDocument): { title: string | null; description: string | null } {
  const meta = (selector: string): string | null => {
    const value = document.querySelector(selector)?.getAttribute('content')?.trim();
    return value ? value : null;
  };

  return {
    title:
      meta('meta[property="og:title"]') ?? document.querySelector('title')?.textContent?.trim() ?? null,
    description:
      meta('meta[name="description"]') ?? meta('meta[property="og:description"]') ?? null,
  };
}

export async function scrapePage(inputUrl: string): Promise<ScrapedPage> {
  const url = normalizeUrl(inputUrl);
  await assertPublicHost(new URL(url).hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      throw HttpError.badRequest(
        `No se pudo leer la web (${response.status}). Comprueba que la URL sea pública.`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && !contentType.includes('xml') && contentType !== '') {
      throw HttpError.badRequest('Esa URL no parece ser una página web');
    }

    const html = await readLimitedBody(response);
    const document = parseDocument(html);
    const { text, headings } = htmlToText(document);

    if (text.replace(/\s+/g, ' ').trim().length < 120) {
      throw HttpError.badRequest('La web no tiene contenido de texto suficiente para analizarla');
    }

    const truncated = text.length > MAX_TEXT_CHARS;
    const { title, description } = readMetadata(document);

    return {
      url: response.url || url,
      title,
      description,
      text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
      headings,
      truncated,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (controller.signal.aborted) {
      throw HttpError.badRequest('La web tardó demasiado en responder. Inténtalo de nuevo.');
    }
    log.warn('Error al descargar la web', error);
    throw HttpError.badRequest('No se pudo acceder a la web. Revisa la URL.');
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let html = '';
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (size > MAX_HTML_BYTES || html.length > MAX_HTML_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return html;
}
