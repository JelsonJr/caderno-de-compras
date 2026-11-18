import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasValidSession } from './session.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Proteção CSRF: requisições que alteram dados só são aceitas se vierem do próprio site
export async function verifySameOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  const fetchSite = request.headers['sec-fetch-site'];

  if (fetchSite !== undefined) {
    if (fetchSite === 'same-origin') {
      return;
    }

    return reply.code(403).send({ error: 'Requisição de outra origem bloqueada' });
  }

  // Navegadores sem Sec-Fetch-Site: compara o Origin com o host
  const origin = request.headers.origin;

  if (origin !== undefined && URL.parse(origin)?.host === request.host) {
    return;
  }

  return reply.code(403).send({ error: 'Origem ausente ou inválida' });
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (hasValidSession(request)) {
    return;
  }

  // O htmx não segue redirect de página inteira; ele precisa do HX-Redirect
  if (request.headers['hx-request'] === 'true') {
    return reply.code(401).header('HX-Redirect', '/login').send();
  }

  return reply.redirect('/login', 303);
}
