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
