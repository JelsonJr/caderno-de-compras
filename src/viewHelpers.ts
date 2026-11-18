import { ITEM_STATUS_LABELS, ITEM_STATUSES } from './models/item.ts';
import { CONDITION_LABELS, CONDITIONS, type Offer, type OfferCost } from './models/offer.ts';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(cents: number): string {
  return currency.format(cents / 100);
}

// 129990 -> "1.299,90", o formato aceito de volta pelo campo de dinheiro
export function centsToInput(cents: number | null): string {
  return cents === null ? '' : decimal.format(cents / 100);
}

// "12x de R$ 100,00 sem juros" ou "12x de R$ 110,00 com juros (+R$ 120,00)"
export function installmentText(
  offer: Pick<Offer, 'priceCents' | 'installments' | 'installmentCents' | 'interestFree'> & {
    cost: OfferCost;
  },
): string {
  if (offer.installments === null || offer.installmentCents === null) {
    return '';
  }

  const base = `${String(offer.installments)}x de ${formatMoney(offer.installmentCents)}`;

  if (offer.cost.interestCents !== null) {
    return `${base} com juros (+${formatMoney(offer.cost.interestCents)})`;
  }

  // Com preço à vista dá para conferir; sem ele, vale o que foi marcado no cadastro
  if (offer.priceCents !== null || offer.interestFree === true) {
    return `${base} sem juros`;
  }

  return base;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`;
}

export const viewHelpers = {
  formatMoney,
  centsToInput,
  installmentText,
  plural,
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  CONDITIONS,
  CONDITION_LABELS,
};
