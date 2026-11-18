import type { FastifyReply, FastifyRequest } from 'fastify';
import { isProduction } from '../config.ts';

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// __Host- obriga o navegador a aceitar o cookie só via HTTPS e do próprio domínio; em localhost
// (sem HTTPS) o nome é simples
const SESSION_COOKIE = isProduction ? '__Host-session' : 'session';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
} as const;

// O cookie guarda só a data de expiração, assinada com o SESSION_SECRET: se o valor for alterado,
// a assinatura não bate e a sessão é recusada
export function startSession(reply: FastifyReply): FastifyReply {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

  const result: FastifyReply = reply.setCookie(SESSION_COOKIE, String(expiresAt), {
    ...cookieOptions,
    signed: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return result;
}

export function endSession(reply: FastifyReply): FastifyReply {
  const result: FastifyReply = reply.clearCookie(SESSION_COOKIE, cookieOptions);

  return result;
}

export function hasValidSession(request: FastifyRequest): boolean {
  const raw = request.cookies[SESSION_COOKIE];

  if (raw === undefined) {
    return false;
  }

  const result = request.unsignCookie(raw);

  if (!result.valid) {
    return false;
  }

  const expiresAt = Number(result.value);

  return Number.isInteger(expiresAt) && expiresAt > Date.now();
}
