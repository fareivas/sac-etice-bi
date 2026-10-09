# Decisões de contrato do resumo do Fiscal

**Endpoint:** `GET /api/v1/fiscais/me/dashboard/resumo`.

**Objetivo:** registrar as decisões de contrato aprovadas para que o planejamento e a implementação não dependam do histórico da conversa. Lacunas de origem física permanecem explícitas; nenhuma delas autoriza uma regra por heurística. As DEC-024 a DEC-031 complementam as decisões anteriores; DEC-032 e DEC-033 estendem o schema HTTP consolidado na DEC-023.

**Documentos-base:**

- `docs/reference/specs/Especificacao_Endpoints_Dashboards_SAC_ETICE.docx`
- `docs/reference/specs/ETICE_Especificacao_Requisitos_Dashboards_Gestao_Contratos_v1_2_Preditivo.docx`
- `docs/reference/specs/Proposta_Evolucao_MER_SAC_ETICE.docx`
- `docs/reference/specs/ER-ETICE-GERAL.pdf`
- `docs/reference/specs/CONTRA-ORDEM-FATU.pdf`
- `docs/reference/specs/alteracoes_mer_sac_postgresql.sql`

**Precedência:** este documento complementa a especificação de endpoints nas ambiguidades aqui resolvidas; não substitui regras documentadas que não foram objeto destas decisões.

## DEC-001 — Identificação da fonte

**Status:** APROVADA.

**Decisão normativa:** usar `meta.source` para uma fonte e `meta.sources` para múltiplas fontes; nunca ambos na mesma resposta.

## DEC-002 — Metadados obrigatórios no sucesso

**Status:** APROVADA.

**Decisão normativa:** `meta.generatedAt`, `meta.dataReference`, `meta.timezone`, `meta.merCoverage`, `meta.filtersApplied` e a identificação da fonte ou das fontes são obrigatórios em respostas de sucesso.

## DEC-003 — Disponibilidade da fonte de KPIs

**Status:** APROVADA.

**Decisão normativa:**

- `AVAILABLE`: a fonte respondeu com dado atual válido.
- `STALE`: a fonte não pôde ser atualizada, mas existe último dado válido utilizável.
- `UNAVAILABLE`: a fonte está indisponível e não existe dado anterior válido utilizável.
- Em `AVAILABLE` e `STALE`, `updatedAt` representa o instante de atualização do dado efetivamente utilizado.
- Em `UNAVAILABLE` sem dado anterior válido, `updatedAt = null`.
- Falha da fonte de KPIs nunca transforma o indicador em zero.

## DEC-004 — Valor de `externalViolations`

**Status:** APROVADA.

**Decisão normativa:** `data.cards.externalViolations` é propriedade obrigatória, de tipo `integer | null`. Com KPIs `AVAILABLE`, usa o inteiro atual válido; com `STALE`, o último inteiro válido; com `UNAVAILABLE` sem dado anterior, `null`. Indisponibilidade nunca é representada como zero. A origem é o Projeto de KPIs.

**Dependência:** unidade de contagem, período, granularidade, severidade, estado e deduplicação das violações externas ainda dependem do contrato real da integração.

## DEC-005 — Consulta externa desabilitada

**Status:** APROVADA.

**Decisão normativa:** `includeExternal=false` não consulta o Projeto de KPIs, usa `meta.source: "SAC"` e retorna `data.cards.externalViolations: null`.

## DEC-006 — `priorityQueue`

**Status:** APROVADA.

**Decisão normativa:** `data.priorityQueue` é obrigatória; `[]` significa ausência de ocorrências após consulta válida. A DEC-032 acrescenta `null` para fila indisponível. Nesta primeira versão, somente `type: "SERVICE_ORDER"` é suportado. Cada item tem `type`, `severity`, `contractId`, `contractNumber`, `supplierName`, `title` e `dueAt`. Não há campo IPA, paginação embutida nem ordenação implícita. A fila não é declarada equivalente à fila funcional completa.

## DEC-007 — `criticalItems`

**Status:** APROVADA.

**Decisão normativa:** `cards.criticalItems` conta itens cujo saldo a executar seja menor ou igual a 10% do valor vigente do contrato/item. A regra percentual somente se aplica quando `valor_vigente > 0`. `valor_vigente <= 0` não entra automaticamente na contagem apenas porque uma view o classifique como `VERMELHO`; esses casos devem ser tratados separadamente como inconsistência/dado até existir regra funcional específica. Não implementar como simples `COUNT WHERE faixa = 'VERMELHO'`. Respeitar `dataReferencia` quando houver suporte histórico confiável. Enquanto o modelo não puder reconstruir historicamente o saldo, não apresentar o estado atual como se fosse histórico.

## DEC-008 — Envelope comum de erros

**Status:** APROVADA.

**Decisão normativa:** todo erro usa este envelope:

```json
{
  "meta": {
    "generatedAt": "...",
    "correlationId": "..."
  },
  "error": {
    "code": "INVALID_FILTER",
    "message": "Filtros inválidos.",
    "details": []
  }
}
```

- Todo erro possui `meta.generatedAt`, `meta.correlationId`, `error.code`, `error.message` e `error.details`.
- `details` é sempre array. Em validação, pode conter campo, motivo e valor rejeitado; nos demais casos pode ser `[]`.
- Códigos admitidos: `INVALID_FILTER`, `UNAUTHENTICATED`, `FORBIDDEN_SCOPE`, `RESOURCE_NOT_FOUND`, `DATA_VERSION_CONFLICT`, `EXTERNAL_SOURCE_UNAVAILABLE`, `INTERNAL_ERROR`.
- `correlationId` existe em todos os erros, não apenas em `INTERNAL_ERROR`.
- `INTERNAL_ERROR` nunca expõe stack trace, SQL, credenciais ou detalhes internos.
- HTTP status e `error.code` devem ser coerentes com a especificação de endpoints.

## DEC-009 — `contratoId` repetível

**Status:** APROVADA.

**Decisão normativa:** `contratoId` é parâmetro repetível. Um contrato usa `?contratoId=184`; vários usam `?contratoId=184&contratoId=205&contratoId=317`. Cada ocorrência contém exatamente um inteiro válido. Lista separada por vírgulas não é aceita. IDs duplicados podem ser normalizados para conjunto único. Ausência significa nenhum filtro adicional de contrato, sempre dentro do escopo autorizado do Fiscal. `contratoId` nunca amplia o escopo de autorização.

## DEC-010 — Contratos ativos

**Status:** APROVADA.

**Decisão normativa:** conta contratos distintos no escopo autorizado do Fiscal, avaliados em `meta.dataReference` usando `meta.timezone`. O contrato entra somente quando sua situação semântica for `ATIVO` na data de referência; `SUSPENSO` e `ENCERRADO` não contam. O Fiscal deve possuir designação válida para o contrato em `dataReference`; `FISCAL_TITULAR` e `FISCAL_SUPLENTE` podem colocá-lo no escopo. O mesmo contrato é contado uma única vez mesmo com múltiplas designações válidas. Filtros apenas restringem o escopo. Não assumir que apenas a data atual entre início/fim define `ATIVO`.

**Dependência:** o predicado SQL físico ainda depende do mapeamento real de `ATIVO`/`SUSPENSO`/`ENCERRADO`, vigência efetiva, aditivos/prorrogações e rescisão/encerramento.

## DEC-011 — Ordens de serviço pendentes

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** `pendingServiceOrders` conta ordens de serviço **distintas** do SAC que, na data de referência, ainda exigem ação do fluxo operacional do Fiscal e pertencem à carteira autorizada. Conta OS, não itens. `unread` não determina pendência de negócio. `contratoId` e `unidadeId` apenas restringem o escopo autorizado. Não contar automaticamente todas as linhas de `/ordens-servico/pendencias`. Estado atual não pode ser apresentado como histórico quando não for reconstruível.

**Dependências:** mapear valores reais de `ordem_servico.status`, quais exigem ação do Fiscal, a semântica de `AUTORIZADA`, `NAO_AUTORIZADA`, `RECEBIDA` e `EXECUTADA`, a participação dos lados `CLIENTE`/`FORNECEDOR` e a reconstrução histórica sem dupla contagem.

## DEC-012 — Ações vencidas

**Status:** APROVADA.

