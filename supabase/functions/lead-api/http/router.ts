import { HttpError } from '../errors.ts';

/**
 * Enrutador mínimo sobre las APIs web estándar de Deno.
 *
 * Sustituye a Express, que en Edge Functions no encaja bien: habría que levantar
 * un `node:http.Server` y traducir cada `Request`/`Response`. Con esto la
 * función es un `Deno.serve` y nada más.
 *
 * Cubre lo que usa la app: métodos CRUD, parámetros de ruta (`:id`), la
 * petición completa, la URL ya parseada y un atajo `json()`.
 */

export interface RouteContext {
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** Devuelve la respuesta tal cual (respuestas ya construidas). */
  json(body: unknown, status?: number): Response;
}

export type RouteHandler = (ctx: RouteContext) => Response | Promise<Response>;

interface CompiledRoute {
  method: string;
  segments: string[];
  handler: RouteHandler;
}

export class Router {
  readonly #routes: CompiledRoute[] = [];

  add(method: string, pattern: string, handler: RouteHandler): this {
    this.#routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.add('GET', pattern, handler);
  }
  post(pattern: string, handler: RouteHandler): this {
    return this.add('POST', pattern, handler);
  }
  put(pattern: string, handler: RouteHandler): this {
    return this.add('PUT', pattern, handler);
  }
  patch(pattern: string, handler: RouteHandler): this {
    return this.add('PATCH', pattern, handler);
  }
  delete(pattern: string, handler: RouteHandler): this {
    return this.add('DELETE', pattern, handler);
  }

  /**
   * Busca la ruta para el método y la ruta dados. Si el camino existe pero con
   * otro método, devuelve 405 con la cabecera `Allow` (igual que haría Express).
   */
  match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } {
    const wanted = pathname.split('/').filter(Boolean);
    const allowed = new Set<string>();

    for (const route of this.#routes) {
      const params = matchSegments(route.segments, wanted);
      if (!params) continue;

      if (route.method === method.toUpperCase()) return { handler: route.handler, params };
      allowed.add(route.method);
    }

    if (allowed.size > 0) {
      throw new HttpError(405, `Método no permitido. Usa: ${[...allowed].join(', ')}`, 'method_not_allowed');
    }

    throw HttpError.notFound('Ese endpoint no existe');
  }
}

/** Devuelve los parámetros si los segmentos encajan, o `null` si no. */
function matchSegments(
  pattern: string[],
  wanted: string[],
): Record<string, string> | null {
  if (pattern.length !== wanted.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index] as string;
    const actual = wanted[index] as string;

    if (expected.startsWith(':')) {
      // Un parámetro de ruta no puede estar vacío.
      if (!actual) return null;
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }

    if (expected !== actual) return null;
  }

  return params;
}

export function createContext(
  req: Request,
  url: URL,
  params: Record<string, string>,
): RouteContext {
  return {
    req,
    url,
    params,
    json: (body, status = 200) => Response.json(body, { status }),
  };
}
