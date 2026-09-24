# Harness local do Dashboard Fiscal

Este roteiro executa o caminho existente: navegador → Vite → SAM local →
`LocalFiscalAuthProvider` → `PostgresFiscalSummaryRepository` → service →
contrato HTTP. Use somente uma instância local de desenvolvimento. O banco é
acessado com transações de leitura (`default_transaction_read_only=on`).

## Pré-requisitos

- Node.js 22, npm, AWS SAM CLI, Docker e Python 3;
- dependências instaladas com `npm install` na raiz deste repositório;
- PostgreSQL SAC acessível **somente para leitura** na máquina local;
- ID positivo de um usuário Fiscal ativo que tenha acesso à visão local;
- portas locais 3000 (SAM) e 5173 (Vite) livres.

O exemplo abaixo usa Linux e descobre o gateway da rede Docker `bridge` para
alcançar o PostgreSQL do host. Dentro da Lambda, `127.0.0.1` aponta para o
próprio contêiner. Ajuste porta, nome do banco e usuário às configurações
locais. Não coloque a senha em arquivos versionados ou na linha de comando.

## 1. Iniciar o backend

No terminal 1, a partir da raiz de `sac-etice-bi`:

```bash
npm install
export LOCAL_FISCAL_USER_ID='<ID_FISCAL_ATIVO>'
export SAC_DB_HOST="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"
export SAC_DB_PORT='5434'
export SAC_DB_NAME='sac'
export SAC_DB_USER='<USUARIO_SOMENTE_LEITURA>'
read -rs -p 'Senha do PostgreSQL: ' SAC_DB_PASSWORD
printf '\n'
export SAC_DB_PASSWORD
PATH="$PWD/node_modules/.bin:$PATH" sam build --template-file infra/sam/template.yaml --build-dir /tmp/sac-etice-bi-sam-build
FISCAL_ENV_FILE="$(mktemp /tmp/sac-etice-bi-fiscal-env.XXXXXX.json)"
export FISCAL_ENV_FILE
chmod 600 "$FISCAL_ENV_FILE"
python3 - <<'PY'
import json, os
names = ('LOCAL_FISCAL_USER_ID', 'SAC_DB_HOST', 'SAC_DB_PORT',
         'SAC_DB_NAME', 'SAC_DB_USER', 'SAC_DB_PASSWORD')
settings = {name: os.environ[name] for name in names}
settings.update(NODE_ENV='development', LOCAL_FISCAL_DASHBOARD_ENABLED='true',
                LOCAL_FISCAL_CAN_ACCESS_VIEW='true', SAC_DB_SSL='false')
with open(os.environ['FISCAL_ENV_FILE'], 'w', encoding='utf-8') as file:
    json.dump({'FiscalFunction': settings}, file)
PY
sam local start-api --template-file /tmp/sac-etice-bi-sam-build/template.yaml --env-vars "$FISCAL_ENV_FILE" --host 127.0.0.1 --port 3000
```

Quando encerrar o SAM, elimine o arquivo temporário de ambiente com
`rm "$FISCAL_ENV_FILE"` e remova a variável do shell com
`unset SAC_DB_PASSWORD`. O ID e a autorização vêm apenas do ambiente do
servidor; headers, query string e frontend não escolhem identidade. O harness
não implementa JWT/RBAC oficial (DEC-031).

## 2. Iniciar o frontend

No terminal 2, na mesma raiz:

```bash
npm run dev:web
```

Abra `http://127.0.0.1:5173/`. O Vite encaminha apenas a rota
`/api/v1/fiscais/me/dashboard/resumo` ao SAM local na porta 3000. Para conferir
a resposta diretamente: `curl -i 'http://127.0.0.1:3000/api/v1/fiscais/me/dashboard/resumo?includeExternal=false'`.

## 3. Resultado esperado

O HTTP 200 mostra identidade, carteira autorizada e contagem real de contratos
ativos do PostgreSQL na data atual. Uma contagem `0` significa nenhum contrato
**ativo** apurado; não é uma contagem separada da carteira. OS pendentes, itens
críticos e ações vencidas aparecem como **Indisponível**, com cobertura
`UNAVAILABLE`. A fila aparece como **Fila indisponível** (`priorityQueue: null`);
`[]` significaria consulta válida sem ocorrências e não representa esta situação.

Por padrão `includeExternal=false`: consulta KPI desabilitada e
`externalViolations: null`. Ao marcar **Consultar fonte externa**, o protótipo
usa somente o adapter explícito `UNAVAILABLE`, com `externalViolations: null` e
`updatedAt: null`. Nenhum valor de KPI é simulado. Erros da API são mostrados
como erro, sem substituir dados ausentes por zero.

## 4. Conferir a proteção de produção

O handler retorna 501 se `LOCAL_FISCAL_DASHBOARD_ENABLED` não for `true` ou se
`NODE_ENV` não for `development`/`test`. Para conferir no SAM, pare o servidor,
altere **somente no arquivo temporário** `FiscalFunction.NODE_ENV` para
`production`, reinicie o mesmo comando `sam local start-api` e consulte a rota
com `curl -i`: ela deve retornar HTTP 501 mesmo com a chave local em `true`.
Restaure `development` para voltar à demonstração. O teste automatizado do
handler também cobre esse bloqueio.
