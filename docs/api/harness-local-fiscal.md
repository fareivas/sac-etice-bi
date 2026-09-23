# Harness local do Fiscal

`LocalFiscalAuthProvider` é temporário e exclusivo de `NODE_ENV=development` ou `test`.
O servidor deve configurar explicitamente `LOCAL_FISCAL_USER_ID` (inteiro positivo) e
`LOCAL_FISCAL_CAN_ACCESS_VIEW` (`true` ou `false`). Configuração ausente ou inválida
retorna `UNAUTHENTICATED`. Em produção o provider sempre falha fechado. Headers,
query string e frontend não selecionam a identidade. Este harness não implementa
JWT/RBAC do SAC oficial e não representa a política de autorização final (DEC-031).

O handler publicado ainda responde 501. O contrato 200 exige `priorityQueue` e
`[]` significa consulta válida vazia (DEC-006/027). Como a elegibilidade de OS
permanece pendente (DEC-026), não é possível afirmar essa condição. Os cards
`pendingServiceOrders`, `criticalItems` e `overdueActions` podem ser `null` com
`UNAVAILABLE`, mas a fila não tem representação equivalente. O frontend permanece
desconectado do endpoint até haver uma resposta contratual honesta.
