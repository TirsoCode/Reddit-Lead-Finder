import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db.js';
import { hashPassword, issueDevToken, verifyPassword } from '../devJwt.js';
import { env } from '../env.js';
import { HttpError } from '../errors.js';

const credentials = z.object({
  email: z.string().email('Introduce un email válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

interface DevUserRow {
  id: string;
  email: string;
  password_hash: string;
}

/**
 * Registro/login por email para desarrollo local (`DEV_AUTH=true`).
 *
 * No sustituye a Supabase: en producción la autenticación va por Supabase
 * (email + Google OAuth) y este router ni siquiera se monta. Aquí los usuarios se
 * guardan en la tabla `auth.users` mínima que crea la migración en modo local,
 * de forma que las claves ajenas del esquema siguen siendo válidas.
 */
export const devAuthRouter = Router();

devAuthRouter.post('/auth/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    throw HttpError.badRequest(parsed.error.issues[0]?.message ?? 'Datos no válidos');
  }

  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  const existing = await queryOne<DevUserRow>(
    `select id, email, password_hash from auth.users where email = $1`,
    [email],
  );

  if (existing) {
    throw HttpError.conflict('Ya existe una cuenta con ese email. Inicia sesión.');
  }

  const user = await queryOne<DevUserRow>(
    `insert into auth.users (email, password_hash)
     values ($1, $2)
     returning id, email, password_hash`,
    [email, passwordHash],
  );

  if (!user) throw new HttpError(500, 'No se pudo crear la cuenta');

  res.status(201).json({
    token: issueDevToken(user.id, user.email, env.DEV_AUTH_SECRET),
    user: { id: user.id, email: user.email },
  });
});

devAuthRouter.post('/auth/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    throw HttpError.badRequest(parsed.error.issues[0]?.message ?? 'Datos no válidos');
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await queryOne<DevUserRow>(
    `select id, email, password_hash from auth.users where email = $1`,
    [email],
  );

  const valid = user ? await verifyPassword(parsed.data.password, user.password_hash) : false;
  if (!user || !valid) {
    throw HttpError.unauthorized('Email o contraseña incorrectos');
  }

  // El perfil lo crea el trigger handle_new_user; ensureProfile por si acaso.
  await query(`insert into public.profiles (id) values ($1) on conflict (id) do nothing`, [user.id]);

  res.json({
    token: issueDevToken(user.id, user.email, env.DEV_AUTH_SECRET),
    user: { id: user.id, email: user.email },
  });
});
