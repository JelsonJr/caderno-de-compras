import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { env } from '../config.ts';
import { render } from '../http.ts';
import { verifyPassword } from '../security/password.ts';
import { endSession, hasValidSession, startSession } from '../security/session.ts';

const loginBodySchema = z.object({
  password: z.string().min(1).max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/login', async (request, reply) => {
    if (hasValidSession(request)) {
      return reply.redirect('/', 303);
    }

    return render(reply, 'login', { error: null });
  });

  app.post(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = loginBodySchema.safeParse(request.body);

      if (!body.success) {
        return render(reply, 'login', { error: 'Informe a senha.' }, 400);
      }

      const valid = await verifyPassword(body.data.password, env.ADMIN_PASSWORD_HASH);

      if (!valid) {
        request.log.warn({ ip: request.ip }, 'Login com senha incorreta');

        return render(reply, 'login', { error: 'Senha incorreta.' }, 401);
      }

      return startSession(reply).redirect('/', 303);
    },
  );

  app.post('/logout', async (_request, reply) => endSession(reply).redirect('/login', 303));
}
