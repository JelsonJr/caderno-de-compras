import * as z from 'zod';
import { isValidPasswordHash } from './security/password.ts';
import './zodLocale.ts';

// Lista separada por vírgula; vazio = não confia em nenhum proxy (ver security/trustProxy.ts)
const proxyAddress = z.union(
  [
    z.enum(['unix', 'loopback', 'linklocal', 'uniquelocal']),
    z.ipv4(),
    z.ipv6(),
    z.cidrv4(),
    z.cidrv6(),
  ],
  { error: 'Use IPs, faixas CIDR (10.0.0.0/8) ou unix, loopback, linklocal, uniquelocal' },
);

export const trustProxySchema = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== ''),
  )
  .pipe(z.array(proxyAddress));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  TRUST_PROXY: trustProxySchema,
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'Precisa ter pelo menos 32 caracteres'),
  ADMIN_PASSWORD_HASH: z
    .string()
    .refine(isValidPasswordHash, 'Hash de senha inválido. Gere com: npm run hash-password'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error(`Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`);
  process.exit(1);
}

export const env = result.data;
export const isProduction = env.NODE_ENV === 'production';
