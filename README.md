# Caderno de Compras

App pessoal para anotar o que quero comprar (ex.: sofá) e comparar ofertas de cada item: loja ou
pessoa, link, preço à vista, parcelamento, frete, condição, local e observações. A página do item
ordena as ofertas pelo custo total, destaca a mais barata e marca a escolhida.

Um único usuário, com login por senha. Feito para usar principalmente pelo celular.

**Stack:** Node 24 (ESM, TypeScript 6), Fastify 5, MySQL 8.4 (dev) / MariaDB 11 (produção) com
Drizzle ORM sobre mysql2, zod 4, es-toolkit, templates Eta com htmx 2 servido localmente, CSS
próprio.

## Rodando localmente

Pré-requisitos: Node 24 e Docker.

```sh
npm install
npm run db:up                  # sobe o MySQL 8.4 em 127.0.0.1:3306
cp .env.example .env
```

Preencha no `.env`:

- `SESSION_SECRET`: gere com
  `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`
- `ADMIN_PASSWORD_HASH`: rode `npm run hash-password`, digite a senha (mínimo de 12 caracteres) e
  cole a linha que ele imprime.

Depois:

```sh
npm run dev                    # http://localhost:3000
```

As migrations pendentes rodam sozinhas quando o servidor inicia. Os valores de banco do
`.env.example` já são os do `docker-compose.yml`.

## Scripts

| Script                  | O que faz                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Roda `src/server.ts` direto (o Node remove os tipos) e reinicia ao salvar. Lê o `.env`.              |
| `npm run build`         | Apaga `dist/` e compila `src/` para `dist/` com `tsconfig.build.json` (sem os arquivos `*.test.ts`). |
| `npm start`             | Roda o build (`dist/server.js`), lendo o `.env` se existir. Na Hostinger não é usado (ver abaixo).   |
| `npm test`              | Testes com o `node:test` (`src/**/*.test.ts`), usando o `.env.test`. Não precisam de banco.          |
| `npm run check`         | `typecheck` + `lint` + `format:check`. Precisa passar antes de qualquer commit.                      |
| `npm run typecheck`     | `tsc --noEmit`.                                                                                      |
| `npm run lint`          | ESLint (typescript-eslint estrito + estilo do projeto). `lint:fix` corrige o que der.                |
| `npm run format`        | Prettier em tudo. `format:check` só confere.                                                         |
| `npm run migrate`       | Aplica as migrations pendentes sem subir o servidor.                                                 |
| `npm run hash-password` | Pede uma senha e imprime a linha `ADMIN_PASSWORD_HASH=...`.                                          |
| `npm run db:up`         | Sobe o MySQL do `docker-compose.yml` e espera ficar pronto.                                          |
| `npm run db:down`       | Para o container (os dados ficam no volume `mysql_data`).                                            |
| `npm run db:shell`      | Abre o cliente `mysql` dentro do container.                                                          |

## Organização

```
migrations/        SQL das migrations (NNN_descricao.sql)
public/            arquivos estáticos (/static/...)
views/             templates Eta (páginas, trechos para o htmx com "_" no nome, partials/)
src/
  server.ts        ponto de entrada: migrations + listen
  app.ts           plugins, rotas públicas e o bloco privado (requireAuth)
  errors.ts        HttpError e páginas de erro (404, 429, 5xx...)
  http.ts          helpers de resposta (render, redirect pós-POST, htmx, formulários)
  config.ts        variáveis de ambiente validadas (único lugar que lê process.env)
  db/              conexão (pool + Drizzle), schema do Drizzle e runner de migrations
  models/          schemas zod, regra de custo total
  repositories/    consultas com o Drizzle (parâmetros sempre como placeholders)
  routes/          login, itens e ofertas
  security/        senha, sessão, CSRF/autenticação, confiança no proxy
  cli/             hash-password e migrate
```

Dinheiro é sempre guardado e processado em centavos (`INT`); a formatação em reais acontece só na
tela (`src/viewHelpers.ts`).

## Estilo de código

O ESLint impõe chaves em todo `if` e linhas em branco antes do `return` e em volta de blocos e de
comandos de várias linhas; `npm run lint:fix` ajusta sozinho. Comentários só para regras de negócio
ou decisões que o código não deixa claras.

