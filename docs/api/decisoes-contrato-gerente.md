# Primeiro lote do resumo do Gerente de Contratos

`GET /api/v1/gerentes-contrato/me/dashboard/resumo` usa somente a fotografia atual do PostgreSQL. `contratoId` é um recorte adicional solicitado para este lote e somente restringe a carteira autorizada. `unidadeId`, `supplierId` e `includeExternal` da especificação 7.1 não são aceitos neste lote porque as relações/regras e a integração externa não foram aprovadas para a implementação atual.

O contrato parcial retorna `manager`, `cards.activeContracts`, `cards.activePortfolioValue`, `cards.expiringContracts`, `contracts` e `expiringContractList`, com cobertura por indicador. A lista `contracts` contém contratos vigentes da carteira atual. `merCoverage=PROPOSTA` segue a cobertura estrutural prevista na especificação; os demais campos da resposta completa descrita na especificação 7.1 ainda não são publicados. A rota de produção permanece desabilitada com 501 até existir uma política de autenticação/autorização real.

A especificação 7.1 não define janela para "contratos próximos do vencimento". `renewalsWithin120Days` aparece somente no exemplo e se refere a renovação formal, sem regra normativa para vencimento simples. O endpoint 7.4 define 180 dias para outra listagem, não para este indicador. Portanto `expiringContracts` e `expiringContractList` são `null`, com cobertura `UNAVAILABLE`. **Decisão humana mínima:** definir a janela, em dias corridos e inclusividade dos limites, para o vencimento simples no resumo 7.1.

Se qualquer contrato ativo tiver `valor_total` nulo, o total é `null/UNAVAILABLE`; a contagem permanece disponível. **Decisão humana mínima:** definir se contratos ativos sem valor devem excluir-se de um total parcial, bloquear o total inteiro ou seguir outra regra. Até essa decisão, o total inteiro fica indisponível para evitar subcontagem silenciosa.

`dataReferencia` passada não usa a designação atual, status, valor ou vigência atuais. A carteira e os indicadores dependentes dela ficam `null/UNAVAILABLE`. O nome e ID do usuário autenticado continuam disponíveis. Zero significa consulta atual válida sem contratos vigentes; `null` significa dado não apurável.
