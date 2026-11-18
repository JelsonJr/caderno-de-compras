import { isNotNil, mean, sortBy } from 'es-toolkit';
import * as z from 'zod';
import { checkbox, optionalInt, optionalMoney, optionalText, optionalUrl } from './formFields.ts';

export const CONDITIONS = ['new', 'used', 'refurbished'] as const;
export const $condition = z.enum(CONDITIONS);
export type Condition = z.infer<typeof $condition>;

export const CONDITION_LABELS = {
  new: 'Novo',
  used: 'Usado',
  refurbished: 'Recondicionado',
} as const satisfies Record<Condition, string>;

export type Offer = z.infer<typeof $offer>;
export const $offer = z.object({
  id: z.int().positive(),
  itemId: z.int().positive(),
  seller: z.string(),
  url: z.string().nullable(),
  priceCents: z.int().nullable(),
  condition: $condition.nullable(),
  installments: z.int().nullable(),
  installmentCents: z.int().nullable(),
  interestFree: z.boolean().nullable(),
  shippingCents: z.int().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  available: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type OfferInput = z.infer<typeof $offerInput>;
export const $offerInput = z
  .object({
    seller: z.string().trim().min(1, 'Informe a loja ou vendedor').max(120),
    url: optionalUrl,
    price: optionalMoney,
    condition: z.preprocess((v) => (v === '' ? undefined : v), $condition.optional()),
    installments: optionalInt(1, 48),
    installmentValue: optionalMoney,
    interestFree: checkbox,
    shipping: optionalMoney,
    location: optionalText(120),
    notes: optionalText(2000),
  })
  // Parcelamento exige os dois campos: número de parcelas e valor de cada uma
  .superRefine((offer, ctx) => {
    if (offer.installments !== undefined && offer.installmentValue === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['installmentValue'],
        message: 'Informe o valor da parcela',
      });
    }

    if (offer.installmentValue !== undefined && offer.installments === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['installments'],
        message: 'Informe o número de parcelas',
      });
    }
  });

type CostFields = Pick<Offer, 'priceCents' | 'installments' | 'installmentCents' | 'shippingCents'>;

export interface OfferCost {
  totalCents: number | null;
  installmentTotalCents: number | null;
  interestCents: number | null;
}

// Regra do custo total (frete ausente conta como zero):
// - com preço à vista: preço + frete; se também houver parcelamento, calcula o total parcelado
//   e indica juros quando ele passa do preço à vista;
// - sem preço à vista, com parcelamento: parcelas × valor da parcela + frete;
// - sem nenhum valor: null.
export function computeOfferCost(offer: CostFields): OfferCost {
  const shipping = offer.shippingCents ?? 0;

  const installmentTotalCents =
    offer.installments !== null && offer.installmentCents !== null
      ? offer.installments * offer.installmentCents
      : null;

  if (offer.priceCents !== null) {
    const interestCents =
      installmentTotalCents !== null && installmentTotalCents > offer.priceCents
        ? installmentTotalCents - offer.priceCents
        : null;

    return { totalCents: offer.priceCents + shipping, installmentTotalCents, interestCents };
  }

  if (installmentTotalCents !== null) {
    return {
      totalCents: installmentTotalCents + shipping,
      installmentTotalCents,
      interestCents: null,
    };
  }

  return { totalCents: null, installmentTotalCents: null, interestCents: null };
}

export type OfferWithCost = Offer & { cost: OfferCost };

// Ordem da página do item: disponíveis antes das indisponíveis; em cada grupo, menor custo
// primeiro e ofertas sem valor no fim; no empate, a cadastrada antes.
export function sortOffersByCost(offers: readonly Offer[]): OfferWithCost[] {
  const withCost = offers.map((offer) => ({ ...offer, cost: computeOfferCost(offer) }));

  return sortBy(withCost, [
    (offer) => !offer.available,
    (offer) => offer.cost.totalCents === null,
    (offer) => offer.cost.totalCents,
    'id',
  ]);
}

export const COST_BASES = ['lowest', 'highest', 'average'] as const;
export const $costBasis = z.enum(COST_BASES);
export type CostBasis = z.infer<typeof $costBasis>;

export const COST_BASIS_LABELS = {
  lowest: 'Menor custo',
  highest: 'Maior custo',
  average: 'Custo médio',
} as const satisfies Record<CostBasis, string>;

// Custo do item na lista: considera só as ofertas disponíveis e com valor
export function availableCost(
  offers: readonly (CostFields & Pick<Offer, 'available'>)[],
  basis: CostBasis,
): number | null {
  const costs = offers
    .filter((offer) => offer.available)
    .map((offer) => computeOfferCost(offer).totalCents)
    .filter(isNotNil);

  if (costs.length === 0) {
    return null;
  }

  if (basis === 'lowest') {
    return Math.min(...costs);
  }

  if (basis === 'highest') {
    return Math.max(...costs);
  }

  return Math.round(mean(costs));
}