## Banco e migrations

- Cada arquivo em `migrations/` é aplicado uma vez, em ordem numérica, e registrado na tabela
  `schema_migrations`. Um lock (`GET_LOCK`) evita que dois processos apliquem ao mesmo tempo.
- Para mudar o banco, crie um arquivo novo (`003_add_algo.sql`). Nunca edite uma migration que já
  rodou em produção.
- As migrations são a fonte da verdade. O `src/db/schema.ts` (Drizzle) espelha as colunas que o
  código usa: ao criar ou mudar uma coluna, atualize os dois. FKs, CHECKs e índices ficam só no
  SQL.
- O SQL precisa funcionar no MySQL 8.4 **e** no MariaDB 11: nada de `RETURNING`, de collation
  `utf8mb4_0900_*` ou de outro recurso exclusivo de um dos dois. Declare `ENGINE`, `CHARSET` e
  `COLLATE` em toda tabela.
- **Se uma migration falhar**, o log mostra o arquivo e o erro, ela não é registrada e o servidor
  não sobe. Como DDL (`CREATE`/`ALTER`) faz commit implícito, os comandos anteriores ao que falhou
  já ficaram no banco. Confira o estado, desfaça ou complete à mão, corrija o arquivo e reinicie.
- Toda conexão usa `time_zone = '+00:00'` (datas em UTC) e o `sql_mode` estrito do MySQL 8, para
  que os dois bancos se comportem igual (`src/db/options.ts`).

## Deploy na Hostinger (plano Business)

A Hostinger roda o app com o LiteSpeed: ele instala as dependências, roda o comando de build e
carrega o **arquivo de entrada** (não usa `npm start`). As requisições chegam por um socket do
próprio LiteSpeed; host e porta passados ao `listen` são ignorados.

### 1. Banco de dados

No hPanel, em **Bancos de dados → Gerenciamento**, crie um banco MariaDB com usuário e senha
(a Hostinger acrescenta um prefixo como `u123456789_` ao nome e ao usuário). Anote os três.

As tabelas são criadas pelas migrations no primeiro start; não é preciso importar nada.

### 2. App Node.js

Em **Websites → Adicionar site → Node.js**, importe o repositório do GitHub (cada push faz um novo
deploy) ou envie um `.zip` do projeto sem `node_modules/`, `dist/` e `.env`.

Configurações de build:

| Campo           | Valor            |
| --------------- | ---------------- |
| Framework       | Other            |
| Node.js         | 24.x             |
| Package manager | npm              |
| Build command   | `npm run build`  |
| Entry file      | `dist/server.js` |

### 3. Variáveis de ambiente

Cadastre no passo **Environment Variables** (ou depois, no painel do app). Mudanças nas variáveis
só valem depois de reiniciar ou fazer novo deploy.

| Variável              | Valor                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `production`                                                                          |
| `TRUST_PROXY`         | `unix` (confirme depois do primeiro deploy, passo 4)                                  |
| `DB_HOST`             | `127.0.0.1` (se não conectar, tente `localhost`)                                      |
| `DB_PORT`             | `3306`                                                                                |
| `DB_USER`             | usuário criado no passo 1                                                             |
| `DB_PASSWORD`         | senha criada no passo 1                                                               |
| `DB_NAME`             | banco criado no passo 1                                                               |
| `SESSION_SECRET`      | um valor **novo**, gerado só para produção (comando na seção "Rodando localmente")    |
| `ADMIN_PASSWORD_HASH` | gerado no seu computador com `npm run hash-password` (no Business não há npm via SSH) |

Não cadastre `HOST` nem `PORT`: o LiteSpeed define onde o app escuta. Se cadastrar `HOST`, use
`0.0.0.0`; com `localhost`, o Fastify chamaria `listen` duas vezes (IPv4 e IPv6), e a segunda
chamada falha no LiteSpeed.

### 4. Primeiro deploy e conferências

1. Confirme que o domínio está com **SSL ativo** e que o acesso é sempre por `https://`. Em
   produção o cookie de sessão é `__Host-session` com `Secure`: por HTTP o navegador não guarda o
   cookie, e o login parece funcionar mas volta sempre para a tela de senha.
