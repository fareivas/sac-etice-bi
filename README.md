# SAC ETICE BI

Protótipo independente de dashboards do SAC ETICE. A integração com o sistema SAC principal será definida posteriormente.

## Estrutura

- `apps/web`: interface React, Vite e Recharts.
- `services/api`: cinco funções Lambda, uma por domínio.
- `packages/contracts`: contratos compartilhados com Zod.
- `infra/sam`: definição mínima da API e das funções.
- `database`: locais reservados para migrations, seeds e consultas de referência.

## Estado inicial

Os endpoints retornam HTTP 501. Não há consultas SQL, conexão com PostgreSQL, autenticação real nem lógica dos dashboards. As dependências ainda não foram instaladas.

## Desenvolvimento futuro

Após instalar dependências, usar os scripts do `package.json` raiz para executar a interface, testar e validar os tipos. O teste local da API poderá usar `sam build` e `sam local start-api` quando os endpoints forem implementados.

## Desenvolvimento local dos dashboards

Pré-requisitos: Node.js 20.12 ou superior, dependências instaladas (`npm install`),
AWS SAM CLI e Docker acessível. O projeto `sac`/PostgreSQL precisa estar rodando
antes; este projeto apenas consulta o banco e não prepara dados.

Primeira configuração:

```bash
cp .env.local.example .env.local
```

Edite apenas os valores locais necessários, incluindo a senha do banco.
`SAC_DB_HOST` vazio usa o gateway da bridge Docker; um host explícito prevalece.
Os IDs de Fiscal e Gerente são configuráveis em `.env.local` (exemplo: 4).
O arquivo usa sintaxe dotenv, sem expansão de variáveis ou execução de comandos.
Nunca versione `.env.local` nem compartilhe seu conteúdo.

Após reboot/login, inicie o Docker e o PostgreSQL do `sac`, e execute:

Terminal 1:

```bash
npm run local:api
```

Terminal 2:

```bash
npm run local:web
```

No navegador:

- Fiscal: http://127.0.0.1:5173/
- Gerente de Contratos: http://127.0.0.1:5173/gerente-contratos

O Vite pode escolher outra porta se 5173 estiver ocupada; confira seu terminal.
A API escuta em `127.0.0.1:3000`. A cada execução, o SAM refaz o build em
`.aws-sam/build/` (ignorado pelo Git). O env SAM é gerado em diretório temporário
privado, com arquivo de permissões 0600, e removido ao encerrar ou com Ctrl+C.
Uma interrupção forçada (SIGKILL) ou queda da máquina pode impedir o cleanup.
Não são necessários exports manuais. `DOCKER_HOST`/`DOCKER_CONTEXT` existentes
são respeitados; na ausência deles, o socket padrão Linux é usado se disponível.

Validação manual com o banco local disponível:

```bash
curl --fail 'http://127.0.0.1:3000/api/v1/fiscais/me/dashboard/resumo?includeExternal=false'
```

Com o estado local conhecido e ID 4, espera-se HTTP 200, `fiscal.userId = 4`
e `activeContracts = 1`; esses valores dependem do banco atual.

## Referência visual dos dashboards

Para Fiscal e Gerente de Contratos, os protótipos **React/Recharts** são a
referência principal; **Autocontido v4 ABC** é secundária. Implementação,
diferenças intencionais e evidências do lote estão em
[VIS-002](docs/visual/VIS-002.md), preservando as decisões funcionais anteriores.
