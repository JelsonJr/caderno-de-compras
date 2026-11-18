import { runMigrations } from '../db/migrate.ts';

try {
  await runMigrations({
    info: (message) => {
      console.log(message);
    },
    error: (details, message) => {
      console.error(message, details);
    },
  });
} catch {
  process.exitCode = 1;
}