**Decisão normativa:** `cards.overdueActions` conta planos de ação distintos do SAC vencidos na data de referência e pertencentes ao escopo autorizado do Fiscal. A entidade de referência é `sac_gestao.plano_acao`, e o prazo é `plano_acao.data_prevista`. A ação está vencida quando `data_prevista < dataReferencia`; se forem iguais, ainda está no prazo. Ações concluídas antes ou na data de referência não contam. Enquanto não houver catálogo completo de status, usar `data_conclusao` para determinar conclusão quando disponível, sem inventar status. A ação não precisa estar atribuída diretamente ao usuário Fiscal, mas deve pertencer a risco dentro do escopo contratual autorizado. `contratoId` e `unidadeId` apenas restringem o universo autorizado. `overdueActions` não representa toda a Minha fila de ação, `priorityQueue` ou Central de Ações. Para histórico, classificar somente quando prazo, conclusão e situação puderem ser reconstruídos na data; não apresentar estado atual como histórico.

**Dependência:** cancelamentos, reaberturas e outros estados especiais permanecem indefinidos até formalização do catálogo.

## DEC-013 — Semântica de violações externas

**Status:** APROVADA.

**Decisão normativa:** `externalViolations` representa quantidade de violações de SLA fornecida exclusivamente pelo Projeto de KPIs. O SAC determina somente o conjunto autorizado de contratos e respectivos `uuid_integracao` usados na integração. `contratoId` e `unidadeId` restringem primeiro os contratos no SAC; não enviar esses filtros diretamente ao Projeto de KPIs sem contrato externo que o defina. Não inventar janela temporal: `dataReferencia`, sozinha, não define `from`/`to`. Não assumir mês corrente, últimos 30 dias, competência mensal ou acumulado. Não assumir severidade mínima, exclusão de violações resolvidas, deduplicação ou soma simples entre contratos. Até existir contrato de integração, `externalViolations` pode permanecer `null` em respostas reais quando não houver valor consolidado confiável.

**Dependência:** antes da integração real, definir explicitamente unidade da violação, tipos incluídos, janela `from`/`to`, granularidade, severidade, estado elegível, agregação entre contratos e repetição/deduplicação.

## DEC-014 — Cobertura histórica de `dataReferencia`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** `dataReferencia` futura gera `INVALID_FILTER`; datas atuais e passadas são aceitas. Indicador SAC só apresenta valor quando reconstruível confiavelmente. `0` é valor apurado igual a zero; `null` é indisponibilidade por insuficiência de cobertura histórica. `meta.dataCoverage` registra **por indicador SAC** `activeContracts`, `pendingServiceOrders`, `criticalItems` e `overdueActions`, cada um com `AVAILABLE` ou `UNAVAILABLE`. Não existe `PARTIAL` nesta versão. `externalViolations` não entra em `dataCoverage`. Não apresentar estado atual como histórico sem reconstrução válida.

## DEC-015 — `meta.merCoverage`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** `meta.merCoverage` é obrigatório e representa cobertura estrutural/origem do MER, não cobertura histórica. No resumo do Fiscal, o enum é `MIXED` com `includeExternal=true` e `PROPOSTA` com `includeExternal=false`. Disponibilidade operacional externa pertence a `source`/`sources`; cobertura histórica pertence a `dataCoverage`.

## DEC-016 — Fiscal sem contratos no recorte

**Status:** APROVADA.

**Decisão normativa:**

- `401 UNAUTHENTICATED`: usuário não autenticado ou credencial inválida.
- `403 FORBIDDEN_SCOPE`: usuário autenticado sem autorização para a visão Fiscal.
- Fiscal autorizado pode receber HTTP 200 mesmo com carteira vazia para data e filtros válidos. Zero contratos no recorte não é erro de autorização.
- Em carteira vazia, `data.fiscal` permanece, `priorityQueue = []`, contagens apuráveis são `0`, indicador sem cobertura suficiente é `null` e `dataCoverage` registra `AVAILABLE`/`UNAVAILABLE`.
- `FISCAL_TITULAR` e `FISCAL_SUPLENTE` são elegíveis. A validade temporal da designação é avaliada em `dataReference`, não por view baseada apenas em `CURRENT_DATE`.
- Ausência de designação válida naquela data não remove automaticamente a autorização para usar a visão Fiscal; pode resultar em carteira histórica vazia.
- `unidadeId` ou `contratoId` explicitamente fora do escopo autorizado gera `403 FORBIDDEN_SCOPE`.
- Em rota que endereça recurso específico, recurso inexistente/invisível gera `404 RESOURCE_NOT_FOUND`. No resumo, filtro explicitamente fora do escopo gera `403`.

## DEC-017 — `data.fiscal`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** `data.fiscal` é obrigatório em todo HTTP 200, inclusive com carteira vazia. `userId` é obrigatório, `integer`, e identifica `public.usuario.id` do usuário autenticado. `name` é propriedade obrigatória `string | null`; `null` significa ausência de nome utilizável. Não usar fallback artificial. Titularidade ou suplência participa do escopo por designação contratual, não acrescenta campo a `data.fiscal`.

## DEC-018 — `priorityQueue[].severity`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** propriedade obrigatória `string | null`, sem enum fechado. Não mapear por semelhança para IPA, `plano_acao.prioridade` ou status da OS.

**Dependência:** fonte física e semântica da severidade de `SERVICE_ORDER` ainda não mapeadas.

## DEC-019 — `priorityQueue[].dueAt`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** propriedade obrigatória `string | null`; quando preenchida, contém datetime ISO 8601 com offset. Não atribuir origem física, significado ou fallback por semelhança de nomes.

**Dependência:** identificar o prazo real da ocorrência de OS.

## DEC-020 — `priorityQueue[].supplierName`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** propriedade obrigatória `string | null`. Não escolher fornecedor por heurística, nem derivar o nome de OS relacionada sem vínculo explicitamente definido. Não criar fallback.

**Dependência:** mapear fornecedor da ocorrência e campo real de nome em `public.fornecedor`.

## DEC-021 — Demais campos do item `SERVICE_ORDER`

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** `contractId` é propriedade obrigatória `integer | null`; quando preenchido, identifica `public.contrato.id`. `contractNumber` e `title` são propriedades obrigatórias `string | null`. Não há fallback nem derivação por heurística; não inventar template de título.

## DEC-022 — `meta.filtersApplied` e validação dos filtros

**Status:** APROVADA e VIGENTE.

**Decisão normativa:** `filtersApplied` é obrigatório e contém exatamente os filtros efetivamente aplicados e normalizados: `unidadeId: integer | null`, `contratoId: integer[]` e `includeExternal: boolean`. Não repetir `dataReferencia` ou `timezone`. Unidade omitida vira `null`; contratos omitidos viram `[]`. IDs duplicados são removidos; a ordem dos IDs não possui significado contratual. `includeExternal` aparece sempre, com padrão efetivo `true`. O escopo implícito da autenticação não se torna chave adicional. Filtro explicitamente fora do escopo gera HTTP 403, não HTTP 200.

**Validações aprovadas:** `dataReferencia` exatamente `YYYY-MM-DD`; timezone IANA válido; `includeExternal` aceita somente `true` ou `false`; `unidadeId` e `contratoId` são inteiros maiores que zero; parâmetro desconhecido gera `INVALID_FILTER`. `dataReferencia` omitida usa a data atual no timezone efetivo; `contratoId` omitido não acrescenta filtro, sempre respeitando o escopo autorizado.

## DEC-023 — Contrato consolidado da resposta HTTP 200

**Status:** APROVADA.

**Decisão normativa:** 0 contradições reais e 0 lacunas bloqueantes do contrato HTTP após as decisões anteriores. As dependências de implementação física listadas ao final não alteram o schema HTTP. O schema estrito dos descritores de `meta.sources` não foi fechado além do exemplo da especificação de endpoints; não inventar enum ou atributos adicionais para esses itens.

### Schema consolidado

