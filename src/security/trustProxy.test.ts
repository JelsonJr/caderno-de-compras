import assert from 'node:assert/strict';
import { request } from 'node:http';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import { buildTrustProxy, type TrustProxyFn } from './trustProxy.ts';

function trustFn(entries: string[]): TrustProxyFn {
  const trust = buildTrustProxy(entries);

  if (trust === false) {
    throw new Error('Esperava uma função de confiança');
  }

  return trust;
}

await test('trustProxy: vazio desliga a confiança', () => {
  assert.equal(buildTrustProxy([]), false);
});

await test('trustProxy: IPs, faixas e atalhos', () => {
  const trust = trustFn(['loopback', '10.0.0.0/8', '203.0.113.7', 'fd00::/8']);
  assert.equal(trust('127.0.0.1', 0), true);
  assert.equal(trust('127.9.9.9', 0), true);
  assert.equal(trust('::1', 0), true);
  assert.equal(trust('::ffff:127.0.0.1', 0), true); // IPv4 escrito como IPv6
  assert.equal(trust('10.20.30.40', 1), true);
  assert.equal(trust('203.0.113.7', 0), true);
  assert.equal(trust('203.0.113.8', 0), false);
  assert.equal(trust('fd12::1', 0), true);
  assert.equal(trust('177.10.20.30', 0), false);
  assert.equal(trust(undefined, 0), false);
});

await test('trustProxy: texto inválido no X-Forwarded-For não é confiável nem quebra', () => {
  const trust = trustFn(['loopback', 'unix']);

  for (const junk of ['', 'abc', 'unknown', '127.0.0.1:80', '<script>']) {
    assert.equal(trust(junk, 1), false, junk);
  }
});

await test('trustProxy: unix confia só no socket Unix (primeiro salto, sem endereço)', () => {
  const trust = trustFn(['unix']);
  assert.equal(trust(undefined, 0), true);
  assert.equal(trust(undefined, 1), false);
  assert.equal(trust('127.0.0.1', 0), false);
});

// Reproduz o LiteSpeed: o app escuta num socket Unix e o IP real chega no X-Forwarded-For
async function ipOverUnixSocket(trustEntries: string[], forwardedFor?: string): Promise<unknown> {
  const socketPath = path.join(tmpdir(), `caderno-trust-${String(process.pid)}.sock`);
  await rm(socketPath, { force: true });
  const app = Fastify({ trustProxy: buildTrustProxy(trustEntries) });
  app.get('/', (req) => ({ ip: (req.ip as string | undefined) ?? null }));
  await app.listen({ path: socketPath });

  try {
    return await new Promise((resolve, reject) => {
      const headers = forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor };

      const req = request({ socketPath, path: '/', headers }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));

        res.on('end', () => {
          resolve(JSON.parse(body));
        });
      });

      req.on('error', reject);
      req.end();
    });
  } finally {
    await app.close();
  }
}

await test('trustProxy: em socket Unix, "unix" lê o IP real do X-Forwarded-For', async () => {
  assert.deepEqual(await ipOverUnixSocket(['unix'], '177.10.20.30'), { ip: '177.10.20.30' });

  // O cliente pode mandar um X-Forwarded-For falso; vale o último, que o proxy acrescentou
  assert.deepEqual(await ipOverUnixSocket(['unix'], '1.2.3.4, 177.10.20.30'), {
    ip: '177.10.20.30',
  });

  assert.deepEqual(await ipOverUnixSocket(['loopback'], '177.10.20.30'), { ip: null });
});
