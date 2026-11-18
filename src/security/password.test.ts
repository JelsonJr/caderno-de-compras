import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, isValidPasswordHash, verifyPassword } from './password.ts';

await test('senha: hash no formato scrypt:N:r:p:salt:chave', async () => {
  const hash = await hashPassword('uma senha qualquer');
  assert.match(hash, /^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/);
  assert.equal(isValidPasswordHash(hash), true);
});

await test('senha: verifica a senha certa e recusa a errada', async () => {
  const hash = await hashPassword('senha-correta-123');
  assert.equal(await verifyPassword('senha-correta-123', hash), true);
  assert.equal(await verifyPassword('senha-errada-123', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

await test('senha: a mesma senha gera hashes diferentes (salt aleatório)', async () => {
  const [first, second] = await Promise.all([hashPassword('repetida'), hashPassword('repetida')]);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('repetida', first), true);
  assert.equal(await verifyPassword('repetida', second), true);
});

await test('senha: hash truncado é inválido e nunca aceita senha', async () => {
  // Chave de 0 bytes: sem a checagem de tamanho, qualquer senha "bateria"
  const truncated = 'scrypt:1024:8:1:AAAAAAAAAAAAAAAAAAAAAA:A';
  assert.equal(isValidPasswordHash(truncated), false);
  await assert.rejects(verifyPassword('qualquer', truncated));
});

await test('senha: formatos inválidos', () => {
  for (const hash of ['', 'scrypt:', 'bcrypt:1:2:3:abc:def', 'scrypt:a:b:c:d:e', 'texto']) {
    assert.equal(isValidPasswordHash(hash), false, hash);
  }
});