| Propriedade | Obrigatória | Tipo / valores | Significado de `null` |
| --- | --- | --- | --- |
| `meta.generatedAt` | Sim | datetime ISO 8601 | Não aplicável |
| `meta.dataReference` | Sim | data `YYYY-MM-DD` efetiva | Não aplicável |
| `meta.timezone` | Sim | timezone IANA efetivo | Não aplicável |
| `meta.source` | Sim, com uma fonte | `SAC` com `includeExternal=false` | Não aplicável |
| `meta.sources` | Sim, com múltiplas fontes | array de descritores SAC e KPIs com `includeExternal=true`; detalhes estritos não fechados | Não aplicável |
| `meta.merCoverage` | Sim | `MIXED` ou `PROPOSTA`, conforme DEC-015 | Não aplicável |
| `meta.dataCoverage` | Sim | objeto com exatamente quatro chaves SAC, cada valor `AVAILABLE` ou `UNAVAILABLE` | Não aplicável |
| `meta.filtersApplied` | Sim | objeto fechado pela DEC-022 | `unidadeId: null` significa filtro de unidade ausente |
| `data.fiscal` | Sim | `{ userId: integer, name: string | null }` | `name: null` significa nome não utilizável |
| `data.cards` | Sim | quatro cards SAC `integer | null` e `externalViolations: integer | null`; todas as propriedades obrigatórias | Card SAC `null` = cobertura histórica insuficiente; externo `null` segue DEC-004/005 |
| `data.priorityQueue` | Sim | array de `SERVICE_ORDER` ou `null`; `[]` após consulta válida vazia | Fila não apurável (DEC-032) |
| `priorityQueue[].type` | Sim | `SERVICE_ORDER` | Não aplicável |
| `priorityQueue[].severity` | Sim | `string | null` | Valor indisponível |
| `priorityQueue[].contractId` | Sim | `integer | null` | ID indisponível |
| `priorityQueue[].contractNumber` | Sim | `string | null` | Número indisponível |
| `priorityQueue[].supplierName` | Sim | `string | null` | Nome indisponível |
| `priorityQueue[].title` | Sim | `string | null` | Título indisponível |
| `priorityQueue[].dueAt` | Sim | `string | null`; datetime ISO 8601 com offset quando preenchido | Prazo indisponível |

`meta.source` e `meta.sources` nunca coexistem. `meta.dataCoverage` contém somente `activeContracts`, `pendingServiceOrders`, `criticalItems` e `overdueActions`. `meta.filtersApplied` contém somente `unidadeId`, `contratoId` e `includeExternal`.

### Exemplo HTTP 200 — `includeExternal=true`, KPIs `AVAILABLE`

Valores apenas ilustrativos, sem criar regras de negócio:

```json
{
  "meta": {
    "generatedAt": "2026-09-21T14:30:00-03:00",
    "dataReference": "2026-09-21",
    "timezone": "America/Fortaleza",
    "sources": [
      { "system": "SAC", "updatedAt": "2026-09-21T14:29:40-03:00" },
      { "system": "KPIs", "updatedAt": "2026-09-21T14:25:00-03:00", "status": "AVAILABLE" }
    ],
    "merCoverage": "MIXED",
    "dataCoverage": {
      "activeContracts": "AVAILABLE",
      "pendingServiceOrders": "AVAILABLE",
      "criticalItems": "AVAILABLE",
      "overdueActions": "AVAILABLE"
    },
    "filtersApplied": {
      "unidadeId": 4,
      "contratoId": [184, 205],
      "includeExternal": true
    }
  },
  "data": {
    "fiscal": { "userId": 77, "name": "Fiscal Exemplo" },
    "cards": {
      "activeContracts": 2,
      "pendingServiceOrders": 1,
      "criticalItems": 0,
      "overdueActions": 0,
      "externalViolations": 3
    },
    "priorityQueue": [
      {
        "type": "SERVICE_ORDER",
        "severity": "ALTA",
        "contractId": 184,
        "contractNumber": "CT-2025-0184",
        "supplierName": "Fornecedor Alfa",
        "title": "Autorizar OS-2026-0881",
        "dueAt": "2026-09-22T12:00:00-03:00"
      }
    ]
  }
}
```

### Exemplo HTTP 200 — `includeExternal=false`, carteira vazia

Os zeros ilustram consulta válida com cobertura `AVAILABLE`, não falta de histórico:

```json
{
  "meta": {
    "generatedAt": "2026-09-21T14:30:00-03:00",
    "dataReference": "2026-09-21",
    "timezone": "America/Fortaleza",
    "source": "SAC",
    "merCoverage": "PROPOSTA",
    "dataCoverage": {
      "activeContracts": "AVAILABLE",
      "pendingServiceOrders": "AVAILABLE",
      "criticalItems": "AVAILABLE",
      "overdueActions": "AVAILABLE"
    },
    "filtersApplied": {
      "unidadeId": null,
      "contratoId": [],
      "includeExternal": false
    }
  },
  "data": {
    "fiscal": { "userId": 77, "name": "Fiscal Exemplo" },
    "cards": {
      "activeContracts": 0,
      "pendingServiceOrders": 0,
      "criticalItems": 0,
      "overdueActions": 0,
      "externalViolations": null
    },
    "priorityQueue": []
  }
}
```

## DEC-024 — Carteira Fiscal atual

**Status:** APROVADA para a fotografia atual do protótipo.

**Decisão normativa:** a carteira operacional atual do usuário é definida por `contratos.designacao.usuario_id = usuário`, `papel = 'fiscal'` e `ativo = true`. Essa designação física não distingue titular e suplente nem contém validade histórica; portanto não satisfaz retroativamente a exigência temporal da DEC-010. Designação atual nunca pode ser aplicada a `dataReferencia` passada. Sem reconstrução confiável da carteira histórica, os indicadores dependentes desse escopo ficam `UNAVAILABLE`, conforme DEC-014. A autorização para abrir a visão é separada da carteira (DEC-031).

## DEC-025 — Significado de `unidadeId`

**Status:** PENDENTE de definição funcional e modelagem.

**Decisão normativa:** ainda é necessário definir o significado da unidade, sua relação com contrato e/ou designação, a abrangência da hierarquia e a validade temporal. Enquanto essa definição não existir, não atribuir semântica presumida ao filtro nem ignorar `unidadeId` explicitamente informado. ID sintaticamente inválido gera `INVALID_FILTER`; unidade válida fora do escopo autorizado gera `403 FORBIDDEN_SCOPE`, conforme DEC-016 e DEC-022.

## DEC-026 — Elegibilidade de `pendingServiceOrders`

**Status:** APROVADA PARA O PROTÓTIPO com o modelo atual, apenas para fotografia atual.

**Regra funcional:** contar `COUNT(DISTINCT ordens.ordem_servico.id)` das OS com `lado = 'cliente'`, `contrato_id` direto pertencente à carteira autorizada atual do Fiscal (restrita por `contratoId` quando informado), e pelo menos uma `comum.pendencia` com `entidade_tipo = 'ordem_servico'`, `entidade_id = ordem_servico.id`, `tipo = 'decisao_fiscal_p1'` e `status IN ('aberta', 'em_tratamento')`. Múltiplas pendências da mesma OS contam uma vez.

**Exclusões deliberadas:** `aguardando_fiscal` isolado; OS fornecedor; outros tipos de pendência; vínculo inferido por subordem; OS cliente com `contrato_id` nulo; reconstrução histórica a partir do estado atual. Para `dataReferencia` passada, `pendingServiceOrders = null` e `meta.dataCoverage.pendingServiceOrders = 'UNAVAILABLE'`.

## DEC-027 — Elegibilidade de `priorityQueue`

**Status:** APROVADA PARA O PROTÓTIPO com a regra da DEC-026.

**Decisão normativa:** cada OS elegível pela DEC-026 gera no máximo um item `SERVICE_ORDER`. `contractId` e `contractNumber` vêm do contrato direto. `supplierName` só pode ser preenchido com fonte inequívoca formalmente aprovada; até lá é `null`. Sem fonte formal, `severity`, `title` e `dueAt` são `null`. Não há ordenação de prioridade aprovada. Consulta atual válida sem OS elegível produz `[]`; cobertura histórica/indisponível produz `null`.

### Auditoria da indisponibilidade no HTTP 200

O contrato consolidado da DEC-023 representa os cards SAC `pendingServiceOrders`, `criticalItems` e `overdueActions` indisponíveis por `null` acompanhado de `meta.dataCoverage` igual a `UNAVAILABLE` para cada card. Para `externalViolations`, `null` com fonte KPIs `UNAVAILABLE` e `updatedAt: null` representa ausência de dado externo válido (DEC-003/004); com `includeExternal=false`, `null` significa consulta externa desabilitada (DEC-005). Nenhum desses casos equivale ao inteiro `0` apurado.

**Indisponibilidade da fila:** a DEC-032 fecha a lacuna contratual: `data.priorityQueue = null` representa fila não apurável. `[]` continua reservado para consulta válida sem ocorrências. `meta.dataCoverage.pendingServiceOrders` qualifica somente o card. A DEC-027 reutiliza a elegibilidade aprovada na DEC-026 para a seleção real de OS.

