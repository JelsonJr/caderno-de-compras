import assert from 'node:assert/strict';
import { test } from 'node:test';
import { money } from './models/formFields.ts';
import { computeOfferCost } from './models/offer.ts';
import { centsToInput, formatMoney, installmentText } from './viewHelpers.ts';

// O Intl usa espaço não separável entre "R$" e o número
const brl = (text: string) => text.replaceAll(' ', ' ');

await test('formatMoney: centavos para reais', () => {
  assert.equal(brl(formatMoney(129990)), 'R$ 1.299,90');
  assert.equal(brl(formatMoney(5)), 'R$ 0,05');
  assert.equal(brl(formatMoney(0)), 'R$ 0,00');
});

await test('centsToInput: volta para o formato do formulário e o parse lê de volta', () => {
  assert.equal(centsToInput(129990), '1.299,90');
  assert.equal(centsToInput(null), '');

  for (const cents of [0, 5, 50, 435, 129990, 100000001, 2_147_483_647]) {
    assert.equal(money.parse(centsToInput(cents)), cents, String(cents));
  }
});

function withCost(fields: {
  priceCents: number | null;
  installments: number | null;
  installmentCents: number | null;
  interestFree: boolean | null;
}) {
  return { ...fields, cost: computeOfferCost({ ...fields, shippingCents: null }) };
}

await test('installmentText: sem juros, com juros e sem como comparar', () => {
  assert.equal(
    brl(
      installmentText(
        withCost({
          priceCents: 120000,
          installments: 12,
          installmentCents: 10000,
          interestFree: null,
        }),
      ),
    ),
    '12x de R$ 100,00 sem juros',
  );

  assert.equal(
    brl(
      installmentText(
        withCost({
          priceCents: 100000,
          installments: 12,
          installmentCents: 10000,
          interestFree: true,
        }),
      ),
    ),
    '12x de R$ 100,00 com juros (+R$ 200,00)',
  );

  assert.equal(
    brl(
      installmentText(
        withCost({
          priceCents: null,
          installments: 10,
          installmentCents: 9500,
          interestFree: true,
        }),
      ),
    ),
    '10x de R$ 95,00 sem juros',
  );

  assert.equal(
    brl(
      installmentText(
        withCost({
          priceCents: null,
          installments: 10,
          installmentCents: 9500,
          interestFree: false,
        }),
      ),
    ),
    '10x de R$ 95,00',
  );

  assert.equal(
    installmentText(
      withCost({ priceCents: 100, installments: null, installmentCents: null, interestFree: null }),
    ),
    '',
  );
});