1. No **log de build**, confira que `npm run build` terminou sem erro.
1. Nos **Runtime Logs** (saída do app, em JSON), procure:
   - `Migrations: aplicando 001_create_items_and_offers.sql` e depois `... aplicada`;
   - `Server listening at ...`. Se aparecer um caminho de arquivo (socket Unix), `TRUST_PROXY=unix`
     é o valor certo. Se aparecer `http://127.0.0.1:...`, troque para `TRUST_PROXY=loopback`.
1. **Confirme o IP real:** abra o site, descubra seu IP público (ex.: buscando "qual é meu ip") e
   procure nas linhas `incoming request` do log o campo `"remoteAddress"`. Ele deve mostrar o seu
   IP. Se mostrar outro endereço ou não aparecer, o `TRUST_PROXY` está errado e o limite de
   tentativas de login passa a valer para todos os visitantes juntos.
1. Faça login e cadastre um item de teste.

### Atualizações

Com GitHub conectado, cada push gera build e deploy novos. As migrations novas rodam sozinhas
quando o app reinicia; não há passo manual.

### Por que `typescript` e `@types/node` estão em `dependencies`

A Hostinger instala as dependências e roda o build com as variáveis do painel, inclusive
`NODE_ENV=production`. Com `NODE_ENV=production`, o npm não instala as `devDependencies`, e o
`tsc` não existiria na hora do build. A documentação da Hostinger não diz como trata as
`devDependencies`, então o seguro é deixar no `dependencies` o que o build precisa (`typescript` e
`@types/node`). Testado aqui com `NODE_ENV=production npm ci && npm run build`. ESLint e
Prettier continuam em `devDependencies`, porque não fazem parte do build.

### Por que `src/server.ts` não usa top-level await

O LiteSpeed carrega o arquivo de entrada com `require()`. O Node 24 aceita `require()` de módulo
ESM, mas não se ele (ou algo que ele importa) tiver `await` no nível do módulo: o app nem sobe
(`ERR_REQUIRE_ASYNC_MODULE`, erro 503). Por isso o `server.ts` usa uma função `main()`. Os scripts
de `src/cli/` podem usar top-level await, porque rodam direto com `node`.

## Segurança: o que saber

- **Senha:** para trocar, gere um novo `ADMIN_PASSWORD_HASH` e atualize a variável.
- **Sessão:** o cookie guarda só a data de expiração, assinada com o `SESSION_SECRET`, e vale por
  7 dias. Não há sessão no servidor: sair apaga o cookie só naquele navegador, e trocar a senha não
  derruba as sessões abertas. Para derrubar todas, troque o `SESSION_SECRET`.
- **Limites:** 5 tentativas de login a cada 15 minutos por IP e 30 requisições por minuto por IP
  no resto do site. Ambos dependem do `TRUST_PROXY` correto.
- **CSRF:** toda requisição que altera dados (POST) precisa vir do próprio site
  (`Sec-Fetch-Site` ou `Origin`); alterações e exclusões nunca são feitas por GET.

## Problemas comuns

| Sintoma                                             | Causa provável e solução                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Log: `Variáveis de ambiente inválidas`              | O log diz qual variável. Corrija no painel e reinicie.                              |
| Log: `ECONNREFUSED ::1:3306`                        | `localhost` resolveu para IPv6. Use `DB_HOST=127.0.0.1`.                            |
| Log: `ER_ACCESS_DENIED_ERROR`                       | Usuário ou senha do banco errados, ou o usuário não está ligado ao banco no hPanel. |
| Log: `Migrations: FALHA em ...`                     | Veja a seção "Banco e migrations".                                                  |
| Erro 503 e `ERR_REQUIRE_ASYNC_MODULE` no log        | Algum módulo importado pelo `server.ts` passou a usar top-level await.              |
| "Muitas tentativas" no login sem ter errado a senha | O `TRUST_PROXY` não está pegando o IP real (passo 4 do deploy).                     |
| Build falha com `tsc: not found`                    | `typescript` saiu das `dependencies`.                                               |
