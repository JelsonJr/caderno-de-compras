import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import * as z from 'zod';

const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

// Formato "scrypt:N:r:p:salt:hash": os parâmetros ficam junto, então dá para aumentá-los no
// futuro sem invalidar hashes antigos
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, KEY_LENGTH, PARAMS);

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join(':');
}

// Os tamanhos são conferidos depois de decodificar: um hash truncado viraria uma chave de 0 bytes,
// e duas chaves vazias são "iguais" para qualquer senha digitada
const BASE64URL = /^[\w-]+$/;

const base64urlBytes = z
  .string()
  .regex(BASE64URL)
  .transform((value) => Buffer.from(value, 'base64url'));

const storedHashSchema = z
  .tuple([
    z.literal('scrypt'),
    z.coerce.number().int().positive(),
    z.coerce.number().int().positive(),
    z.coerce.number().int().positive(),
    base64urlBytes,
    base64urlBytes,
  ])
  .refine(
    ([, , , , salt, key]) => salt.length >= SALT_LENGTH && key.length === KEY_LENGTH,
    `O salt precisa ter pelo menos ${String(SALT_LENGTH)} bytes e a chave, ${String(KEY_LENGTH)} bytes`,
  );

export function isValidPasswordHash(storedHash: string): boolean {
  return storedHashSchema.safeParse(storedHash.split(':')).success;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [, N, r, p, salt, expected] = storedHashSchema.parse(storedHash.split(':'));
  const actual = await deriveKey(password, salt, KEY_LENGTH, { N, r, p });

  // Tempo constante: o tempo de resposta não revela "quão perto" a senha chegou
  return timingSafeEqual(actual, expected);
}
