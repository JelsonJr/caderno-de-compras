import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import * as z from 'zod';
import { connectionOptions, SESSION_SETUP_SQL } from './options.ts';
import { schemaMigrations } from './schema.ts';

export const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'migrations');

const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;
const LOCK_NAME = 'caderno_compras_migrations';
const LOCK_TIMEOUT_SECONDS = 60;

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`;

const $lockResult = z.tuple([z.object({ acquired: z.literal(1) })]);

export interface MigrationLogger {
  info: (message: string) => void;
  error: (details: object, message: string) => void;
}

export interface MigrationFile {
  version: string;
  name: string;
}

export async function listMigrationFiles(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const seen = new Set<string>();

  return names.map((name) => {
    const version = FILE_PATTERN.exec(name)?.[1];

    if (version === undefined) {
      throw new Error(
        `Nome de migration inválido: ${name}. Use NNN_descricao.sql (ex.: 002_add_x.sql)`,
      );
    }

    if (seen.has(version)) {
      throw new Error(`Há duas migrations com o número ${version}`);
    }

    seen.add(version);

    return { version, name };
  });
}

// Impede que dois processos subindo ao mesmo tempo apliquem a mesma migration
async function acquireLock(connection: Connection): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS acquired', [
    LOCK_NAME,
    LOCK_TIMEOUT_SECONDS,
  ]);

  if (!$lockResult.safeParse(rows).success) {
    throw new Error('Outra execução das migrations está em andamento (lock não obtido)');
  }
}

// Conexão própria com multipleStatements, que fica desligado no pool da aplicação
export async function runMigrations(logger: MigrationLogger): Promise<void> {
  const files = await listMigrationFiles();

  const connection = await mysql.createConnection({
    ...connectionOptions,
    multipleStatements: true,
  });

  const db = drizzle({ client: connection });

  try {
    await connection.query(SESSION_SETUP_SQL);
    await acquireLock(connection);
    await connection.query(CREATE_MIGRATIONS_TABLE);

    const applied = await db.select({ version: schemaMigrations.version }).from(schemaMigrations);
    const appliedVersions = new Set(applied.map((row) => row.version));
    const pending = files.filter((file) => !appliedVersions.has(file.version));

    if (pending.length === 0) {
      logger.info('Migrations: banco atualizado, nada pendente');

      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file.name), 'utf8');

      logger.info(`Migrations: aplicando ${file.name}`);

      try {
        await connection.query(sql);
      } catch (error) {
        // DDL faz commit implícito no MySQL e no MariaDB: não há rollback, e os comandos
        // anteriores ao que falhou já ficaram no banco
        logger.error(
          { err: error },
          `Migrations: FALHA em ${file.name}. Ela NÃO foi registrada em schema_migrations. ` +
            'Os comandos anteriores ao que falhou podem já ter sido aplicados (DDL não tem ' +
            'rollback). Confira o banco, desfaça ou complete à mão o que ficou pela metade, ' +
            'corrija o arquivo e rode de novo (npm run migrate ou reiniciando o app).',
        );

        throw error;
      }

      await db.insert(schemaMigrations).values({ version: file.version, name: file.name });
      logger.info(`Migrations: ${file.name} aplicada`);
    }
  } finally {
    // Fechar a conexão também libera o GET_LOCK
    await connection.end();
  }
}
