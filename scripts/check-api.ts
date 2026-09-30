/**
 * Prueba de extremo a extremo contra el servidor real: registro, perfil,
 * listado de leads y estadísticas (incluye generate_series y zonas horarias).
 * npx tsx scripts/check-api.ts
 */
import { pool } from '../server/db.js';
import { createApp } from '../server/index.js';

const BASE = 'http://127.0.0.1:3111';

async function call(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* respuesta sin JSON */
  }
  return { status: response.status, body };
}

async function main() {
  const app = createApp();
  const server = app.listen(3111);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const email = `test-${Date.now()}@example.com`;

  const reg = await call('/api/dev/auth/register', {
    method: 'POST',
    body: { email, password: 'secreto123' },
  });
  console.log('1) registro:', reg.status, '(esperado 201)');

  const login = await call('/api/dev/auth/login', {
    method: 'POST',
    body: { email, password: 'secreto123' },
  });
  const token = (login.body as { token?: string }).token;
  console.log('2) login:', login.status, '| token:', token ? 'sí' : 'NO');

  const badLogin = await call('/api/dev/auth/login', {
    method: 'POST',
    body: { email, password: 'otra12345' },
  });
  console.log('3) login con contraseña mala:', badLogin.status, JSON.stringify(badLogin.body), '(esperado 401)');

  const dup = await call('/api/dev/auth/register', {
    method: 'POST',
    body: { email, password: 'secreto123' },
  });
  console.log('4) registro duplicado:', dup.status, JSON.stringify(dup.body), '(esperado 409)');

  console.log('5) perfil sin token:', (await call('/api/profile')).status, '(esperado 401)');

  const profileRes = await call('/api/profile', { token });
  const prof = (profileRes.body as { profile?: Record<string, unknown>; pendingReplies?: number }).profile;
  console.log('6) perfil con token:', profileRes.status, '| timezone:', prof?.timezone, '| pendingReplies:', (profileRes.body as { pendingReplies?: number }).pendingReplies);
  console.log('   created_at oculto del cliente?', prof ? !('created_at' in prof) : 'n/a');

  const patch = await call('/api/profile', {
    method: 'PATCH',
    body: { tone: 'professional', timezone: 'Europe/Madrid' },
    token,
  });
  console.log('7) PATCH tono + zona:', patch.status, JSON.stringify((patch.body as { profile?: { tone: string; timezone: string } }).profile));

  const badTz = await call('/api/profile', { method: 'PATCH', body: { timezone: 'Marte/Olympus' }, token });
  console.log('8) PATCH zona inválida:', badTz.status, JSON.stringify(badTz.body), '(esperado 400)');

  const emptyPatch = await call('/api/profile', { method: 'PATCH', body: {}, token });
  console.log('9) PATCH sin campos:', emptyPatch.status, JSON.stringify(emptyPatch.body), '(esperado 400)');

  const emptyLeads = await call('/api/leads', { token });
  console.log('10) leads vacío:', emptyLeads.status, JSON.stringify(emptyLeads.body));

  const scan = await call('/api/profile/scan', { method: 'POST', token });
  console.log('11) scan sin URL configurada:', scan.status, JSON.stringify(scan.body), '(esperado 400 con mensaje claro)');

  const badUrl = await call('/api/profile', { method: 'PUT', body: { product_url: 'x' }, token });
  console.log('12) PUT URL demasiado corta:', badUrl.status, JSON.stringify(badUrl.body), '(esperado 400)');

  const stats = await call('/api/stats', { token });
  const st = (stats.body as { stats?: { byDay: unknown[]; total: number; today: number } }).stats;
  console.log('13) stats:', stats.status, '| días en byDay:', st?.byDay?.length, '| total:', st?.total, '| today:', st?.today);

  const health = await call('/api/health');
  console.log('14) health:', health.status, JSON.stringify(health.body));

  const notFound = await call('/api/nada');
  console.log('15) endpoint inexistente:', notFound.status, JSON.stringify(notFound.body), '(esperado 404)');

  const badStatus = await call('/api/leads/00000000-0000-0000-0000-000000000000/status', {
    method: 'PATCH',
    body: { status: 'inventado' },
    token,
  });
  console.log('16) estado de lead inválido:', badStatus.status, JSON.stringify(badStatus.body), '(esperado 400)');

  const badFilter = await call('/api/leads?status=inventado', { token });
  console.log('17) filtro de estado inválido:', badFilter.status, JSON.stringify(badFilter.body), '(esperado 400)');

  const garbage = await call('/api/leads?minRelevance=abc&limit=xyz&offset=-5', { token });
  const gb = garbage.body as { limit: number; offset: number };
  console.log('18) query params basura:', garbage.status, '| limit:', gb.limit, '| offset:', gb.offset, '(esperado limit=25 offset=0)');

  const missingLead = await call('/api/leads/00000000-0000-0000-0000-000000000000', { token });
  console.log('19) lead inexistente:', missingLead.status, JSON.stringify(missingLead.body), '(esperado 404)');

  const replyMissing = await call('/api/leads/00000000-0000-0000-0000-000000000000/reply', {
    method: 'POST',
    token,
  });
  console.log('20) generar respuesta de lead inexistente:', replyMissing.status, JSON.stringify(replyMissing.body), '(esperado 404, no 500)');

  server.close();
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
