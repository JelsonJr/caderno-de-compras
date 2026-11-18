import type { ConnectionOptions } from 'mysql2/promise';
import { env } from '../config.ts';

export const connectionOptions = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: 'UTF8MB4_UNICODE_CI',
  timezone: 'Z',
} satisfies ConnectionOptions;

// Deixa o MySQL 8.4 (dev) e o MariaDB 11 (produção) iguais: CURRENT_TIMESTAMP em UTC (o fuso do
// servidor da hospedagem pode ser outro) e sql_mode estrito, para que texto longo ou valor
// inválido gerem erro em vez de serem truncados.
export const SESSION_SETUP_SQL =
  "SET time_zone = '+00:00', sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES," +
  "NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'";
