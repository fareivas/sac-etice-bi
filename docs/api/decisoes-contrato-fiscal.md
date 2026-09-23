# Decisões de contrato do resumo do Fiscal

**Endpoint:** `GET /api/v1/fiscais/me/dashboard/resumo`.

**Objetivo:** registrar as decisões de contrato aprovadas para que o planejamento e a implementação não dependam do histórico da conversa. Lacunas de origem física permanecem explícitas; nenhuma delas autoriza uma regra por heurística. As DEC-024 a DEC-031 complementam as decisões anteriores sem alterar o schema HTTP consolidado na DEC-023.

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

**Decisão normativa:** `data.priorityQueue` é obrigatória; `[]` significa ausência de ocorrências após consulta válida. Nesta primeira versão, somente `type: "SERVICE_ORDER"` é suportado. Cada item tem `type`, `severity`, `contractId`, `contractNumber`, `supplierName`, `title` e `dueAt`. Não há campo IPA, paginação embutida nem ordenação implícita. A fila não é declarada equivalente à fila funcional completa.

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
| `data.priorityQueue` | Sim | array de `SERVICE_ORDER`; `[]` após consulta válida vazia | Não aplicável |
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

**Status:** AINDA_BLOQUEADA por decisão funcional humana. A análise da fotografia atual foi aprovada como diagnóstico, não como regra de elegibilidade.

**Constatações aprovadas:** `decisao_fiscal_p1` com status `aberta` ou `em_tratamento` comprova apenas um subconjunto de decisões do Fiscal, não o total do card. `aguardando_fiscal` isoladamente não prova elegibilidade: a transição manual pode ocorrer sem criar essa pendência. OS do lado fornecedor não entra automaticamente por estar relacionada a OS cliente. A travessia por `ordens.subordem` para atribuir OS cliente à carteira não foi aprovada; OS cliente com `contrato_id` nulo permanece sem regra inequívoca de escopo. Múltiplas pendências da mesma OS não devem implicar múltipla contagem: a unidade final continua sendo IDs distintos de OS elegíveis, conforme DEC-011. A fotografia atual não reconstrói a carteira, o status da OS e a pendência em `dataReferencia` passada; o indicador histórico permanece `UNAVAILABLE` conforme DEC-014. `unread` não é estado de negócio.

**Bloqueio:** a implementação do **total** de `pendingServiceOrders` depende de decisão funcional humana sobre os estados e fluxos que exigem ação do Fiscal, tipos/estados de pendência, participação dos lados cliente e fornecedor, tratamento de OS cliente sem contrato direto e eventual vínculo por subordem. Não publicar o subconjunto `decisao_fiscal_p1` como total nem converter a impossibilidade de apuração em zero. A proposta analisada anteriormente não aprova nenhuma dessas escolhas de negócio.

## DEC-027 — Elegibilidade de `priorityQueue`

**Status:** APROVADA quanto ao vínculo padrão com DEC-026; implementação PENDENTE dessa decisão funcional.

**Decisão normativa:** por padrão, itens `SERVICE_ORDER` usam a mesma elegibilidade aprovada para `pendingServiceOrders`, salvo decisão explícita futura em contrário. Enquanto não houver fonte formal, `severity`, `title` e `dueAt` são `null`, preservando as propriedades obrigatórias das DEC-006 e DEC-018 a DEC-021. Não chamar qualquer ordenação de IPA ou prioridade de negócio sem regra formal. A seleção de ocorrências da fila permanece dependente da DEC-026; `[]` continua significando ausência após consulta válida, não indisponibilidade presumida.

### Auditoria da indisponibilidade no HTTP 200

O contrato consolidado da DEC-023 representa os cards SAC `pendingServiceOrders`, `criticalItems` e `overdueActions` indisponíveis por `null` acompanhado de `meta.dataCoverage` igual a `UNAVAILABLE` para cada card. Para `externalViolations`, `null` com fonte KPIs `UNAVAILABLE` e `updatedAt: null` representa ausência de dado externo válido (DEC-003/004); com `includeExternal=false`, `null` significa consulta externa desabilitada (DEC-005). Nenhum desses casos equivale ao inteiro `0` apurado.

**Lacuna operacional da fila:** `data.priorityQueue` é obrigatória e seu tipo é array; `[]` significa ausência de ocorrências **após consulta válida** (DEC-006). A especificação de endpoints, seção 6.1, não prevê `null`, omissão, `coverage`/`status` próprio nem outro mecanismo para declarar a fila indisponível. `meta.dataCoverage.pendingServiceOrders` qualifica o card, não altera o significado do array da fila. Portanto, quando a elegibilidade ou a fonte da fila não puder ser apurada, nenhum HTTP 200 completo representa honestamente esse estado no contrato atual. A DEC-027 continua dependente da DEC-026. Não alterar o schema ou usar `[]` para contornar a lacuna sem decisão contratual documentada.

**Estado da implementação:** o schema de contracts exige `priorityQueue` como array; a porta do repository retorna somente uma fila apurada; o service hoje coloca `[]` quando o escopo histórico é `UNAVAILABLE`, o que não constitui uma representação contratual de indisponibilidade. O handler publicado permanece 501. O harness DEV/TEST não publica HTTP 200 enquanto essa lacuna e a elegibilidade da DEC-026 permanecerem abertas.

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

## Reafirmações das decisões vigentes

- `unidadeId` válido e fora do escopo autorizado gera `403 FORBIDDEN_SCOPE` (DEC-016, DEC-022 e DEC-025).
- Cobertura histórica é avaliada independentemente por card; `AVAILABLE` com valor `0` é diferente de `UNAVAILABLE` com valor `null` (DEC-014).
- Fotografia atual nunca substitui histórico não reconstruível (DEC-014, DEC-024 e DEC-028).
- Ausência física da entidade ou fonte necessária nunca é convertida em zero (DEC-014, DEC-029 e DEC-030).

## Dependências de implementação ainda abertas

- Para fotografia histórica, reconstruir situação e vigência efetiva dos contratos; DEC-028 só resolve a equivalência de status atual.
- Modelar designações históricas, titularidade/suplência e unidade; DEC-024 só resolve a carteira atual e DEC-025 permanece pendente.
- Fechar a elegibilidade completa de OS da DEC-026 antes de implementar `pendingServiceOrders` ou a seleção de `priorityQueue` da DEC-027.
- Comprovar reconstrução histórica confiável por indicador e data de referência; não apresentar estado atual como histórico.
- Definir a fonte por item, os efeitos de aditivos e a evolução do MER necessários à DEC-029.
- Definir a integração real com o Projeto de KPIs para `externalViolations`.
- Fechar unidade de contagem, janela temporal, granularidade, severidade, estado, agregação e deduplicação das violações externas.
- Identificar fontes físicas de `priorityQueue[].supplierName` e, se houver preenchimento futuro, de `severity`, `title` e `dueAt`; DEC-027 fixa `null` para esses três campos enquanto não houver fonte formal.
- Identificar o campo real do nome em `public.fornecedor`.
- Definir e modelar a entidade, os estados e os eventos de plano de ação exigidos pela DEC-030.
- Definir a política concreta de autorização para abrir a visão Fiscal, sem confundi-la com a carteira da DEC-024 (DEC-031).
- Fechar o schema estrito dos descritores de `meta.sources` além do que está demonstrado na especificação de endpoints.
