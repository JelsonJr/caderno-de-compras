import type { FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';

const HTML = 'text/html; charset=utf-8';

const $idParams = z.object({
  id: z
    .string()
    .regex(/^\d{1,10}$/)
    .transform(Number)
    .pipe(z.int().positive().max(4_294_967_295)),
});

const $formBody = z.record(z.string(), z.unknown()).catch({});

export function isHtmx(request: FastifyRequest): boolean {
  return request.headers['hx-request'] === 'true';
}

// O CDN da Hostinger guarda respostas sem Cache-Control, inclusive redirects: um "/ -> /login"
// guardado de antes do login deixava o navegador em loop. Os estáticos mantêm o cache deles.
export async function preventCaching(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!reply.hasHeader('cache-control')) {
    reply.header('cache-control', 'private, no-store');
  }
}

// Ao restaurar o histórico (voltar sem cache), o htmx pede a página inteira, não o trecho
export function wantsPartial(request: FastifyRequest): boolean {
  return isHtmx(request) && request.headers['hx-history-restore-request'] !== 'true';
}

export async function render(
  reply: FastifyReply,
  page: string,
  data: object,
  statusCode = 200,
): Promise<FastifyReply> {
  const html = await reply.viewAsync(page, data);

  // Vary: a mesma URL devolve página inteira ou trecho, conforme o cabeçalho do htmx
  return reply.code(statusCode).type(HTML).header('Vary', 'HX-Request').send(html);
}

// Com htmx, um 303 seria seguido pelo próprio htmx e a página inteira cairia dentro do trecho
// alvo; por isso ele recebe HX-Redirect. Sem JavaScript, vale o 303 (POST -> redirect -> GET).
export function redirectAfterPost(
  request: FastifyRequest,
  reply: FastifyReply,
  url: string,
): FastifyReply {
  if (isHtmx(request)) {
    return reply.header('HX-Redirect', url).code(204).send();
  }

  return reply.redirect(url, 303);
}

export function parseId(params: unknown): number | null {
  const result = $idParams.safeParse(params);

  return result.success ? result.data.id : null;
}

export function formValues(body: unknown): Record<string, string> {
  const entries = Object.entries($formBody.parse(body));

  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const [field] = issue.path;

    if (typeof field === 'string' && !(field in errors)) {
      errors[field] = issue.message;
    }
  }

  return errors;
}
