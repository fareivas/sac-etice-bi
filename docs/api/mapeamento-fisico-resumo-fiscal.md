# Mapeamento físico do resumo do Fiscal

**Endpoint de referência:** `GET /api/v1/fiscais/me/dashboard/resumo`  
**Objetivo:** registrar evidências físicas documentadas e lacunas para orientar a implementação. Este relatório não cria nem altera decisões de negócio e não afirma que estruturas propostas já estejam implantadas.

## Como ler as classificações

- **CONFIRMADO_ATUAL** — objeto/campo aparece no modelo legado descrito nos documentos como existente.
- **CONFIRMADO_PROPOSTA** — objeto/campo aparece apenas na proposta de evolução ou no SQL proposto.
- **EXTERNO_KPI** — pertence ao Projeto de KPIs, fora do MER do SAC.
- **NÃO_CONFIRMADO** — a documentação não determina origem, semântica, disponibilidade em produção ou regra suficiente.

Não foi fornecido acesso a um catálogo de banco implantado, dump de DDL de produção ou dados operacionais. Portanto, “atual” significa documentado como parte do MER atual, não verificado em uma instância em execução.

## Contrato HTTP já decidido

O contrato normativo permanece em [`decisoes-contrato-fiscal.md`](./decisoes-contrato-fiscal.md), DEC-001 a DEC-023. Este documento apenas mapeia evidência física. Em particular, preserva: cobertura histórica separada por indicador; indisponibilidade distinta de zero; identidade do usuário autenticado separada das designações por contrato; ausência de heurísticas para os campos da fila; e KPIs como fonte externa.

## Evidência por domínio

### A. Identidade do Fiscal, designações e autorização

| Item | Classe | Evidência e limite |
| --- | --- | --- |
| Entidade/usuário `public.usuario` | **CONFIRMADO_ATUAL**; coluna `id` no DDL físico atual **NÃO_CONFIRMADO** | `ER-ETICE-GERAL.pdf`, p. 1, identifica `USUARIO`. A proposta §4.1 e `alteracoes_mer_sac_postgresql.sql`, §2, referenciam `public.usuario(id)` como destino de FK; isso documenta o alvo esperado, mas não substitui o catálogo implantado. A DEC-017 fixa normativamente que `data.fiscal.userId` identifica `public.usuario.id`. |
| Campo físico de nome utilizável em `public.usuario` | **NÃO_CONFIRMADO** | Os documentos mostram a entidade `USUARIO`, mas não identificam coluna de nome nem regra de nome utilizável. Não presumir `nome`, nome de exibição, e-mail ou fallback. `data.fiscal.name` deve vir da dependência de identidade ou ser `null`. |
| Fiscal legado no contrato | **CONFIRMADO_ATUAL** | `CONTRA-ORDEM-FATU.pdf`, p. 1, bloco `contrato`, lista `gestor` e `fiscal` como texto. A especificação de endpoints, §6.2, também descreve o estado atual como `contrato.gestor/fiscal` em texto. Não há, nesse campo, vínculo relacional ou período de designação demonstrado. |
| Designação de Fiscal por contrato | **CONFIRMADO_PROPOSTA** | Proposta, §4.1; SQL, §2, tabela `sac_gestao.designacao_contrato`: `contrato_id`, `usuario_id`, `unidade_id`, `papel`, `principal`, `data_inicio`, `data_fim`, `documento_designacao_id`, `status`. FKs apontam a `public.contrato`, `public.usuario`, unidade e documento. Papéis permitidos no CHECK: `FISCAL_TITULAR`, `FISCAL_SUPLENTE`, `GESTOR_TITULAR`, `GESTOR_SUBSTITUTO`; estados do DDL proposto: `ATIVA`, `ENCERRADA`, `SUSPENSA`. |
| Validade histórica da designação | **CONFIRMADO_PROPOSTA**, suporte **incompleto** | Os períodos `data_inicio`/`data_fim` permitem representar intervalo. Porém `sac_gestao.vw_designacao_ativa` no SQL, §9, fixa `CURRENT_DATE`; não pode responder por si só a uma data de referência passada. A tabela não tem histórico de mudanças de `status`; não está demonstrado que todos os dados históricos serão carregados. |
| Autorização à visão Fiscal versus carteira | **NÃO_CONFIRMADO** | A especificação de endpoints, §1, determina derivar autorização da identidade autenticada e proíbe ID arbitrário em `/me`; a DEC-016 permite 200 com carteira vazia. Os documentos não definem mecanismo físico de autenticação/autorização à visão separado da associação contratual. Designação define carteira, não prova por si só autorização ao endpoint. |