**Estado da implementação:** o contrato da DEC-032 permite a exposição local/DEV da indisponibilidade; a publicação em produção permanece bloqueada, com HTTP 501. A seleção real da fila segue a DEC-026 aprovada para a fotografia atual.

## DEC-028 — `activeContracts` na fotografia atual

**Status:** APROVADA para a fotografia atual do protótipo.

**Decisão normativa:** `contratos.contrato.status = 'vigente'` representa a situação semântica `ATIVO` na fotografia atual. `rascunho`, `encerrado`, `rescindido` e `suspenso` não contam como `ATIVO`. Essa equivalência não reconstrói a situação em `dataReferencia` passada e não substitui a avaliação histórica exigida pela DEC-010 e DEC-014.

## DEC-029 — Fonte de `criticalItems`

**Status:** BLOQUEADA por definição de domínio e evolução do MER.

**Decisão normativa:** a regra percentual da DEC-007 permanece válida. A apuração exige fonte confiável para `valor_vigente` e `saldo_a_executar` por item, incluindo o efeito dos aditivos aplicáveis. Não fazer rateio implícito de aditivo. A view atual `contratos.vw_saldo_item` não satisfaz essa exigência; seu `valor_contratado` deriva do valor base do item e não comprova valor vigente após aditivos.

## DEC-030 — Fonte de `overdueActions`

**Status:** BLOQUEADA por definição de domínio e evolução do MER.

**Decisão normativa:** a apuração prevista na DEC-012 exige entidade e regras formais para plano de ação, incluindo estados/eventos de abertura ou andamento, conclusão, cancelamento, reabertura e alteração de prazo. A entidade aprovada `sac_gestao.plano_acao` não existe no SAC oficial inspecionado. Não substituir plano de ação por `comum.pendencia` por semelhança.

## DEC-031 — Autorização da visão Fiscal

**Status:** APROVADA quanto à separação entre autorização e carteira; política concreta de acesso PENDENTE.

**Decisão normativa:** autorização para abrir a visão Fiscal e carteira de contratos são decisões distintas. Usuário autorizado pode ter carteira vazia e receber HTTP 200, conforme DEC-016. Designação define a carteira, não a autorização da visão. No protótipo, não afirmar equivalência com o RBAC oficial nem inventar tratamento de `admin` ou `superadmin` para esta rota.

## DEC-032 — Indisponibilidade de `data.priorityQueue`

**Status:** APROVADA para o contrato do protótipo.

**Decisão normativa:** em `GET /api/v1/fiscais/me/dashboard/resumo`, `data.priorityQueue` continua propriedade obrigatória e passa a ter tipo `array | null`. Um array representa uma fila apurada; `[]` significa consulta válida sem nenhuma ocorrência. `null` significa fila `UNAVAILABLE`, não apurável com confiança para o escopo e a `dataReference` solicitados. É proibido usar `[]` ou omitir a propriedade para representar indisponibilidade. `meta.dataCoverage.pendingServiceOrders` qualifica somente o card homônimo e não determina a disponibilidade da fila. Esta decisão não define elegibilidade de OS: a DEC-026 permanece responsável pela regra funcional e a DEC-027 pelo vínculo da seleção real da fila a essa regra.

## Reafirmações das decisões vigentes

- `unidadeId` válido e fora do escopo autorizado gera `403 FORBIDDEN_SCOPE` (DEC-016, DEC-022 e DEC-025).
- Cobertura histórica é avaliada independentemente por card; `AVAILABLE` com valor `0` é diferente de `UNAVAILABLE` com valor `null` (DEC-014).
- Fotografia atual nunca substitui histórico não reconstruível (DEC-014, DEC-024 e DEC-028).
- Ausência física da entidade ou fonte necessária nunca é convertida em zero (DEC-014, DEC-029 e DEC-030).

## Dependências de implementação ainda abertas

- Para fotografia histórica, reconstruir situação e vigência efetiva dos contratos; DEC-028 só resolve a equivalência de status atual.
- Modelar designações históricas, titularidade/suplência e unidade; DEC-024 só resolve a carteira atual e DEC-025 permanece pendente.
- Reavaliar a regra da DEC-026 antes de ampliar o protótipo além da fotografia atual e do modelo atual.
- Comprovar reconstrução histórica confiável por indicador e data de referência; não apresentar estado atual como histórico.
- Definir a fonte por item, os efeitos de aditivos e a evolução do MER necessários à DEC-029.
- Definir a integração real com o Projeto de KPIs para `externalViolations`.
- Fechar unidade de contagem, janela temporal, granularidade, severidade, estado, agregação e deduplicação das violações externas.
- Identificar fontes físicas de `priorityQueue[].supplierName` e, se houver preenchimento futuro, de `severity`, `title` e `dueAt`; DEC-027 fixa `null` para esses três campos enquanto não houver fonte formal.
- Identificar o campo real do nome em `public.fornecedor`.
- Definir e modelar a entidade, os estados e os eventos de plano de ação exigidos pela DEC-030.
- Definir a política concreta de autorização para abrir a visão Fiscal, sem confundi-la com a carteira da DEC-024 (DEC-031).
- Fechar o schema estrito dos descritores de `meta.sources` além do que está demonstrado na especificação de endpoints.

## DEC-033 — Contratos atuais e saldo consolidado no resumo Fiscal

**Status:** APROVADA para este lote local do protótipo, conforme pedido de enriquecimento do Dashboard Fiscal.

Esta extensão acrescenta ao HTTP 200, sem mudar filtros, autenticação ou campos
anteriores, `data.contracts` e `data.contractBalances`, propriedades obrigatórias
`array | null`. `meta.dataCoverage` passa a conter também `contracts` e
`contractBalances`, cada uma com `AVAILABLE | UNAVAILABLE`. A restrição anterior
a exatamente quatro chaves da DEC-014/023 é ampliada por esta decisão.

- `contracts[]`: `contractId` (inteiro positivo seguro), `contractNumber` e
  `supplierName` (`string | null`), `value` (`number | null`), `expiryDate`
  (`YYYY-MM-DD | null`). A seleção reutiliza os IDs da carteira autorizada por
  `contratos.designacao` (`usuario_id`, `papel = 'fiscal'`, `ativo = true`), após
  validação/restrição de `contratoId`, e retorna contratos com `status = 'vigente'`.
  Número, valor atual e fim da vigência vêm de `contratos.contrato`; fornecedor
  vem do vínculo direto `contrato.fornecedor_id` com
  `fornecedores.fornecedor.razao_social`, por LEFT JOIN, sem fallback de nome.
- `contractBalances[]`: `contractId`, `contractNumber`, `contractedValue`,
  `consumedValue`, `balanceValue`, `balancePct`. Os três valores financeiros vêm
  exclusivamente de `contratos.vw_saldo_contrato.valor_contratado`,
  `valor_consumido` e `valor_saldo`, ligada por `contrato_id` à mesma carteira
  vigente. `balancePct = balanceValue / contractedValue * 100` somente com
  `contractedValue > 0` e resultado finito; nos demais casos, é `null`.
- Consulta válida sem contratos vigentes retorna `[]/AVAILABLE` nas duas listas.
  Uma linha ausente na view ou valor financeiro ausente/inválido/inseguro em
  qualquer contrato torna **toda** a lista de saldos `null/UNAVAILABLE`. Não há
  cobertura `PARTIAL`, zero inventado nem substituição por `contrato.valor_total`.
  Um percentual matematicamente indefinido pode ser `null` com valores
  financeiros disponíveis e cobertura da lista `AVAILABLE`.
- Para data passada, ambas as listas são `null/UNAVAILABLE`, seguindo DEC-024/028;
  nenhuma fotografia atual é usada para reconstruir histórico.
- Falha de consulta continua erro interno segundo o tratamento existente;
  indisponibilidade de cobertura não mascara falhas de SQL.

Não são aprovadas regras por item, saúde agregada, classificação por faixa,
alertas de `vigencia_vencendo`, SLA externo ou novas inferências de execução.
`criticalItems` e `overdueActions` continuam `null/UNAVAILABLE`; distribuição,
saúde e saldos por item permanecem indisponíveis. A fila e OS pendentes mantêm
DEC-026/027/032. O fornecedor destas listas não altera a semântica da fila.

## DEC-034 — Alertas contratuais no resumo Fiscal

**Status:** APROVADA para este lote local, conforme pedido consolidado.

