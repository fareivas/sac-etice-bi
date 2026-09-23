# SAC ETICE BI

Antes de alterar contratos de API, backend, banco ou dashboards, consulte a documentação em `docs/reference/`.

Antes de implementar `GET /api/v1/fiscais/me/dashboard/resumo`, consulte também `docs/api/decisoes-contrato-fiscal.md`, referência normativa complementar para esse endpoint.

## Fontes prioritárias

1. `docs/reference/specs/Especificacao_Endpoints_Dashboards_SAC_ETICE.docx`
   - Fonte de verdade para rotas, parâmetros, campos, envelopes de resposta e códigos de erro.

2. `docs/reference/specs/Proposta_Evolucao_MER_SAC_ETICE.docx`
   - Fonte de verdade para evolução do modelo de dados e divisão entre SAC e Projeto de KPIs.

3. `docs/reference/specs/ETICE_Especificacao_Requisitos_Dashboards_Gestao_Contratos_v1_2_Preditivo.docx`
   - Fonte funcional para comportamento e conteúdo dos dashboards.

4. `docs/reference/specs/ER-ETICE-GERAL.pdf`
   - Referência do modelo atual.

5. `docs/reference/specs/alteracoes_mer_sac_postgresql.sql`
   - Referência técnica das alterações propostas no PostgreSQL.

6. `docs/reference/specs/CONTRA-ORDEM-FATU.pdf`
   - Documento complementar de referência do domínio.

## Protótipos

Os arquivos em `docs/reference/prototypes/` são referências visuais e funcionais para o frontend.

## Regras obrigatórias

- Não inventar campos, filtros, rotas ou códigos de erro.
- Quando a documentação não definir algo, sinalizar a lacuna antes de implementar.
- KPIs, SLA, glosas e performance técnica pertencem ao Projeto de KPIs.
- Não representar fonte indisponível como zero.
- Preservar os contratos definidos na especificação de endpoints.
- Não usar os protótipos HTML como fonte de verdade para contratos da API.
- Em caso de conflito, a especificação de endpoints prevalece sobre protótipos.