### B. `activeContracts`

| Item | Classe | Evidência e limite |
| --- | --- | --- |
| Contrato, número e vigência | **CONFIRMADO_ATUAL** | `CONTRA-ORDEM-FATU.pdf`, p. 1, bloco `contrato`: `id`, `numero`, `ano`, `lado`, FKs de cliente/fornecedor e modalidade, `valor_total`, `vigencia_inicio`, `vigencia_fim`, `gestor`, `fiscal`, `status`. O diagrama não documenta catálogo de `status`. |
| Estado ativo/suspenso/encerrado | **NÃO_CONFIRMADO** | `contrato.status` é texto no modelo, mas não há valores físicos ou mapeamento semântico documentados. A DEC-010 requer situação semântica `ATIVO` e exclui `SUSPENSO`/`ENCERRADO`, mas deixa o mapeamento legado aberto. |
| Aditivos/prorrogações | **CONFIRMADO_ATUAL** quanto à existência de `public.aditivo`; regras físicas de vigência **NÃO_CONFIRMADO** | O PDF ER identifica `ADITIVO`, sem expor aqui colunas que estabeleçam a vigência efetiva. Na proposta/SQL, `sac_gestao.aditivo_item` tem `tipo_alteracao` incluindo `PRORROGACAO`, `vigencia_inicio` e valores por item (§3 do SQL); não há coluna de término efetivo do contrato nem regra que componha a vigência final. |
| Rescisão/encerramento/suspensão histórica | **NÃO_CONFIRMADO** | Não há catálogo legado nem trilha de eventos de situação contratual documentados que permitam reconstruir esses estados na `dataReference`. Datas de vigência isoladas não foram aprovadas como predicado suficiente. |
| Escopo por designação | **CONFIRMADO_PROPOSTA** | `designacao_contrato` liga usuário e contrato e registra papel/período; `vw_designacao_ativa` só atende data corrente. Múltiplas designações exigem contagem distinta, conforme DEC-010; nenhum SQL é inferido aqui. |

### C. `pendingServiceOrders`

| Item | Classe | Evidência e limite |
| --- | --- | --- |
| Ordem e chave | **CONFIRMADO_ATUAL** | `CONTRA-ORDEM-FATU.pdf`, p. 1, bloco `ordem_servico`: `id` PK, `numero`, `lado`, `contrato_id`, `cliente_id`, `fornecedor_id`, `competencia`, `vigencia_inicio`, `vigencia_fim`, `status`. O tipo/nullability física das FKs não é detalhado pelo diagrama. |
| Lados | **CONFIRMADO_ATUAL** | O mesmo bloco documenta `lado` como `cliente | fornecedor`. A especificação de endpoints, §6.3, ilustra `side: CLIENTE`; não formaliza qual lado compõe o card. |
| Itens e ramificações | **CONFIRMADO_ATUAL** | O PDF ER e `CONTRA-ORDEM-FATU.pdf`, p. 1, documentam `ordem_servico_item.ordem_servico_id`, `contrato_item_id`, `servico_id` e valores/quantidades. O diagrama mostra OS Cliente decompondo em relação 1:N e gerando OS Fornecedor em relação 1:1; também mostra `subordem` ligando OS Cliente, item, contrato/item de fornecedor e OS Fornecedor. Isso pode multiplicar linhas em joins; a unidade do card continua OS distinta por DEC-011. |
| Status físico e lista de valores | **CONFIRMADO_ATUAL** apenas como coluna texto; valores **NÃO_CONFIRMADO** | `ordem_servico.status` existe como texto no diagrama, sem CHECK/catálogo. A especificação, §6.3, descreve funcionalmente OS não lidas, pendentes de autorização, rejeitadas ou aguardando execução e avisa que é necessário separar status de negócio de não lido. `PENDENTE_AUTORIZACAO` no exemplo JSON é valor de exemplo do contrato do endpoint, não catálogo físico. |
| Datas e histórico de status | **CONFIRMADO_ATUAL** para competência/vigência; suporte histórico **NÃO_CONFIRMADO** | O esquema registra `competencia`, `vigencia_inicio` e `vigencia_fim`, não prazo funcional de autorização/tratamento. O desenho ER contém o rótulo `trilha_status`, mas não fornece definição de colunas, chave, relação inequívoca com a OS ou cobertura; não prova reconstrução histórica. |
| Predicado de pendência e lado contado | **NÃO_CONFIRMADO** | A DEC-011 requer mapear status que exigem ação do Fiscal, sem contar `unread` como regra de negócio e sem duplicar CLIENTE/FORNECEDOR. Os documentos não definem a máquina real de estados, lado elegível ou deduplicação física adequada. |

