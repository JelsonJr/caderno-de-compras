import { BlockList, isIP, isIPv4 } from 'node:net';
import { normalizeIP } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';

// Decide em quais conexões acreditar no X-Forwarded-For (o IP real do visitante). TRUST_PROXY
// aceita IPs, faixas CIDR, os atalhos do Fastify (loopback, linklocal, uniquelocal) e "unix":
// conexão por socket Unix, como a do LiteSpeed na Hostinger. Ela não tem endereço, e só um
// processo da própria máquina consegue abri-la, então do outro lado está o servidor web.

const NAMED_RANGES: Partial<Record<string, readonly string[]>> = {
  loopback: ['127.0.0.0/8', '::1/128'],
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

export type TrustProxyFn = (address: string | undefined, hop: number) => boolean;

function addRange(list: BlockList, range: string): void {
  const [address = '', prefix] = range.split('/');
  const type = isIPv4(address) ? 'ipv4' : 'ipv6';

  if (prefix === undefined) {
    list.addAddress(address, type);
  } else {
    list.addSubnet(address, Number(prefix), type);
  }
}

// O Fastify consulta cada salto: hop 0 é quem abriu a conexão; os seguintes vêm do
// X-Forwarded-For, do fim para o começo. O primeiro endereço não confiável é o do visitante.
export function buildTrustProxy(entries: readonly string[]): TrustProxyFn | false {
  if (entries.length === 0) {
    return false;
  }

  const trusted = new BlockList();
  const trustUnixSocket = entries.includes('unix');

  for (const entry of entries.filter((value) => value !== 'unix')) {
    for (const range of NAMED_RANGES[entry] ?? [entry]) {
      addRange(trusted, range);
    }
  }

  return (address, hop) => {
    if (address === undefined) {
      return trustUnixSocket && hop === 0;
    }

    // O X-Forwarded-For vem do cliente e pode trazer qualquer texto
    if (isIP(address) === 0) {
      return false;
    }

    return trusted.check(address, isIPv4(address) ? 'ipv4' : 'ipv6');
  };
}

// Igual à chave padrão do rate limit (IPv6 agrupado por /64), mas sem quebrar quando a conexão
// não tem IP (socket Unix sem X-Forwarded-For confiável): o padrão do plugin daria 500 em toda
// requisição. Os tipos do Fastify dizem que request.ip é sempre string, daí a conversão.
export function rateLimitKey(request: FastifyRequest): string {
  const ip = request.ip as string | undefined;

  return ip === undefined ? 'sem-ip' : normalizeIP(ip);
}
