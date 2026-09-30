import { createHmac, timingSafeEqual } from 'node:crypto';

interface JwtPayload {
  sub: string;
  email: string | null;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='), 'base64');
}

function signature(data: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest());
}

/** JWT HS256 mínimo, solo para el modo de desarrollo local. */
export function issueDevToken(
  userId: string,
  email: string,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ sub: userId, email, iat: now, exp: now + ttlSeconds } satisfies JwtPayload),
  );
  const data = `${header}.${payload}`;
  return `${data}.${signature(data, secret)}`;
}

export function verifyDevToken(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, provided] = parts as [string, string, string];
  const expected = signature(`${header}.${payload}`, secret);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let decoded: JwtPayload;
  try {
    decoded = JSON.parse(fromBase64url(payload).toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }

  if (!decoded.sub || typeof decoded.exp !== 'number' || decoded.exp * 1000 < Date.now()) {
    return null;
  }

  return decoded;
}

/** Hash de contraseña para el modo local. scrypt viene incluido en Node. */
export async function hashPassword(password: string): Promise<string> {
  const { scrypt, randomBytes } = await import('node:crypto');
  const salt = randomBytes(16).toString('hex');
  const derived = (await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  })).toString('hex');
  return `${salt}:${derived}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;

  const { scrypt } = await import('node:crypto');
  const derived = (await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => (error ? reject(error) : resolve(key)));
  })).toString('hex');

  const a = Buffer.from(derived);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
