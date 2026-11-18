import * as z from 'zod';
import '../zodLocale.ts';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const optionalUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https?$/, error: 'Informe um link começando com http(s)://' }))
    .optional(),
);

export const MAX_MONEY_CENTS = 2_147_483_647;

const BRL = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;
export const money = z
  .string()
  .trim()
  .transform((value) => value.replace(/^R\$\s*/, ''))
  .pipe(z.string().regex(BRL, 'Valor inválido. Ex.: 1.299,90'))
  .transform((value) => {
    const [reais = '', cents = ''] = value.replaceAll('.', '').split(',');

    return Number(reais) * 100 + Number(cents.padEnd(2, '0'));
  })
  .refine((cents) => cents <= MAX_MONEY_CENTS, 'Valor alto demais (máximo R$ 21.474.836,47)');

export const optionalMoney = z.preprocess(emptyToUndefined, money.optional());

export const optionalInt = (min: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^\d+$/, 'Informe um número inteiro')
      .transform(Number)
      .pipe(z.int().min(min).max(max))
      .optional(),
  );

export const checkbox = z
  .literal('on')
  .optional()
  .transform((value) => value === 'on');
