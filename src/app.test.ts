import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildApp } from './app.ts';
import { trustProxySchema } from './config.ts';

// Senha cujo hash está em .env.test. Nenhum destes testes acessa o banco.
const TEST_PASSWORD = 'senha-de-teste-123';
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const SAME_ORIGIN = { ...FORM, 'sec-fetch-site': 'same-origin' };

// Fechado no fim do arquivo: um after() no topo rodaria logo depois do primeiro teste
const app = await buildApp();

function loginBody(password: string): string {
  return new URLSearchParams({ password }).toString();
}

await test('rota privada sem login redireciona para /login', async () => {
  const response = await app.inject({ method: 'GET', url: '/' });
  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/login');
});

await test('rota privada sem login, via htmx, recebe HX-Redirect', async () => {
  const response = await app.inject({ method: 'GET', url: '/', headers: { 'hx-request': 'true' } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['hx-redirect'], '/login');
});

await test('POST sem origem retorna 403', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/login',
    headers: FORM,
    payload: loginBody(TEST_PASSWORD),
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.cookies.length, 0);
});

await test('POST vindo de outro site retorna 403', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/logout',
    headers: { ...FORM, 'sec-fetch-site': 'cross-site' },
  });

  assert.equal(response.statusCode, 403);
});

await test('senha errada retorna 401 sem criar sessão', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/login',
    headers: SAME_ORIGIN,
    payload: loginBody('senha-errada'),
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.body, /Senha incorreta/);
  assert.equal(response.cookies.length, 0);
});

await test('senha certa cria o cookie de sessão', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/login',
    // Navegador sem Sec-Fetch-Site: vale a comparação do Origin com o host
    headers: { ...FORM, origin: 'http://localhost', host: 'localhost' },
    payload: loginBody(TEST_PASSWORD),
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/');

  const cookie = response.cookies.find((item) => item.name === 'session');
  assert.ok(cookie, 'cookie "session" não foi criado');
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax');
  assert.equal(cookie.path, '/');

  // O cookie dá acesso a uma rota privada (o formulário de novo item não usa o banco)
  const privatePage = await app.inject({
    method: 'GET',
    url: '/items/new',
    cookies: { session: cookie.value },
  });

  assert.equal(privatePage.statusCode, 200);
  assert.match(privatePage.body, /Novo item/);
});

await test('cookie de sessão adulterado não dá acesso', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/items/new',
    cookies: { session: `${String(Date.now() + 60_000)}.assinatura-falsa` },
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/login');
});

// O CDN da Hostinger guardava o redirect "/ -> /login" e causava loop depois do login
await test('respostas dinâmicas não podem ser guardadas em cache; estáticos podem', async () => {
  for (const url of ['/', '/login', '/nao-existe']) {
    const response = await app.inject({ method: 'GET', url });

    assert.equal(response.headers['cache-control'], 'private, no-store', url);
  }

  const css = await app.inject({ method: 'GET', url: '/static/app.css' });

  assert.equal(css.statusCode, 200);
  assert.match(String(css.headers['cache-control']), /^public/);
});

await test('página inexistente vira HTML 404', async () => {
  const response = await app.inject({ method: 'GET', url: '/nao-existe' });
  assert.equal(response.statusCode, 404);
  assert.match(String(response.headers['content-type']), /text\/html/);
  assert.match(response.body, /Página não encontrada/);
});

await test('TRUST_PROXY: aceita IPs, faixas e atalhos; recusa o resto', () => {
  assert.deepEqual(trustProxySchema.parse(''), []);
  assert.deepEqual(trustProxySchema.parse(undefined), []);

  assert.deepEqual(trustProxySchema.parse(' loopback , 10.0.0.0/8,::1 '), [
    'loopback',
    '10.0.0.0/8',
    '::1',
  ]);

  for (const value of ['1', 'abc', '10.0.0.0/33', 'true']) {
    assert.equal(trustProxySchema.safeParse(value).success, false, value);
  }
});

// Como o LiteSpeed na Hostinger: socket Unix, sem IP na conexão
await test('app escutando em socket Unix responde sem erro, mesmo sem IP', async () => {
  const socketPath = path.join(tmpdir(), `caderno-app-${String(process.pid)}.sock`);
  await rm(socketPath, { force: true });
  await app.listen({ path: socketPath });

  const statusCode = await new Promise<number | undefined>((resolve, reject) => {
    const req = request({ socketPath, path: '/login' }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });

    req.on('error', reject);
    req.end();
  });

  assert.equal(statusCode, 200);
});

await app.close();