### D. `criticalItems`

| Item | Classe | Evidência e limite |
| --- | --- | --- |
| Item contratual | **CONFIRMADO_ATUAL** | `CONTRA-ORDEM-FATU.pdf`, p. 1, bloco `contrato_item`: `id`, `contrato_id`, `seq`, `especificacao`, `chave_desambiguacao`, `unidade`, `quantidade`, `valor_unitario`, `valor_total`, `servico_id`, `status_verificacao`. `ordem_servico_item` e `memoria_calculo` fazem referência ao item. |
| Movimentos/snapshot | **CONFIRMADO_PROPOSTA** | Proposta, §4.2; SQL, §3, `sac_gestao.movimento_contrato_item` registra tipos `ADITIVO`, `AJUSTE_CONTRATUAL`, `ORDEM_SERVICO`, `CANCELAMENTO_OS`, `MEDICAO`, estornos e eventos com `data_evento`; `saldo_item_snapshot` registra `data_referencia`, `valor_vigente`, `saldo_a_executar` e demais saldos, único por item/data. O DDL não comprova que os eventos/snapshots existam ou estejam completos. |
| View e faixa | **CONFIRMADO_PROPOSTA** | SQL, §9, `vw_saldo_item_contrato` calcula `valor_vigente`, `saldo_a_executar`, `percentual_saldo_a_executar` e `faixa_saldo`. `valor_vigente <= 0` classifica como `VERMELHO`; DEC-007 proíbe contar esse caso automaticamente e exige a regra percentual apenas para `valor_vigente > 0`. |
| Reconstrução histórica | **NÃO_CONFIRMADO** como disponibilidade operacional | `saldo_item_snapshot` pode fornecer fotografia por data se existir e estiver reconciliado. A view proposta agrega `movimento_contrato_item` sem corte por `data_evento`, usando o conjunto inteiro, e calcula a partir de `contrato_item.valor_total`; não filtra por `dataReferencia`. Portanto a view, sozinha, não reconstrói estado passado. Origem/cobertura dos dados de snapshot e movimentos não está comprovada. |

### E. `overdueActions`