Esta decisão amplia DEC-033: a exclusão anterior de alertas de vigência deixa de
se aplicar à seção independente aqui definida. Acrescenta propriedades obrigatórias
`data.contractAlerts: array | null` e `meta.dataCoverage.contractAlerts:
AVAILABLE | UNAVAILABLE`, preservando todos os campos anteriores.

Cada alerta contém `alertId` e `contractId` (inteiros positivos seguros),
`contractNumber` e `description` (`string | null`), `expiryDate`
(`YYYY-MM-DD | null`) e `createdAt` (datetime ISO 8601 com offset ou `null`).
A fonte é `comum.pendencia`: `entidade_tipo = 'contrato'`,
`entidade_id = contratos.contrato.id`, `tipo = 'vigencia_vencendo'` e
`status = 'aberta'`. O contrato deve ser vigente e pertencer à carteira atual
resolvida por designação ativa de fiscal, depois da autorização de `contratoId`.
O vencimento vem exclusivamente de `contrato.vigencia_fim`.

A consulta recebe os IDs autorizados como parâmetro; não liga designações ou
`comum.decisao`, deduplica por pendência e ordena por `p.criado_em DESC, p.id DESC`.
Consulta atual válida retorna lista/AVAILABLE, inclusive `[]` sem alertas ou
com carteira vazia. Histórico ou escopo não reconstruível retorna
`null/UNAVAILABLE`, sem consultar a fotografia atual. Falhas SQL continuam
no tratamento de erro interno existente, nunca como indisponibilidade.

A seção mostra contrato, descrição e vencimento, com estado vazio explícito e
Indisponível para cobertura insuficiente. Não participa de `priorityQueue`,
`overdueActions`, `criticalItems` ou KPIs; não infere severidade, responsabilidade,
atraso, SLA ou obrigação de ação.

## Extensão local — saldos por item da carteira atual

O resumo Fiscal inclui `data.itemBalances`. `coverage: "UNAVAILABLE"` indica data histórica ou fonte não disponibilizada. `coverage: "AVAILABLE"` inclui `criterio`, `resumo`, `agregados` e `itens`; carteira sem itens tem `itens: []` e contagens zero. A consulta usa `bi.saldos_por_item` e somente IDs da carteira autorizada atual. `cards.criticalItems` mantém a regra distinta da DEC-007/029.

`criterio` informa `base` (`comprometido|medido`), `dimensao` (`valor|quantidade`) e limiares em escala 0–1. Padrões: `comprometido`, `valor`, `0.60` e `0.10`, configuráveis por `SALDO_FAIXA_BASE`, `SALDO_FAIXA_DIMENSAO`, `SALDO_LIMIAR_ATENCAO` e `SALDO_LIMIAR_CRITICO`. A faixa usa razão decimal não arredondada; `pctSaldo` e `pctSaldoMedido` são razões arredondadas a quatro casas. `resumo` conta todos os itens retornados.

Cada item contém identificação do contrato, fornecedor e item; sequência, especificação, unidade; quantidades e valores contratados, consumidos, medidos e saldo; `valueMeasuredBalance` e `quantityMeasuredBalance` calculados no backend; percentuais; faixa e status cadastral de verificação. `blockedAt` e `blockReason` são `null` enquanto o banco local não disponibilizar as colunas da migration oficial 0043. Cada agregado monetário é `null` se algum item carecer de um valor necessário para aquele agregado; medido nulo é tratado como zero quando o contratado existe, conforme a regra oficial. Os agregados usam os decimais originais do PostgreSQL, com arredondamento final ao centavo (meio para longe de zero) e rejeição de valores fora da precisão segura. `itemCount`, `contractedValueRows`, `committedBalanceRows` e `measuredBalanceRows` expõem coberturas independentes; `completeValueRows` permanece por compatibilidade. A lista considera apenas contratos vigentes da carteira autorizada. O ciclo financeiro permanece indisponível sem fontes comprovadas para suas etapas.

## Apresentação da fila de OS — análise de fontes e limitações

A seção antes intitulada “Minha fila de ação” passa a se chamar **OS com decisão
fiscal pendente na carteira**. Não é uma nova regra de elegibilidade: conserva
DEC-026/027/032. A carteira autorizada não equivale a tarefas atribuídas ao usuário;
`comum.pendencia.responsavel_id` não participa da seleção. “Severidade” substitui
“Prior.”, pois `severity` não é prioridade ou IPA. A ordem recebida é preservada,
sem classificação de urgência ou ranking.

Na revisão inicial, quando `title` era nulo, a tela explicava o motivo geral de inclusão: **Decisão fiscal
pendente no Processo 1**, diretamente sustentado pelo predicado DEC-026. Isso não
preenche `title` na API nem inventa título/descrição individual. A extensão DEC-035 abaixo passa a usar as descrições de `pendencies` como motivo;
`title` é preservado no contrato, mas deixa de determinar o texto da célula.
Severidade, fornecedor e prazo fornecidos continuam sem transformação de negócio. `dueAt` usa o fuso solicitado somente para apresentação.

“Impacto” e “Ação recomendada” eram células fixas com “Indisponível”: **não existem
campos correspondentes no contrato HTTP**. Passam a explicar “Impacto não apurado”
e “Recomendação não definida para esta OS”. Não há fonte aprovada para severidade,
impacto, prazo de decisão ou recomendação individual. Saldo/valor de contrato ou
OS não representam impacto financeiro; competência, emissão, criação e vigência
não representam prazo de decisão. O tipo `decisao_fiscal_p1` não significa
prioridade P1. A fila continua diferenciando `[]` de `null`, independentemente
do card `pendingServiceOrders`.

### Propostas e lacunas identificadas na revisão inicial

- Orientação geral para `decisao_fiscal_p1`: “Analisar a OS e registrar a decisão
  fiscal no SAC”, sem recomendar aprovar/corrigir. Depende de aprovação funcional;
  não autoriza chamada de escrita nem integração com a API oficial.
- Motivo específico: lacuna resolvida pela DEC-035, após pedido explícito de
  apresentar todas as pendências elegíveis por OS. Não escolher a primeira ou
  mais recente implicitamente. DEC-027 continua fixando `title: null` no adapter real.
- Identificação da OS resolvida pela DEC-035. Fornecedor canônico, responsável direto, prazo, prioridade
  e impactos exigem mapeamentos ou extensões aprovados antes de preencher a fila.
  Um responsável registrado ao assumir/resolver pendência não altera automaticamente
  o escopo da carteira nem comprova uma atribuição prévia ao fiscal.

A rastreabilidade completa está em `mapeamento-fisico-resumo-fiscal.md`, seção
“Rastreabilidade da fila de OS na apresentação”. Apenas o protótipo BI e seus
testes/documentos foram alterados; nenhuma API, serviço ou dado do SAC oficial
foi modificado. Não há botões de aprovação/correção nem chamadas de escrita.

## DEC-035 — Descrições das pendências de decisão fiscal agrupadas por OS

**Status:** APROVADA pelo pedido de apresentar todas as pendências pertinentes,
com uma linha por OS. Extensão local do resumo Fiscal; não altera o SAC oficial.

Vínculo confirmado por DEC-026, mapeamento físico e código oficial de
`notificar_fiscal`/`decidir_fiscal`: `comum.pendencia.entidade_tipo = 'ordem_servico'`
e `entidade_id = ordens.ordem_servico.id`. Somente `tipo = 'decisao_fiscal_p1'` e
`status IN ('aberta', 'em_tratamento')` são elegíveis. Pendências de saldo,
mapeamento, outros processos/tipos, entidades diferentes, resolvidas e canceladas
não entram como motivo. O lado cliente e o contrato direto na carteira autorizada
continuam obrigatórios. Nenhuma pendência é selecionada pelo responsável.

Cada item `priorityQueue[]` acrescenta propriedades obrigatórias:

- `serviceOrderId`: inteiro positivo seguro, de `ordens.ordem_servico.id`.
- `pendencies`: array não vazio de objetos estritos com `pendencyId` (inteiro
  positivo seguro, de `comum.pendencia.id`), `description` (`string | null`, de
  `comum.pendencia.descricao`) e `status` (`aberta | em_tratamento`).

