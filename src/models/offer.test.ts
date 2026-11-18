import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  $offerInput,
  computeOfferCost,
  lowestAvailableCost,
  type Offer,
  sortOffersByCost,
} from './offer.ts';

const noValues = {
  priceCents: null,
  installments: null,
  installmentCents: null,
  shippingCents: null,
};

function makeOffer(id: number, fields: Partial<Offer>): Offer {
  const date = new Date('2026-01-01T00:00:00Z');

  return {
    id,
    itemId: 1,
    seller: `Oferta ${String(id)}`,
    url: null,
    condition: null,
    interestFree: null,
    location: null,
    notes: null,
    available: true,
    createdAt: date,
    updatedAt: date,
    ...noValues,
    ...fields,
  };
}

await test('custo: preço à vista + frete', () => {
  assert.deepEqual(computeOfferCost({ ...noValues, priceCents: 100000, shippingCents: 5000 }), {
    totalCents: 105000,
    installmentTotalCents: null,
    interestCents: null,
  });
});

await test('custo: frete não informado conta como zero', () => {
  assert.equal(computeOfferCost({ ...noValues, priceCents: 100000 }).totalCents, 100000);
});

await test('custo: sem preço à vista, usa parcelas × valor da parcela + frete', () => {
  const cost = computeOfferCost({
    ...noValues,
    installments: 10,
    installmentCents: 9500,
    shippingCents: 2000,
  });

  assert.deepEqual(cost, { totalCents: 97000, installmentTotalCents: 95000, interestCents: null });
});

await test('custo: sem nenhum valor é null', () => {
  assert.deepEqual(computeOfferCost(noValues), {
    totalCents: null,
    installmentTotalCents: null,
    interestCents: null,
  });

  assert.equal(computeOfferCost({ ...noValues, shippingCents: 1000 }).totalCents, null);
});

await test('custo: à vista + parcelado mais caro indica os juros', () => {
  const cost = computeOfferCost({
    ...noValues,
    priceCents: 100000,
    installments: 12,
    installmentCents: 10000,
    shippingCents: 5000,
  });

  assert.deepEqual(cost, {
    totalCents: 105000,
    installmentTotalCents: 120000,
    interestCents: 20000,
  });
});

await test('custo: à vista + parcelado com o mesmo total não tem juros', () => {
  const cost = computeOfferCost({
    ...noValues,
    priceCents: 120000,
    installments: 12,
    installmentCents: 10000,
  });

  assert.equal(cost.installmentTotalCents, 120000);
  assert.equal(cost.interestCents, null);
});

await test('custo: parcelamento incompleto é ignorado', () => {
  const cost = computeOfferCost({ ...noValues, installments: 12 });
  assert.deepEqual(cost, { totalCents: null, installmentTotalCents: null, interestCents: null });
});

await test('ordenação: menor custo primeiro, sem valor e indisponíveis no fim', () => {
  const offers = [
    makeOffer(1, {}), // sem valor
    makeOffer(2, { priceCents: 50000, available: false }), // a mais barata, mas indisponível
    makeOffer(3, { priceCents: 120000 }),
    makeOffer(4, { installments: 10, installmentCents: 9000 }), // 90.000
    makeOffer(5, { priceCents: 90000 }), // empata com a 4; fica depois por ter id maior
    makeOffer(6, { available: false }),
  ];

  assert.deepEqual(
    sortOffersByCost(offers).map((offer) => offer.id),
    [4, 5, 3, 1, 2, 6],
  );
});

await test('ordenação: não altera o array recebido', () => {
  const offers = [makeOffer(1, { priceCents: 2 }), makeOffer(2, { priceCents: 1 })];
  sortOffersByCost(offers);

  assert.deepEqual(
    offers.map((offer) => offer.id),
    [1, 2],
  );
});

await test('menor custo da lista: só ofertas disponíveis e com valor', () => {
  const offers = [
    { ...noValues, priceCents: 1000, available: false },
    { ...noValues, available: true },
    { ...noValues, priceCents: 5000, shippingCents: 500, available: true },
    { ...noValues, installments: 2, installmentCents: 2000, available: true },
  ];

  assert.equal(lowestAvailableCost(offers), 4000);
  assert.equal(lowestAvailableCost([]), null);
  assert.equal(lowestAvailableCost([{ ...noValues, available: true }]), null);
});

await test('formulário de oferta: parcelas e valor da parcela andam juntos', () => {
  const onlyInstallments = $offerInput.safeParse({ seller: 'Loja', installments: '10' });

  assert.deepEqual(
    onlyInstallments.error?.issues.map((issue) => issue.path),
    [['installmentValue']],
  );

  const onlyValue = $offerInput.safeParse({ seller: 'Loja', installmentValue: '100' });

  assert.deepEqual(
    onlyValue.error?.issues.map((issue) => issue.path),
    [['installments']],
  );

  const both = $offerInput.parse({ seller: 'Loja', installments: '10', installmentValue: '100' });
  assert.equal(both.installments, 10);
  assert.equal(both.installmentValue, 10000);
});
