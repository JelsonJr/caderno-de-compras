import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkbox,
  MAX_MONEY_CENTS,
  money,
  optionalInt,
  optionalMoney,
  optionalText,
  optionalUrl,
} from './formFields.ts';

await test('money: converte o formato brasileiro para centavos', () => {
  const cases: [string, number][] = [
    ['1.299,90', 129990],
    ['1299,90', 129990],
    ['1299,9', 129990],
    ['1299', 129900],
    ['0,5', 50],
    ['0,05', 5],
    ['0', 0],
    ['4,35', 435], // 4.35 * 100 dá 434.99999... em ponto flutuante
    ['1.000.000,01', 100000001],
    ['  12,34  ', 1234],
    ['R$ 1.299,90', 129990],
    ['R$1.299,90', 129990],
    ['21.474.836,47', MAX_MONEY_CENTS],
  ];

  for (const [input, expected] of cases) {
    assert.equal(money.parse(input), expected, input);
  }
});

await test('money: recusa formatos inválidos e valores acima do INT do banco', () => {
  const invalid = [
    '',
    'abc',
    '-5',
    '1,299.90', // formato americano
    '1299.90',
    '1.29', // ponto sem grupo de 3 dígitos
    '12,345', // 3 casas decimais
    '1.2345,00',
    '21.474.836,48',
    '9'.repeat(400),
  ];

  for (const input of invalid) {
    assert.equal(money.safeParse(input).success, false, input);
  }
});

await test('money: mensagem de erro em português', () => {
  const result = money.safeParse('abc');
  assert.equal(result.error?.issues[0]?.message, 'Valor inválido. Ex.: 1.299,90');
});

await test('optionalMoney: campo vazio vira undefined', () => {
  assert.equal(optionalMoney.parse(''), undefined);
  assert.equal(optionalMoney.parse('   '), undefined);
  assert.equal(optionalMoney.parse(undefined), undefined);
  assert.equal(optionalMoney.parse('10'), 1000);
});

await test('optionalText: apara espaços, vazio vira undefined e respeita o máximo', () => {
  const schema = optionalText(5);
  assert.equal(schema.parse('  abc  '), 'abc');
  assert.equal(schema.parse(''), undefined);
  assert.equal(schema.parse('   '), undefined);
  assert.equal(schema.safeParse('abcdef').success, false);
  assert.match(schema.safeParse('abcdef').error?.issues[0]?.message ?? '', /caracteres/);
});

await test('optionalUrl: só aceita http(s)', () => {
  assert.equal(
    optionalUrl.parse('https://exemplo.com/produto?id=1'),
    'https://exemplo.com/produto?id=1',
  );

  assert.equal(optionalUrl.parse('http://exemplo.com'), 'http://exemplo.com');
  assert.equal(optionalUrl.parse(''), undefined);

  for (const input of [
    'javascript:alert(1)',
    'ftp://exemplo.com',
    'exemplo.com',
    'data:text/html,x',
  ]) {
    assert.equal(optionalUrl.safeParse(input).success, false, input);
  }
});

await test('optionalInt: só dígitos, dentro do intervalo', () => {
  const schema = optionalInt(1, 48);
  assert.equal(schema.parse('12'), 12);
  assert.equal(schema.parse(' 3 '), 3);
  assert.equal(schema.parse(''), undefined);

  for (const input of ['0', '49', '1e1', '0x10', '12.5', '-1', 'doze']) {
    assert.equal(schema.safeParse(input).success, false, input);
  }
});

await test('checkbox: marcado vira true, ausente vira false', () => {
  assert.equal(checkbox.parse('on'), true);
  assert.equal(checkbox.parse(undefined), false);
  assert.equal(checkbox.safeParse('sim').success, false);
});
