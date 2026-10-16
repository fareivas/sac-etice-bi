# Harness local do Dashboard Fiscal

Este roteiro executa o caminho existente: navegador → Vite → SAM local →
`LocalFiscalAuthProvider` → `PostgresFiscalSummaryRepository` → service →
contrato HTTP. Use somente uma instância local de desenvolvimento. O banco SAC
compartilhado é **somente leitura**; não execute migrations, seeds, fixtures,
backfill ou qualquer escrita. As consultas devem usar credencial de leitura.

## Pré-requisitos

- Node.js 22, npm, AWS SAM CLI e Docker;
- dependências já instaladas na raiz deste repositório;
- PostgreSQL SAC acessível **somente para leitura** na máquina local;
- IDs positivos de usuários Fiscal e Gerente ativos que tenham acesso às visões locais;
- portas locais 3000 (SAM) e 5173 (Vite) livres.

O script local descobre o gateway da rede Docker `bridge` quando `SAC_DB_HOST`
não está definido. Dentro da Lambda, `127.0.0.1` aponta para o próprio
contêiner. Ajuste a configuração local às portas, banco e credencial de leitura.
Não coloque a senha em arquivos versionados ou na linha de comando.

## 1. Iniciar o backend

No terminal 1, a partir da raiz de `sac-etice-bi`, configure `.env.local` a
partir de `.env.local.example`, incluindo `LOCAL_FISCAL_USER_ID`,
`LOCAL_MANAGER_USER_ID` e `SAC_DB_*` com credencial somente leitura. O script
gera o ambiente temporário e faz `sam build` antes de iniciar o SAM:

```bash
npm run local:api
```

Após mudança na API, pare a instância SAM em execução e rode novamente
`npm run local:api`: `scripts/local-api.sh` executa `sam build` e inicia a API
na porta 3000. O arquivo temporário de ambiente é removido pelo script ao
encerrar. O ID e a autorização vêm apenas do ambiente do servidor; headers,
query string e frontend não escolhem identidade. O harness não implementa
JWT/RBAC oficial (DEC-031).

## 2. Iniciar o frontend

No terminal 2, na mesma raiz:

```bash
npm run dev:web
```

Abra `http://127.0.0.1:5173/`. O proxy Vite encaminha todo o prefixo
`/api/v1` ao SAM local na porta 3000. Para conferir a resposta diretamente:
`curl -i 'http://127.0.0.1:3000/api/v1/fiscais/me/dashboard/resumo?includeExternal=false'`.

## 3. Resultado esperado

O HTTP 200 mostra identidade, carteira autorizada e contagem real de contratos
ativos do PostgreSQL na data atual. Uma contagem `0` significa nenhum contrato
**ativo** apurado; não é uma contagem separada da carteira. Na fotografia atual,
`pendingServiceOrders` e `priorityQueue` são apurados pela DEC-036: zero e `[]`
significam consulta válida sem OS elegível. Para referência histórica sem
reconstrução confiável, o card fica `null` com cobertura `UNAVAILABLE` e a
fila fica `null`. Itens críticos e ações vencidas continuam indisponíveis sem
fonte aprovada.

Por padrão `includeExternal=false`: consulta KPI desabilitada e
`externalViolations: null`. Ao marcar **Consultar fonte externa**, o protótipo
usa somente o adapter explícito `UNAVAILABLE`, com `externalViolations: null` e
`updatedAt: null`. Nenhum valor de KPI é simulado. Erros da API são mostrados
como erro, sem substituir dados ausentes por zero.

## 4. Conferir a proteção de produção

O handler retorna 501 se `LOCAL_FISCAL_DASHBOARD_ENABLED` não for `true` ou se
`NODE_ENV` não for `development`/`test`. O ambiente gerado por
`npm run local:api` usa `development`; o teste automatizado do handler verifica
o bloqueio 501 para produção. A demonstração local não libera a rota em produção.

## Diagnóstico de indisponibilidade local

Antes de associar HTTP 500 a uma alteração do frontend, confirme o status das
chamadas no navegador e a disponibilidade do PostgreSQL configurado. Um banco
parado gera falha de conexão (`ECONNREFUSED`) e o handler mantém o envelope
público `INTERNAL_ERROR`, sem expor detalhes internos ou credenciais. Restabeleça
somente a dependência local necessária, sem executar migrações ou fixtures no
banco compartilhado, e recarregue a página.

Confirme também que a porta do navegador serve este BI: a aplicação SAC local
pode ocupar 5173. Para um preview separado, use o comando do workspace diretamente
(o script da raiz não encaminha estes argumentos ao Vite corretamente):

```bash
npm run dev --workspace @sac-etice-bi/web -- --host 127.0.0.1 --port 5181 --strictPort
```

A investigação de 08/10/2026 encontrou PostgreSQL local parado e HTTP 500; após
restabelecer o contêiner já existente, as APIs fiscal e gerente retornaram 200.
O fiscal abriu com fila `[]`, itens disponíveis sem registros e saldo consolidado
do contrato preservado. Nenhuma mudança no código de produção foi necessária.
O teste de recuperação HTTP 500 → resposta válida cobre esse carregamento com
fila/carteira de itens vazias e exportação desabilitada. A validação CSV continua
isolada no roteiro descrito em `scripts/test/README.md`.

## Validação local — 16/10/2026, banco Alembic 0057

Quatro endpoints responderam HTTP 200 na fotografia observada. No resumo
Fiscal do usuário 4, a carteira tinha contrato 2, saldo consolidado de
R$ 300.000, nenhum item, um alerta, zero OS elegíveis e fila `[]`. No resumo
Gerente do usuário 4, a carteira tinha contratos 8 e 29, saldo consolidado de
R$ 612.156, um item e quatro alertas. A carga de fiscais retornou `[]` porque
não havia fiscais designados na carteira gerenciada. O endpoint de fornecedores
respondeu HTTP 200 com dois registros. A reconciliação dos fornecedores registrou
ID 7 = R$ 594.216 e ID 29 = R$ 17.940, total R$ 612.156. A paginação observada
foi página 1, limite 25 e total 2.

SQL independente confirmou os resultados de Fiscal, Gerente e carga dentro de
`BEGIN READ ONLY`/`ROLLBACK`, sem escrita. O contrato 29 tinha status `vigente`
e fim em 16/08/2023: entrou na carteira pela regra de status, mas não na janela
de vencimentos futuros.

Nas primeiras consultas, não houve confirmação de reinício do SAM após o
commit `6d5974c`; portanto, aquelas respostas não podem ser atribuídas com
certeza a esse build. Posteriormente, em 16/10/2026, `npm run local:api`
executou `sam build` com “Build Succeeded” e gerou artefatos em
`.aws-sam/build`. O SAM iniciou às 10:48:48 em `127.0.0.1:3000`; novos
contêineres montaram os artefatos de `FiscalFunction` e
`GerenteContratosFunction`. Após esse rebuild, os quatro endpoints — resumo
Fiscal, resumo Gerente, carga de fiscais e fornecedores — responderam HTTP 200.
Isso confirma o build e o atendimento HTTP, mas não significa que todos os
valores tenham sido novamente reconciliados por SQL após o rebuild.

Item bloqueado e OS `aguardando_fiscal` com contrato direto não ocorreram na
carteira local examinada e continuam cobertos apenas por testes automatizados.
Essas constatações locais não comprovam o estado de produção. Os valores são
fotografia de validação, não expectativas fixas para execuções futuras.