Mantém os sete campos HTTP anteriores, inclusive `title: null` no adapter real.
A seleção retorna todas as pendências elegíveis, sem limite ou escolha por
recência. O repository agrupa por OS e deduplica pendências somente por ID;
descrições iguais de IDs distintos são preservadas. Descrições são aparadas nas
bordas; ausentes ou vazias tornam-se `null`. A ordem técnica é por ID da OS
(como anteriormente) e ID da pendência; não indica prioridade. O schema rejeita
OS repetidas na fila e pendências repetidas dentro da mesma OS.

A consulta da fila usa JOIN com os mesmos critérios da pendência usados pelo
EXISTS do card, centralizados no predicado compartilhado. O card mantém
`COUNT(DISTINCT os.id)`, não conta pendências. IDs de contrato já autorizados e
restringidos por `contratoId` são o único parâmetro da consulta; uma eventual
linha fora desse conjunto é rejeitada pelo adapter, sem expor conteúdo.

A tabela mostra o ID da OS e todas as descrições, como texto escapado, dentro de
uma única linha por OS. Para cada descrição ausente/vazia, mantém “Decisão fiscal
pendente no Processo 1”. Não usa `title` para substituir as descrições nem altera
fornecedor, severidade, prazo, impacto ou recomendação. Carteira continua distinta
de atribuição pessoal. Lista vazia e indisponibilidade histórica mantêm DEC-032;
nenhuma consulta atual é feita para histórico não reconstruível.

Exemplo parcial do item (campos anteriores omitidos apenas neste trecho):

```json
{
  "serviceOrderId": 11,
  "pendencies": [
    { "pendencyId": 101, "description": "Documento divergente", "status": "aberta" },
    { "pendencyId": 102, "description": null, "status": "em_tratamento" }
  ]
}
```

A proposta de orientação geral permanece pendente. Nenhuma prioridade, prazo,
impacto ou recomendação foi acrescentada. Alterações apenas no protótipo BI,
seus contratos de resposta, testes e documentação; sem escrita no banco nem
chamadas a APIs oficiais de decisão.

## Apresentação dos saldos dos itens — ausência, filtros e zero real

A apresentação Fiscal distingue quatro estados sem alterar o contrato HTTP,
os cálculos da API ou o hook compartilhado `useItemBalanceFilters`:

- Fonte disponível e `itens: []`: os três totais financeiros mostram **Sem itens
  cadastrados**, com explicação de que não há dados de itens da carteira para
  avaliar o saldo. Contagens continuam zero; a API conserva seus agregados.
- Fonte disponível, carteira com itens e filtro local sem resultados: mantém
  os totais do recorte vazio calculados pelo hook e explica que representam um
  recorte sem resultados, orientando ajustar/limpar filtros. Não rotula a carteira
  como sem itens cadastrados.
- Fonte indisponível: mantém a mensagem própria e esconde totais e controles.
  Não representa indisponibilidade como carteira vazia ou saldo zero.
- Itens existentes com valores calculáveis iguais a zero: mostra **R$ 0,00**,
  sem mensagem de ausência de itens. Nulos, cobertura incompleta e limites de
  precisão mantêm o comportamento anterior.

A identificação de carteira vazia usa a lista completa recebida no recorte
API autorizado, antes dos filtros locais. Filtros válidos são preservados entre
atualizações; fornecedor/contrato inválidos são limpos, enquanto faixa/busca
podem permanecer. Fonte indisponível não apaga seleções válidas; mudança de
fiscal ou do escopo explícito reinicia os filtros, conforme comportamento atual.

O painel **Saldo consolidado por contrato** continua independente, com valores
de `contratos.vw_saldo_contrato`; seu saldo não substitui os totais por item.
A mudança é exclusiva da apresentação Fiscal; não altera o dashboard do gerente,
o hook compartilhado, consultas, serviços, dados do banco ou regras de faixas.

## Detalhes expansíveis dos itens no Fiscal

Cada item do recorte local pode expandir seus dados já retornados pela API:
`valueContracted`, `valueConsumed`, `valueMeasured`, `valueBalance` e
`valueMeasuredBalance`; `quantityContracted`, `quantityConsumed`,
`quantityMeasured`, `quantityBalance` e `quantityMeasuredBalance`; `unit` e
`statusVerificacao`. Valores zero são exibidos numericamente; valores ausentes
permanecem “Não informado”, sem substituir dados por saldo global ou estimativas.

A explicação usa `faixa` e `criterio` da resposta, conforme
`services/api/src/shared/item-balances.ts::classifyBalance/composeItemBalances`.
Na dimensão `valor`, compara saldo/valor contratado; em `quantidade`, compara
saldo/quantidade contratada. A base `comprometido` usa `valueBalance` ou
`quantityBalance`; a base `medido` usa os saldos medidos já calculados pelo
serviço. A classificação exige contratado positivo e saldo informado:

- `critico`: razão ≤ `limiar_critico`.
- `adequado`: razão ≥ `limiar_atencao`.
- `atencao`: razão estritamente entre os dois limiares.
- `nao_verificavel`: saldo ou contratado ausentes, ou contratado não positivo.

A interface identifica os limiares como provisórios e usa os valores efetivamente
retornados, sem fixar 10%/60%. Não reclassifica o item a partir de valores
monetários/percentuais arredondados: o serviço decide com a razão decimal
original. `pctSaldo` ou `pctSaldoMedido` são exibidos conforme a base selecionada.
O status cadastral de verificação é mostrado separadamente e não determina a
faixa. Quando a medição é ausente, explica a convenção existente do serviço:
medição ausente é zero para calcular saldo medido quando há contratado; o campo
original de medição permanece ausente.

A expansão usa botão nativo, operável por teclado, com `aria-expanded`,
`aria-controls`, nome identificando o item e região associada; o foco fica no
botão ao expandir/recolher. Não realiza novas chamadas ou ações de negócio.
Filtros, agregados, carteira autorizada e estados de ausência de itens, fonte
indisponível e saldo real zero permanecem. A implementação e os estilos são
restritos ao Fiscal; nenhuma alteração no dashboard do gerente, no hook
compartilhado, contrato HTTP, backend ou banco. Não acrescenta recomendações.

## Apresentação relativa da vigência contratual no Fiscal

As células de vencimento em **Alertas contratuais** e **Contratos fiscalizados**
preservam `expiryDate` em formato `DD/MM/YYYY` e acrescentam a situação em
relação a `summary.meta.dataReference`:

- Data futura: “Vence em N dias”.
- Mesma data: “Vence hoje”.
- Data passada: “Vencido há N dias”.
- Data ausente ou inválida: “Data de vigência indisponível”.

Usa “dia” no singular para N = 1. A comparação valida rigorosamente os dois
valores `YYYY-MM-DD` e calcula a diferença de dias de calendário. Usa uma
representação UTC apenas para aritmética do calendário, sem converter a data
para o fuso do navegador. Não consulta o relógio atual, `generatedAt`, data de
criação da pendência ou fim de outro contrato; referência inválida também fica
indisponível, sem fallback para hoje.

Datas impossíveis (como 31 de fevereiro), formatos ambíguos ou timestamps não
são tratados como vencimento válido. A validação HTTP vigente não foi alterada:
respostas malformadas continuam sujeitas à rejeição pelo schema. A defesa na
apresentação não normaliza automaticamente datas inválidas.

A nota nos dois painéis identifica a data de referência e esclarece que essa
contagem se refere à **vigência contratual**, não ao prazo de decisão fiscal.
Não cria severidade, faixas de risco, alertas ou recomendações. Não remove nem
acrescenta linhas segundo o vencimento: conserva o conjunto enviado pela API,
a seleção de alertas DEC-034 e a carteira DEC-033. Assim, um contrato retornado
com status vigente pode ter vencimento passado sem que a tela o reclassifique.

Listas vazias continuam vazias; cobertura histórica insuficiente continua
`null/UNAVAILABLE`, sem consultar ou apresentar a fotografia atual. Nenhuma
alteração em consultas, serviço, contrato HTTP, autorização, fila fiscal,
saldo ou dashboard do gerente. Estilos adicionais são restritos ao Fiscal.

Validação: testes de ontem/hoje/amanhã, virada de mês e ano, bissextos (inclusive
séculos), valores ausentes/inválidos e referência diferente do relógio atual.
O roteiro `scripts/test/fiscal-contract-expiry.visual.mjs` usa o Vite existente,
com respostas interceptadas apenas no navegador, em desktop e 390 px, com
fusos opostos e relógio fixado em 2040. Não acessa nem modifica o banco.

## Filtros locais da fila fiscal agrupada por OS

