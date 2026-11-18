import { buildApp } from './app.ts';
import { env } from './config.ts';
import { runMigrations } from './db/migrate.ts';

// Sem top-level await aqui e nos módulos importados: na Hostinger, o LiteSpeed (lsnode.js) carrega
// o arquivo de entrada com require(), que falha com ERR_REQUIRE_ASYNC_MODULE nesse caso.
async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await runMigrations(app.log);
  } catch {
    await app.close();
    process.exit(1);
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Encerrando servidor');
    await app.close();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  try {
    // O LiteSpeed troca o listen pelo socket dele e só aceita uma chamada: com HOST=localhost o
    // Fastify faria duas (IPv4 e IPv6)
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (error) {
    app.log.error(error, 'Falha ao iniciar o servidor');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao iniciar o servidor', error);
  process.exit(1);
});