| Item | Classe | Evidência e limite |
| --- | --- | --- |
| Risco e associação contratual | **CONFIRMADO_PROPOSTA** | Proposta, §4.4; SQL, §5: `sac_gestao.risco` liga opcionalmente a contrato/item, cliente, fornecedor, unidade; registra `categoria`, `titulo`, `severidade`, `data_identificacao`, `data_limite`, `status`, responsável e timestamps. Categorias CHECK incluem `SALDO`, `VIGENCIA`, `FINANCEIRO`, `CONTINUIDADE`, `COMERCIAL`, `JURIDICO`, `DOCUMENTAL`, `ALERTA_EXTERNO`; severidades `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. |
| Plano, prazo e responsável | **CONFIRMADO_PROPOSTA** | SQL, §5, `sac_gestao.plano_acao`: `risco_id` obrigatório, `titulo`, `prioridade` P1–P4, `responsavel_usuario_id`, `unidade_responsavel_id`, `data_prevista` obrigatória, `data_conclusao`, `status` default `ABERTA`, percentual e timestamps. A DEC-012 fixa `data_prevista` e a condição temporal, mas não define estados especiais. |
| Histórico | **CONFIRMADO_PROPOSTA**, mas insuficiente para todos os atributos | `historico_acao` registra `status_anterior`, `status_novo`, `ocorrido_em`, usuário e observação. Não armazena colunas de valor anterior/novo para prazo, conclusão ou responsável. Apesar de a prosa da proposta §4.4 mencionar histórico de prazo/responsável, o DDL listado não fornece essas versões. Reabertura, cancelamento e status completos permanecem sem catálogo. |
| Fonte no MER atual | **NÃO_CONFIRMADO** | A especificação de endpoints, §6.4, classifica riscos/ações como `PROPOSTA`; o script cria as tabelas em `sac_gestao`. Não há evidência de plano de ação no MER atual documentado. |

### F. `priorityQueue` do tipo `SERVICE_ORDER`

| Campo/relação | Classe | Evidência e limite |
| --- | --- | --- |
| `contractId` | **CONFIRMADO_ATUAL** como relação candidata | `ordem_servico.contrato_id` e `contrato.id` aparecem como FK/PK em `CONTRA-ORDEM-FATU.pdf`, p. 1. A semântica para OS dos dois lados e o vínculo canônico da ocorrência ainda requerem validação do fluxo. O campo de saída segue DEC-021 (`integer | null`). |
| `contractNumber` | **CONFIRMADO_ATUAL** como coluna candidata | `contrato.numero` é `text` no bloco `contrato` do PDF complementar, p. 1. Seu vínculo exato à ocorrência deve seguir o `contractId` confirmado; sem contrato/número utilizável, sem fallback, conforme DEC-021. |
| `supplierName` | **NÃO_CONFIRMADO** | OS/contrato têm `fornecedor_id` candidato e entidade `public.fornecedor` existe, mas o PDF não documenta a coluna real do nome nem define qual fornecedor da cadeia CLIENTE/FORNECEDOR descreve a ocorrência. Não atravessar OS/subordem nem selecionar fornecedor por heurística. DEC-020 exige `null` enquanto a fonte formal não estiver confirmada. |
| `severity` | **NÃO_CONFIRMADO** | `risco.severidade` e o exemplo `ALTA` existem em outros domínios/propostas, mas não há vínculo que atribua severidade à OS. Status da OS, prioridade P1–P4 e IPA não são equivalentes. Manter `null` sem fonte formal, conforme DEC-018. |
| `title` | **NÃO_CONFIRMADO** | A especificação de endpoints, §6.1, exemplifica “Autorizar OS-2026-0881”; não define template nem coluna física de título para OS. Não derivar de número/status; manter `null` sem texto formal, conforme DEC-021. |
| `dueAt` | **NÃO_CONFIRMADO** | O exemplo da fila em §6.1 e o endpoint de pendências §6.3 apresentam prazo; a tabela atual da OS tem competência e vigência, mas não prazo de autorização/tratamento. Esses conceitos não são intercambiáveis. Não mapear vigência/data de recebimento ou prazo de ação; manter `null` conforme DEC-019. |
| Campos que podem ser preenchidos com a evidência atual | **NÃO_CONFIRMADO** para ocorrência real completa | Existe uma relação candidata para `contractId` e uma coluna candidata `contrato.numero`; ainda faltam confirmar lado, vínculo da ocorrência e integridade dos registros reais. Nenhum dos outros campos ganha valor por heurística. A interface/repository deve poder repassar `null` nos campos não confirmados. |

### G. `uuid_integracao` e Projeto de KPIs

| Item | Classe | Evidência e limite |
| --- | --- | --- |
| Coluna UUID em contrato | **CONFIRMADO_PROPOSTA** | Proposta §6 e SQL §1 adicionam `public.contrato.uuid_integracao`, preenchem UUID, default e índice único; o apêndice A também lista a alteração. Não é evidência de implantação no MER atual. |
| UUIDs em entidades relacionadas | **CONFIRMADO_PROPOSTA** | O mesmo bloco SQL adiciona UUID a `contrato_item`, `ordem_servico`, `cliente`, `fornecedor` e `servico`, com índices únicos propostos. |
| Relação de integração | **EXTERNO_KPI** | A especificação de endpoints, §1 e §6.5, indica Projeto de KPIs correlacionado por `contrato.uuid_integracao`; a proposta §6 chama UUID de chave canônica e coloca a API agregadora entre os domínios. `externalViolations` é KPI externo (DEC-013). |
| Disponibilidade e cobertura dos UUIDs | **NÃO_CONFIRMADO** em produção | O SQL é migração proposta; o próprio script recomenda publicar UUIDs após reconciliação e avaliar `NOT NULL` somente depois (pós-execução). Não há evidência de execução, preenchimento completo, sincronização no Projeto de KPIs, nem contrato temporal/agregador das violações. |

## Lacunas que ainda impedem SQL real

1. Confirmar o catálogo/DDL implantado e os tipos, nullability, constraints, colunas de nome e dados reais; as referências atuais são diagramas e um script explicitamente proposto.
2. Definir mapeamento legado da situação de contrato e efeito de aditivos, prorrogação, suspensão, rescisão e encerramento em `dataReference`.
3. Confirmar quais tabelas e dados de designação foram implantados, a semântica histórica de `status`, e cobertura dos períodos de titular/suplente.
4. Mapear máquina de estados real de OS, papel de CLIENTE/FORNECEDOR, histórico, ação exigida do Fiscal e chave que evita duplicação entre ordens/subordens/itens.
5. Verificar se saldo snapshots/eventos existem, cobertura/reconciliação e possibilidade de obter `saldo_a_executar` e `valor_vigente` na data-alvo. A view proposta não é temporal.
6. Confirmar implantação e completude de risco/plano/histórico, catálogo real de status, alterações históricas de prazo/conclusão e semântica de cancelamento/reabertura.
7. Confirmar fonte física de `supplierName`, `severity`, `title` e `dueAt` e qual contrato/fornecedor pertence a cada ocorrência de OS.
8. Confirmar implantação, completude e publicação dos `uuid_integracao`; fechar o contrato externo de unidade, janela, granularidade, estado, severidade, agregação e deduplicação das violações antes de consulta KPI real.

## Referências documentais usadas

- `docs/reference/specs/ER-ETICE-GERAL.pdf`, p. 1: diagrama do MER atual e entidades/relacionamentos.
- `docs/reference/specs/CONTRA-ORDEM-FATU.pdf`, p. 1: blocos de colunas de `contrato`, `contrato_item`, `ordem_servico`, `ordem_servico_item`, `subordem` e `memoria_calculo`.
- `docs/reference/specs/Especificacao_Endpoints_Dashboards_SAC_ETICE.docx`, §§1, 6.1–6.5 e tabelas “Base de dados”, “Parâmetros”, “Resposta”; exemplos JSON dos endpoints do Fiscal.
- `docs/reference/specs/ETICE_Especificacao_Requisitos_Dashboards_Gestao_Contratos_v1_2_Preditivo.docx`, §§4.11, 5.3–5.4 e 12: conteúdo funcional do IPA, da fila Fiscal e do escopo funcional; não é DDL físico.
- `docs/reference/specs/Proposta_Evolucao_MER_SAC_ETICE.docx`, §§1–2, 4.1–4.4, 6–7, 9 e apêndices A–B: divisão SAC/KPIs e caráter proposto das extensões.
- `docs/reference/specs/alteracoes_mer_sac_postgresql.sql`, §§1–3, 5, 9, pós-execução: DDL proposto de UUID, designações, eventos/snapshots, riscos/ações e views.
