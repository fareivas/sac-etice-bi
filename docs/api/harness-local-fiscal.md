# Harness local do Fiscal

`LocalFiscalAuthProvider` é temporário e exclusivo de `NODE_ENV=development` ou `test`.
O servidor deve configurar explicitamente `LOCAL_FISCAL_USER_ID` (inteiro positivo) e
`LOCAL_FISCAL_CAN_ACCESS_VIEW` (`true` ou `false`). Configuração ausente ou inválida
retorna `UNAUTHENTICATED`. Em produção o provider sempre falha fechado. Headers,
query string e frontend não selecionam a identidade. Este harness não implementa
JWT/RBAC do SAC oficial e não representa a política de autorização final (DEC-031).

Com `NODE_ENV=development` ou `test` e `LOCAL_FISCAL_DASHBOARD_ENABLED=true`, o
endpoint responde com dados reais de identidade, carteira e contratos ativos do
PostgreSQL. Os demais cards SAC e a fila ficam indisponíveis (`null`); a fila
segue a DEC-032 e nunca usa `[]` para esse estado. A fonte externa usa apenas o
adapter explícito `UNAVAILABLE` do protótipo quando solicitada. Sem a ativação
local explícita, inclusive em produção, o handler publicado responde 501.