A seção **OS com decisão fiscal pendente na carteira** usa somente
`data.priorityQueue` já recebida: não envia filtros adicionais à API, não
consulta novas fontes e não modifica a contagem global `pendingServiceOrders`.
Contrato, status (`todos`, `aberta`, `em_tratamento`) e busca são independentes
dos filtros de itens e dos demais painéis. A elegibilidade DEC-026/035 e a
distinção entre carteira autorizada e atribuição pessoal permanecem.

- Contrato usa `contractId`; opções são extraídas da fila original e exibem o
  número quando disponível e o ID. Números iguais não unem contratos distintos.
  O contrato não identificado é tratado apenas se vier como `null` na resposta.
- Busca textual ignora caixa/acentos e espaços nas bordas. Usa `serviceOrderId`
  (ID bruto ou identificação “OS ID”), `contractId`, `contractNumber`,
  `supplierName` e `pendencies[].description`. Não inventa número de OS, não
  pesquisa título legado ou textos de fallback como se fossem dados da fonte.
- Se a busca corresponde a OS/contrato/fornecedor, mostra as pendências que
  passam pelo status selecionado. Se corresponde apenas a descrições, mostra
  somente as pendências que correspondem à descrição **e** ao status.
  Correspondências em pendências diferentes não são combinadas para admitir a OS.
- A OS só aparece quando há pelo menos uma pendência correspondente. Mantém uma
  linha por `serviceOrderId` e a ordem da resposta, sem inferir prioridade.
  Cada pendência visível mostra seu status; outras pendências da mesma OS são
  indicadas pela quantidade oculta pelos filtros. Dados da resposta não são
  apagados, modificados ou deduplicados novamente.

“X de Y OS” conta OS visíveis versus OS da fila recebida, não pendências nem o
card global. O botão **Limpar filtros da fila** restaura apenas esse recorte
local. Não amplia o escopo autorizado pelo servidor.

Consulta válida com `[]` apresenta “Fila apurada sem ocorrências” e “0 de 0 OS”.
Fila com OS e recorte local vazio apresenta “Nenhuma OS encontrada com os filtros
atuais” e “0 de Y OS”. Fila `null` apresenta “Fila indisponível”, sem controles
ou contagem zero inventada, independentemente do card global (DEC-032).

Usuário, unidade, conjunto de contratos consultados e `meta.dataReference`
identificam o contexto da fila; sua mudança reinicia os três filtros. Ordenação
dos IDs do filtro de contrato não muda o contexto. Atualização no mesmo contexto
preserva os filtros; contrato que deixa de existir nas opções é mantido como
não disponível, com aviso, sem ampliar silenciosamente o recorte. Carga ou
indisponibilidade temporária não apaga seleções do mesmo contexto. Alterar a
consulta externa de KPIs não define novo contexto da fila.

Controles nativos têm rótulos, navegação por teclado e foco visível. O roteiro
`scripts/test/fiscal-queue-filters.visual.mjs` intercepta respostas válidas de
fixtures isoladas e valida múltiplas OS/pendências, filtro combinado, card e
outros painéis intactos, reinício por usuário/escopo, estados vazios e tela de
390 px. Nenhum dado do banco ou serviço/API oficial foi alterado.

## Exportação local CSV da fila fiscal

**Exportar CSV** usa somente OS e pendências visíveis após os filtros locais,
sem consulta adicional, mudança de contrato HTTP ou indicadores globais. Cada
linha representa uma pendência; a mesma OS pode ocupar várias linhas. As colunas
são `meta.dataReference`, `serviceOrderId`, `contractId`, `contractNumber`,
`supplierName`, `pendencyId`, `description` e `status` (valor recebido da API).
Campos ausentes ficam vazios, exceto descrição sem conteúdo, que preserva o
motivo geral “Decisão fiscal pendente no Processo 1”. O gerador preserva uma
linha com esse motivo e ID/status de pendência vazios se receber uma OS sem
detalhes; isso é defensivo, pois o contrato HTTP vigente exige ao menos uma
pendência detalhada e continua inalterado.

O download no navegador chama-se `fila-fiscal-AAAA-MM-DD.csv`, usando a referência
da resposta. CSV UTF-8 com BOM, separador ponto e vírgula e linhas CRLF; células
entre aspas, aspas internas duplicadas e quebras de linha preservadas. Textos
iniciados por `=`, `+`, `-` ou `@`, inclusive após espaços/caracteres de controle,
recebem apóstrofo inicial para evitar interpretação como fórmula em planilhas.
A exportação fica desabilitada com fonte indisponível, fila vazia ou filtros
sem resultados. Mantém o escopo autorizado, filtros e a distinção entre carteira
e atribuição pessoal. Fixtures e downloads da validação ficam fora do fluxo
normal da aplicação; nenhuma alteração no banco ou API oficial.


## Atualização manual do dashboard fiscal

**Atualizar dados** reutiliza `loadFiscalSummary` e o mesmo GET existente, com
`includeExternal` vigente. Não seleciona usuário, não adiciona parâmetros,
consulta de banco, regra de negócio ou integração com o SAC oficial. Autorização
continua no servidor. Não há atualização automática ou execução de ações.

Durante a nova consulta, a última resposta permanece visível, com indicador
“Atualizando dados”; o botão fica desabilitado e uma trava síncrona bloqueia
cliques repetidos. Cada consulta tem uma geração; mudança de consulta invalida
as anteriores e resultados/erros atrasados não sobrescrevem a resposta mais
recente. Desmontagem também invalida a consulta. O recorte efetivamente retornado
pela API (usuário/unidade/contratos/data) continua controlando a reinicialização
dos filtros, sem permitir que uma resposta antiga restaure outro escopo.

Falha na atualização mantém os dados, filtros e horário anteriores, com aviso
explícito “Os dados não foram atualizados” e possibilidade de tentar novamente.
Falha no carregamento inicial mantém a apresentação de erro sem dados simulados;
o botão permite repetir a consulta. Uma resposta válida indisponível continua
indisponível, com seus próprios estados, sem substituir a fonte por dados antigos.

Filtros da fila e itens continuam válidos no mesmo contexto. No Fiscal, contrato
ou fornecedor selecionado que desaparece permanece selecionado com indicação
“não disponível na resposta” e aviso; não se limpa silenciosamente para mostrar
toda a carteira. O recorte fica sem correspondências até outra seleção/limpeza
explícita, ou até a opção reaparecer. Mudança de usuário/escopo mantém o reset já
existente. A opção de retenção do hook compartilhado é usada somente pelo Fiscal;
o Gerente conserva seu comportamento anterior.

**Última atualização do dashboard** usa exclusivamente `meta.generatedAt`,
formatado em `meta.timezone`, separado de `meta.dataReference`. Representa a
geração da resposta recebida, não o horário da última alteração do banco.
Sem sucesso novo, esse horário não avança.

Testes cobrem sucesso, falha, recuperação, cliques repetidos, respostas/erros
atrasados após escopo novo, preservação de filtros, opções desaparecidas e
formatação do horário. O roteiro `scripts/test/fiscal-refresh.visual.mjs` usa
fixtures isoladas com respostas controladas, teclado e desktop/390 px, sem
chamadas ao banco ou API oficial.

## Exportação CSV dos saldos dos itens do Fiscal

**Exportar itens CSV** usa somente o recorte local de `data.itemBalances.itens`,
na ordem exibida (ordem da resposta por padrão) e uma linha por item, sem consultas
adicionais ou cálculo de saldo/classificação. Não representa o saldo consolidado
por contrato. Fonte ausente/`UNAVAILABLE`, carteira sem itens ou recorte sem
resultados deixam o controle desabilitado. Não modifica filtros, autorização,
indicadores globais, exportação da fila ou dashboard do Gerente.

Colunas usam os campos existentes: `meta.dataReference`, `contractId`,
`contractNumber`, `itemId`, `sequence`, `supplierName`, `specification`, `unit`,
`valueContracted`, `valueConsumed`, `valueMeasured`, `valueBalance`,
`valueMeasuredBalance`, `quantityContracted`, `quantityConsumed`,
`quantityMeasured`, `quantityBalance`, `quantityMeasuredBalance`, `pctSaldo`,
`pctSaldoMedido`, `faixa`, `statusVerificacao`, `blockedAt` e `blockReason`.
Cada linha repete os critérios efetivos `criterio.base`, `dimensao`,
`limiar_atencao` e `limiar_critico`, identificados como provisórios nos cabeçalhos.
Faixa/status são exportados exatamente como recebidos, sem novas recomendações.

Campos nulos ficam vazios, incluindo medição ausente; não se aplica novamente
no CSV a convenção de medição ausente como zero. Zeros permanecem `0` e negativos
numéricos mantêm o sinal, sem apóstrofo. Números não recebem formatação monetária,
conversão de percentual ou arredondamento adicional; usam representação decimal
com ponto. Razões e limiares são exportados na escala decimal recebida.

O arquivo `itens-fiscal-AAAA-MM-DD.csv` usa a data de referência da resposta,
UTF-8 com BOM, ponto e vírgula, linhas CRLF e escape de aspas/quebras de linha.
O codificador e o download são compartilhados com o CSV da fila. Apenas campos
textuais iniciados por símbolos de fórmula, inclusive após espaços/controles,
recebem apóstrofo de proteção. Campos ausentes não ganham textos de fallback.

Testes cobrem recorte combinado, campos ausentes/zero/negativos, caracteres
especiais, critérios medido/quantidade alternativos e manutenção da exportação
da fila. O roteiro `scripts/test/fiscal-items-csv.visual.mjs` valida downloads,
teclado, desktop e 390 px com fixtures isoladas e sem acesso ao banco.


## Ordenação local dos itens do Fiscal

Os controles **Ordenar itens por** e **Direção da ordenação** afetam somente a
tabela de itens e a ordem do CSV de itens. O padrão **Ordem da resposta** preserva
exatamente a lista recebida após os filtros locais, inclusive a multiplicidade.
Selecionar contrato/item, saldo ou percentual permite crescente/decrescente; a
ordenação ativa é apresentada em texto anunciado por `role=status`.

- **Contrato / item (IDs)** compara numericamente `contractId`, depois `itemId`.
  Não interpreta número de contrato, sequência ou descrição como prioridade.
- **Saldo disponível** usa `valueBalance`/`quantityBalance` na base comprometida
  ou `valueMeasuredBalance`/`quantityMeasuredBalance` na base medida, conforme
  `criterio.dimensao`. É o mesmo campo que alimenta a célula Saldo da tabela.
- **Percentual disponível** usa `pctSaldo` ou `pctSaldoMedido`, conforme a base
  efetiva da resposta. A razão já foi calculada pelo serviço na dimensão escolhida.
  Ordena a razão original, antes de sua apresentação percentual.

Não compara textos formatados nem recalcula faixa, saldo ou razão. Nulos ficam
no final em ambas as direções; empates numéricos e empates entre nulos usam IDs
de contrato/item em ordem crescente. Empates de identificação conservam a ordem
relativa da resposta (ordenação estável). Zeros e negativos participam da
comparação numérica original.

A ordenação copia a lista filtrada e preserva objetos/ordem da resposta original.
Totais continuam usando a lista filtrada anterior à ordenação. As contagens da
seção de distribuição usam o recorte anterior à faixa, descrito abaixo.
Filtros, carteira autorizada, fila e seu CSV, classificações e dashboard do
Gerente permanecem sem mudança funcional. Linhas usam chave de contrato/item;
detalhes expansíveis continuam associados ao mesmo item após reordenar.

Atualização manual, alteração dos filtros locais ou consulta externa no mesmo
contexto preservam a escolha. Fonte indisponível temporária não a apaga.
Mudança de fiscal, unidade, conjunto de contratos consultados ou data de
referência reinicia para a ordem da resposta. IDs de escopo em ordem diferente
não definem novo contexto. Limpar filtros não limpa a ordenação.

Testes cobrem números negativos/zero/ausentes, valores próximos que seriam
iguais no texto arredondado, empates, todas as combinações de base/dimensão,
filtros combinados, detalhes, preservação/reset e ordem do CSV. O roteiro
`scripts/test/fiscal-item-sort.visual.mjs` valida teclado e desktop/390 px com
fixtures isoladas, sem consultas ao banco ou SAC oficial.

## Paginação local da tabela de itens do Fiscal

A sequência de apresentação é **filtros locais → ordenação local → página**.
**Itens por página** oferece 10, 25 ou 50, com padrão 25. Os controles nativos
**Página anterior** e **Próxima página** têm limites desabilitados e o intervalo,
total filtrado e página atual são anunciados em `role=status`. Com recorte vazio,
a apresentação é “Exibindo 0–0 de 0 itens filtrados · Página 0 de 0”.

Mudar fornecedor, contrato, faixa, busca, ordenação/direção ou tamanho retorna à
primeira página. Limpar filtros também retorna à primeira página quando altera
o recorte. Atualização no mesmo contexto preserva página/tamanho; se o total
diminuir e invalidar a página, ajusta à última disponível. Uma resposta vazia
válida retorna à primeira página interna. Carregamento/falha de atualização ou
indisponibilidade temporária não apagam a seleção da página. Mudança de usuário,
unidade, conjunto de contratos consultados ou data de referência reinicia página
e tamanho para o padrão (25), no mesmo contexto usado pela ordenação.

A paginação só recorta as linhas renderizadas. Totais e cobertura continuam
considerando **todos os itens filtrados**, antes da paginação. As contagens da
seção de distribuição usam fornecedor/contrato/busca antes da faixa, conforme
a seção abaixo.
**Exportar itens CSV** exporta **todos os itens filtrados na ordem escolhida**,
mesmo em outra página; a explicação junto ao botão informa que não exporta apenas
a página atual e não representa o saldo consolidado por contrato. Não envia
parâmetros de paginação à API nem modifica autorização, critérios ou classificações.

Linhas mantêm chave de contrato/item. Itens fora da página são desmontados e
retornam recolhidos, sem transferir o estado dos detalhes para outro item. Os
estados próprios de carteira sem itens, filtros sem resultados e fonte
indisponível continuam distintos; a fonte indisponível não apresenta controles
ou contagens fabricadas. O dashboard do Gerente não usa essa paginação.

Testes cobrem limites de 10/25/50, resultados reduzidos, filtros/ordenação,
atualização manual, mudança de contexto, detalhes e CSV completo/ordenado. O
roteiro `scripts/test/fiscal-item-pagination.visual.mjs` usa 51 itens de fixture
isolada em desktop e 390 px, com Tab/setas/Enter e respostas interceptadas, sem
consultas ao banco ou SAC oficial.


## Faixas clicáveis e contagens anteriores ao filtro de faixa

Na seção **Distribuição dos itens por faixa**, os quatro botões reutilizam o
mesmo `band`/`setFilter` usado pelo seletor local de faixa da tabela. Selecionar
aplica a faixa; selecionar a ativa novamente remove somente esse filtro; mudar
pelo seletor também sincroniza o botão ativo. Preserva fornecedor, contrato,
busca e ordenação, e a paginação existente retorna à primeira página quando a
faixa muda.

As contagens dessa seção usam todos os itens que correspondem a **fornecedor,
contrato e busca**, **antes da faixa e da paginação**, contados diretamente por
`item.faixa` retornada pelo serviço. O escopo é informado na própria seção. Não
recalcula classificações, razões ou critérios. A faixa ativa não faz as demais
contagens desaparecerem: inclusive uma faixa com contagem zero pode ser escolhida
ou removida, mantendo o estado de filtros sem resultados.

Tabela, totais dos itens, contadores de críticos/não verificáveis junto aos
totais e CSV completo continuam usando o filtro de faixa aplicado. Indicadores
globais, saldo consolidado por contrato, fila e APIs permanecem inalterados.
O hook compartilhado fornece adicionalmente a distribuição anterior à faixa;
a distribuição já existente mantém seu significado pós-faixa para o Gerente,
sem mudança funcional nesse dashboard.

Botões nativos têm `aria-pressed`, rótulo de faixa/contagem, foco visível, borda
ativa e indicação textual **✓ Selecionada**, sem depender só de cor. Carteira
sem itens apresenta a explicação própria e quatro contagens zero com botões
desabilitados. Fonte indisponível mantém **Indisponível**, sem botões ou zeros
inventados. Atualização no mesmo contexto conserva o filtro existente; mudança
de usuário/escopo mantém os resets já documentados.

Testes cobrem seleção, remoção, troca, sincronização, filtros combinados,
contagens antes da faixa, paginação, totais/CSV e estados sem dados. O roteiro
`scripts/test/fiscal-band-distribution.visual.mjs` usa fixture isolada com 96
itens de dois contratos da carteira autorizada, Tab/Espaço/Enter e desktop/390 px, sem
acessar o banco ou SAC oficial.
