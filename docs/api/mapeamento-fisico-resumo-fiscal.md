# Mapeamento físico do resumo do Fiscal

**Endpoint de referência:** `GET /api/v1/fiscais/me/dashboard/resumo`  
**Objetivo:** registrar evidências físicas documentadas e lacunas para orientar a implementação. Este relatório não cria nem altera decisões de negócio e não afirma que estruturas propostas já estejam implantadas.

## Como ler as classificações

- **CONFIRMADO_ATUAL** — objeto/campo aparece no modelo legado descrito nos documentos como existente.
- **CONFIRMADO_PROPOSTA** — objeto/campo aparece apenas na proposta de evolução ou no SQL proposto.
- **EXTERNO_KPI** — pertence ao Projeto de KPIs, fora do MER do SAC.
- **NÃO_CONFIRMADO** — a documentação não determina origem, semântica, disponibilidade em produção ou regra suficiente.

As seções anteriores registram a análise baseada nos documentos de referência deste protótipo. A seção “Verificação no SAC oficial”, acrescentada depois, registra inspeção read-only do repositório oficial e da instância PostgreSQL local; ela não afirma que a instância local representa produção.

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

#### Investigação operacional de pendências de OS (SAC oficial, 2026-09-23)

**Classificação: PARCIALMENTE_MAPEADO.** Há um subconjunto identificável de decisões do Fiscal no Processo 1, mas não uma regra completa e inequívoca para `pendingServiceOrders` da DEC-011. `getPendingServiceOrders` permanece sem SQL.

1. **Tipo específico:** `decisao_fiscal_p1` com `entidade_tipo = 'ordem_servico'` é criado por `agentes/p1_ordem_servico/grafo.py::notificar_fiscal` e resolvido por `api/rotas_ordens.py::decidir_fiscal`. `saldo_insuficiente` também pode ser criado para a mesma OS, mas o código não o define como decisão do Fiscal. Pendências de mapeamento são representadas por `ordens.subordem.status = 'mapeamento_pendente'`, não por esse tipo de `comum.pendencia`.
2. **Estados:** `aberta` e `em_tratamento` são os estados ainda acionáveis usados tanto na criação idempotente quanto na ação fiscal. `resolvida` e `cancelada` saem desse conjunto; `api/rotas_operacao.py` permite assumir, resolver e cancelar pendências genericamente.
3. **Cobertura:** `decisao_fiscal_p1` é criada apenas quando o grafo P1 chega ao nó `notificar_fiscal`. `api/rotas_ordens.py::mudar_status` permite levar uma OS de `em_validacao` a `aguardando_fiscal` sem criar pendência. Logo, uma OS com status que sugere ação fiscal pode não ter `decisao_fiscal_p1`.
4. **Duplicação:** `notificar_fiscal` evita repetir uma pendência ainda aberta/em tratamento, mas a tabela `comum.pendencia` não tem unicidade por tipo/entidade; uma OS pode acumular pendências de tipos diferentes e novos ciclos de decisão depois de resolução. Uma eventual contagem precisaria usar OS distintas e definir quais tipos entram.
5. **Lado:** `api/rotas_ordens.py::executar_p1` aceita somente OS `cliente`; `ordens.subordem` liga uma OS cliente a zero/uma OS fornecedor por subordem. A inclusão das OS fornecedor e o tratamento de possíveis pares cliente/fornecedor no card não estão normatizados.
6. **Contrato:** `pendencia.entidade_id` aponta para `ordem_servico.id` quando `entidade_tipo = 'ordem_servico'`. `ordem_servico.contrato_id` é FK nullable. Para OS cliente sem contrato direto, atravessar `subordem` pode produzir múltiplos contratos fornecedor e não há regra aprovada que os equipare à carteira do Fiscal.
7. **Status sem pendência:** o CRUD permite a transição manual para `aguardando_fiscal` apenas atualizando `ordem_servico.status`; `pendente` também pode representar bloqueio por saldo, com pendência de outro tipo. `unread` não aparece como critério de negócio.
8. **Fotografia atual:** é possível consultar com segurança o subconjunto `decisao_fiscal_p1` aberto/em tratamento vinculado a OS, mas não provar que ele equivale a todas as OS pendentes de autorização ou tratamento pelo Fiscal. A união com status, subordens e outros tipos exigiria escolha semântica não aprovada.
9. **Histórico:** `comum.pendencia` possui `criado_em`/`resolvida_em`, mas não registra todas as transições (como início de `em_tratamento`); `ordem_servico` guarda status atual e `atualizado_em`, sem histórico completo de status comprovado. Não há reconstrução confiável para `dataReferencia` passada.

**Fontes físicas:** `backend/migrations/sql/0001_baseline.sql` (`comum.pendencia`, `ordens.ordem_servico`); `backend/migrations/versions/0005_subordem.py`; `backend/agentes/p1_ordem_servico/grafo.py`; `backend/api/rotas_ordens.py`; `backend/api/rotas_operacao.py`. Todas consultadas somente em leitura.

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

## Estado da camada executável

- A fronteira de autenticação/autorização do endpoint está definida por interfaces; o mecanismo real continua **NÃO_CONFIRMADO** e não foi implementado.
- A factory injetável `createFiscalDashboardHandler` está implementada e compõe autenticação, parser, service e helpers HTTP.
- O export de produção `handler` permanece em HTTP 501 até existirem adapters reais de autenticação, repository e KPIs.

## Referências documentais usadas

- `docs/reference/specs/ER-ETICE-GERAL.pdf`, p. 1: diagrama do MER atual e entidades/relacionamentos.
- `docs/reference/specs/CONTRA-ORDEM-FATU.pdf`, p. 1: blocos de colunas de `contrato`, `contrato_item`, `ordem_servico`, `ordem_servico_item`, `subordem` e `memoria_calculo`.
- `docs/reference/specs/Especificacao_Endpoints_Dashboards_SAC_ETICE.docx`, §§1, 6.1–6.5 e tabelas “Base de dados”, “Parâmetros”, “Resposta”; exemplos JSON dos endpoints do Fiscal.
- `docs/reference/specs/ETICE_Especificacao_Requisitos_Dashboards_Gestao_Contratos_v1_2_Preditivo.docx`, §§4.11, 5.3–5.4 e 12: conteúdo funcional do IPA, da fila Fiscal e do escopo funcional; não é DDL físico.
- `docs/reference/specs/Proposta_Evolucao_MER_SAC_ETICE.docx`, §§1–2, 4.1–4.4, 6–7, 9 e apêndices A–B: divisão SAC/KPIs e caráter proposto das extensões.
- `docs/reference/specs/alteracoes_mer_sac_postgresql.sql`, §§1–3, 5, 9, pós-execução: DDL proposto de UUID, designações, eventos/snapshots, riscos/ações e views.

## Verificação no SAC oficial

**Escopo inspecionado:** repositório `/home/fabio/projects/SAC-ETICE`, remoto `IFCE/SAC-ETICE`, branch `main`, commit `a71a13d9473e156882a5de7f3cc1652133af4960`. A árvore oficial estava limpa durante a inspeção. Nenhum arquivo foi alterado.

**Banco:** conexão read-only bem-sucedida com a instância local documentada em `infra/compose.dev.yml`, database `sac`, PostgreSQL `16.15`. Todas as consultas de catálogo e agregações abaixo foram executadas entre `BEGIN READ ONLY` e `ROLLBACK`; não foram consultados nomes, e-mails, tokens ou outras linhas pessoais. O `alembic_version` implantado é `0032`; a cabeça do repositório inspecionado é `0036`. Nenhuma migration foi executada.

Nesta seção, as classificações significam:

- **DOCUMENTADO_E_ENCONTRADO** — descrito em migrations/código ou documentação oficial e localizado também no schema local, quando aplicável.
- **DOCUMENTADO_MAS_NAO_ENCONTRADO** — aparece na proposta/documentação ou código esperado, mas não nas migrations oficiais aplicáveis e/ou no catálogo da instância local.
- **ENCONTRADO_NAO_DOCUMENTADO** — existe no código/schema oficial consultado, mas não está descrito como tal nos documentos de referência deste protótipo.
- **INDETERMINADO** — evidência parcial, divergente ou insuficiente para afirmar semântica/cobertura.

### Evidência nas migrations

| Objeto/semântica | Classificação | Evidência oficial |
| --- | --- | --- |
| Usuário | **DOCUMENTADO_E_ENCONTRADO** | Baseline `backend/migrations/sql/0001_baseline.sql`: `comum.usuario` com PK `id bigint`, `nome text NOT NULL`, `email`, `senha_hash`, `ativo`, `criado_em`, `atualizado_em`; `comum.usuario_perfil` relaciona usuário e perfil. O modelo não está em `public.usuario`. |
| Contrato e fornecedor | **DOCUMENTADO_E_ENCONTRADO** | Baseline: `contratos.contrato` (`id`, `numero`, `ano`, `lado`, `fornecedor_id`, `cliente_id`, `valor_total`, `vigencia_inicio`, `vigencia_fim`, `gestor`, `fiscal`, `status`, timestamps), FKs para `fornecedores.fornecedor` e `comum.cliente`; `contratos.contrato_item`; `contratos.aditivo`; `fornecedores.fornecedor` com `razao_social`. Entidades correspondentes são namespaced e não `public.*`. |
| Designação por contrato | **DOCUMENTADO_E_ENCONTRADO** | Migration `backend/migrations/versions/0022_designacao_fiscal.py`: `contratos.designacao(id, contrato_id, usuario_id, papel, ativo, criado_por, criado_em)`, índice parcial para uma designação ativa por `(contrato_id, papel)` e índice por usuário. Não há `unidade_id`, `principal`, `data_inicio`, `data_fim` nem estado histórico por intervalo nessa tabela. Papel CHECK: `fiscal` ou `gestor`. |
| Ordem de serviço e itens | **DOCUMENTADO_E_ENCONTRADO** | Baseline: `ordens.ordem_servico`, `ordens.ordem_servico_item`, `ordens.medicao` e `ordens.medicao_item`. Migration `0005_subordem.py` remove a relação direta `os_espelhada_id` e cria `ordens.subordem`, que liga OS cliente, item, contrato/item fornecedor e, opcionalmente, OS fornecedor; há unicidade para OS fornecedor em `subordem`. Migration `0006_os_item_data_ativacao.py` acrescenta `ordem_servico_item.data_ativacao`. |
| Histórico/auditoria | **DOCUMENTADO_E_ENCONTRADO** para trilha genérica; cobertura temporal completa **INDETERMINADO** | Baseline cria `comum.auditoria` com `criado_em`, `dados_antes` e `dados_depois`; não cria versão temporal completa nem snapshots para contrato/OS/itens. As migrations não criam trilha específica de status de `ordem_servico` ou versões de designação por data. |
| `uuid_integracao` | **DOCUMENTADO_MAS_NAO_ENCONTRADO** | Não aparece nas migrations Alembic `0001`–`0036`. O banco local não tem colunas com esse nome nas entidades de contrato/OS/cliente/fornecedor/serviço. O `ALTER TABLE public.*` do SQL deste protótipo não corresponde ao layout namespaced oficial. |
| Risco, plano de ação, unidade organizacional e snapshot de saldo do SQL proposto | **DOCUMENTADO_MAS_NAO_ENCONTRADO** | Não há migration oficial para schema `sac_gestao`, `risco`, `plano_acao`, `historico_acao`, `unidade_organizacional`, `usuario_unidade`, `movimento_contrato_item` ou `saldo_item_snapshot`. O catálogo local também não contém schema `sac_gestao` nem tabelas `risco`/`plano_acao`. |
| Cabeça Alembic vs banco local | **INDETERMINADO** quanto a implantação sincronizada | Repositório contém migrations até `0036`; banco local marca `0032`. Portanto `0033`–`0036` não foram aplicadas nessa instância: `0033` inclui `bloqueada` no CHECK de `comum.extracao.status`; `0034` adiciona `formula_nome`/`formula_parametros` aos itens; `0035` adiciona `numero_real_impresso`; `0036` altera precisão numérica de quantidade/valor unitário e recria views. O banco consultado ainda mostra CHECK sem `bloqueada`, ausência dessas colunas e `numeric(14,4)`. Isso é drift local observado, não evidência sobre produção. |

### Evidência no código oficial

- O backend usa FastAPI e SQL explícito por `psycopg`; não foi encontrado um modelo ORM que substitua as migrations/código SQL como fonte física.
- A autenticação está em `backend/api/auth.py`: JWT HS256; `sub` contém o ID de usuário; o token carrega nome, e-mail e perfis. Em requisição protegida, `usuario_atual` valida o Bearer, decodifica o JWT e relê no banco o usuário ativo e seus perfis, de modo que desativação/rebaixamento tenham efeito sem esperar o vencimento do token. O token documentado no código dura 12 horas. O perfil de automação `servico` usa `sub=0` e caminho especial, sem linha em `comum.usuario`.
- `backend/core/autorizacao.py` contém uma matriz perfil × recurso. O perfil `fiscal` tem acesso aos recursos dessa matriz exceto `consulta_livre`; `admin` e `superadmin` passam pela matriz completa. A permissão é por recurso, não por contrato/unidade.
- `backend/api/rotas_bi.py` aplica a permissão `bi` por perfil e lê views gerenciais sem recorte contratual por designação. Isso não constitui autorização row-level reutilizável para o resumo Fiscal.
- `backend/contratos/designacao.py` implementa designações atuais `fiscal`/`gestor`: ao designar, desativa o registro ativo anterior daquele papel no contrato e insere outro; ao remover, marca `ativo=false`. `backend/api/rotas_designacao.py` deixa qualquer usuário autenticado listar designações de contrato existente e exige perfil `gestor` para alterá-las.
- **ENCONTRADO_NAO_DOCUMENTADO** nos documentos de referência do protótipo: há autorização específica em `backend/ordens/aprovacao.py::pode_fiscalizar`. Para ações de aprovação de ciclo, admin/superadmin passam; quando há fiscal designado em contratos do ciclo, exige designação ativa do usuário em um deles; sem designado no ciclo, o perfil `fiscal` é fallback. Essa regra é específica daquele fluxo e não define autorização geral à visão Fiscal nem escopo do dashboard.
- `backend/api/rotas_contratos.py` valida o catálogo de status de contrato e audita edições com valores antes/depois. `backend/api/rotas_ordens.py` valida status/lado e transições; edição e mudança manual de status registram alguns valores antes/depois em `comum.auditoria`.
- Os fluxos de extração em `backend/agentes/extracao/nos.py` também atualizam contratos/OS e itens. Em vários casos a auditoria é somente `dados_depois`; itens de OS podem ser apagados e reinseridos durante a atualização. A trilha não captura de forma uniforme o estado anterior completo.
- Busca no código/migrations oficiais não encontrou adapter/cliente do Projeto de KPIs, contrato HTTP externo ou ocorrência de `uuid_integracao`. As views em `bi` são derivadas do SAC.

### Evidência no banco local

O catálogo consultado confirma schemas namespaced `comum`, `contratos`, `ordens`, `fornecedores`, `catalogo`, `ingestao`, `bi`, entre outros. Em `public`, além de `alembic_version`, não há tabelas físicas de domínio.

| Catálogo real | Valores permitidos por CHECK/código | Valores observados no banco local (agregação) |
| --- | --- | --- |
| `contratos.contrato.status` | `rascunho`, `vigente`, `encerrado`, `rescindido`, `suspenso` | `vigente` |
| `ordens.ordem_servico.lado` | `cliente`, `fornecedor` | `fornecedor` |
| `ordens.ordem_servico.status` | `recebida`, `em_validacao`, `pendente`, `aguardando_fiscal`, `aprovada`, `aguardando_assinaturas`, `ativa`, `executada`, `cancelada` | `recebida` (no lado `fornecedor`) |
| `ordens.subordem.status` | `rascunho`, `mapeamento_pendente`, `pronta`, `os_gerada`, `cancelada` | nenhum valor observado |
| `contratos.designacao.papel` / estado | `fiscal`/`gestor`; estado é booleano `ativo`, não enum | tabela sem designações observadas |
| `comum.usuario_perfil.perfil` | CHECK no banco: `superadmin`, `admin`, `gestor`, `fiscal`, `financeiro`, `diretoria`, `operador` | `gestor`, `operador`, `superadmin`; nenhum perfil `fiscal` observado |
| `risco.severidade`, `plano_acao.status/prioridade` | não existem nessas tabelas no banco consultado | indisponível: tabelas não existem |

Os valores observados são somente uma fotografia dos dados presentes nessa instância local e não definem regra de negócio nem demonstram catálogo completo em produção. As constraints/código são a evidência do conjunto permitido.

### Diferenças entre documentação e implementação

1. A proposta SQL deste protótipo usa `public.usuario`, `public.contrato`, `public.contrato_item`, `public.ordem_servico`, `public.fornecedor`, `public.cliente` e `public.servico`. O SAC oficial usa, respectivamente, `comum.usuario`, `contratos.contrato`, `contratos.contrato_item`, `ordens.ordem_servico`, `fornecedores.fornecedor`, `comum.cliente` e `catalogo.servico`. O SQL proposto não deve ser tratado como aplicado nem executado contra o schema oficial sem reconciliação/migration apropriada.
2. DEC-017 nomeia `public.usuario.id`, mas a PK física oficial é `comum.usuario.id` (`bigint`). DEC-021 nomeia `public.contrato.id`, mas a PK física oficial é `contratos.contrato.id` (`bigint`). A existência de entidades correspondentes não resolve por si só essa divergência nominal normativa; ela precisa ser reconhecida antes de fixar os adapters físicos. O usuário autenticado do código oficial usa `comum.usuario.id`.
3. DEC-020 pressupõe `public.fornecedor`; a coluna real de nome é `fornecedores.fornecedor.razao_social` (`nome_fantasia` também existe e pode ser nulo). A coluna física está encontrada, mas a escolha de qual entidade fornecedora descreve uma ocorrência de OS cliente/fornecedor continua sem vínculo funcional aprovado.
4. O SQL proposto possui designação com períodos, unidade, papel titular/suplente e status; o SAC tem `contratos.designacao` com `fiscal`/`gestor` e `ativo`, sem unidade ou validade temporal. É uma estrutura relacionada, mas não equivalente.
5. O SQL proposto usa eventos/movimentos/snapshots, risco/plano de ação e UUIDs; essas estruturas não estão nas migrations oficiais inspecionadas nem no banco local. `contratos.aditivo`, `comum.auditoria` e `contratos.vw_saldo_item` existem, mas não substituem automaticamente `aditivo_item`, `historico_acao`, `movimento_contrato_item` ou `saldo_item_snapshot`.
6. A migration oficial mais recente `0036` é posterior ao banco local `0032`. O drift local foi confirmado pelas colunas numéricas e ausências/presenças indicadas acima; não houve tentativa de sincronização.

### Autenticação/RBAC real

- Identidade autenticada: `api.auth.Usuario.id` deriva do `sub` do JWT e é reconciliada com `comum.usuario.id`; nome/perfis são relidos no banco para usuário humano ativo.
- Perfis de aplicação incluem `superadmin`, `admin`, `gestor`, `fiscal`, `financeiro`, `diretoria`, `operador` e o token especial `servico`. O CHECK persistido no banco admite os sete perfis humanos acima; `servico` é tratado pelo formato do token, não por `usuario_perfil`.
- O perfil `fiscal` existe no catálogo/código, mas nenhum perfil ou designação `fiscal` foi observado na instância local consultada.
- RBAC de recurso e designação contratual são separados no código. A matriz não é escopo de linha; não há tabela de unidade/usuário-unidade no schema local. O helper específico de aprovação de ciclo não é política geral do endpoint.
- Não foi encontrada rota equivalente a `GET /api/v1/fiscais/me/dashboard/resumo` no código oficial inspecionado. Não inferir que o perfil fiscal, sozinho, define a carteira contratual nem que uma designação, sozinha, autoriza a visão.

### Histórico

`updated_at`/`atualizado_em` isolado não é histórico. O banco não possui triggers de histórico nas tabelas fiscalizadas nem tabelas de versão temporal para contrato, designação, OS ou itens. `comum.auditoria` registra somente operações instrumentadas pelo código e não é um event store completo.

| Indicador | Classificação | Evidência e limite para `dataReferencia` |
| --- | --- | --- |
| `activeContracts` | **HISTORICO_PARCIAL** | Status/vigências ficam no estado atual de `contratos.contrato`; alguns PATCH/reflexos de aditivo gravam antes/depois em auditoria e `contratos.aditivo` guarda fatos de aditivo. Não há validade temporal integral nem prova de que todas as alterações/importações estejam cobertas; não dá para garantir reconstrução confiável geral. |
| `pendingServiceOrders` | **HISTORICO_PARCIAL** | Transições manuais de status de OS registram status antes/depois em auditoria. Extrações e atualizações automatizadas não registram uniformemente estado anterior; não há histórico dedicado de status. Não se pode garantir estado da OS em qualquer corte temporal. |
| `criticalItems` | **HISTORICO_PARCIAL** para eventos auditados; cálculo confiável histórico **não disponível** | `contratos.vw_saldo_item` e `bi.saldos_por_item` calculam saldo a partir do conjunto atual de itens/OS; não recebem data de corte. Atualizações podem substituir itens, sem versão completa do saldo. Não há snapshot/movimento oficial de saldo; a auditoria não basta para afirmar valor histórico completo. |
| `overdueActions` | **INDETERMINADO** | A entidade aprovada `sac_gestao.plano_acao` e seu histórico nem existem nas migrations oficiais/local. Não há base física para avaliar prazo/conclusão no tempo. `comum.pendencia` não foi equiparada a plano de ação. |

### Viabilidade SQL por operação

Nenhuma query de produção foi escrita nesta investigação.

| Porta do repository | Estado | Evidência física e bloqueio |
| --- | --- | --- |
| `getFiscalIdentity` | **PARCIALMENTE_MAPEADO** | Fonte candidata confirmada: `comum.usuario.id` e `comum.usuario.nome`, com identidade verificada por JWT/RBAC em `api.auth`. O contrato aprovado nomeia `public.usuario.id`; resolver essa divergência física antes de implementar a consulta/adapter. A regra de nome “utilizável” continua sem critério além de permitir `null`. |
| `getAuthorizedContractScope` | **BLOQUEADO** | `contratos.designacao` oferece `usuario_id`, `contrato_id`, `papel`, `ativo`, mas só papéis `fiscal`/`gestor`, sem `unidade_id` ou datas de validade. DEC-010 exige escopo por titular/suplente na data de referência; DEC-016 separa autorização à visão desse escopo. A matriz RBAC não fornece recorte de linhas. |
| `getActiveContracts` | **BLOQUEADO** | Colunas candidatas confirmadas em `contratos.contrato`: `id`, `status`, `vigencia_inicio`, `vigencia_fim`; aditivos em `contratos.aditivo`. Status permitidos foram encontrados, mas sua equivalência à regra semântica aprovada e a vigência histórica composta não estão definidas/reconstruíveis com confiabilidade. |
| `getPendingServiceOrders` | **BLOQUEADO** | Fonte `ordens.ordem_servico`, FK nullable `contrato_id`, `lado`, `status`; `ordens.subordem` liga a cadeia cliente/fornecedor. Catálogo de valores e transições existe, mas ainda falta decidir quais exigem ação do Fiscal, lados contados, tratamento sem dupla contagem e estado no corte histórico. |
| `getCriticalItems` | **BLOQUEADO** | Fonte atual candidata: `contratos.contrato_item` + `contratos.vw_saldo_item` (`valor_contratado`, `valor_consumido`, `valor_saldo`) ou `bi.saldos_por_item`. Essas estruturas refletem estado atual, não nomes/valores de snapshot aprovados em DEC-007; faltam mapeamento semântico para `valor_vigente`/`saldo_a_executar` e histórico confiável. |


| `getOverdueActions` | **BLOQUEADO** | DEC-012 fixa `sac_gestao.plano_acao`, mas esse schema/tabela/status não existe no SAC oficial inspecionado. Não substituir por `comum.pendencia` por semelhança. |
| `getPriorityQueue` | **BLOQUEADO** | OS e contrato permitem relações candidatas (`ordens.ordem_servico.contrato_id` → `contratos.contrato.id`/`numero`); `fornecedor_id` pode apontar a `fornecedores.fornecedor.razao_social`. Ainda não está definida a elegibilidade/cadeia de fornecedor da ocorrência; não há fonte física aprovada para `severity`, `title` ou `dueAt`. |

**Verificação PostgreSQL local (2026-09-23; revisão Alembic `0032`) — `VALOR_BASE_SEM_ADITIVOS`:** `pg_get_viewdef('contratos.vw_saldo_item')` confirma `contrato_item_id = ci.id`, `contrato_id = ci.contrato_id`, `valor_contratado = ci.valor_total`, `valor_consumido = COALESCE(SUM(osi.valor_total), 0)` para OS não canceladas e `valor_saldo = ci.valor_total - valor_consumido`. A migration inicial `backend/migrations/sql/0001_baseline.sql` define esses campos a partir de `contratos.contrato_item`; a posterior `0036_precisao_quantidade_valor_unitario_item.py` recria a view com a mesma origem, apenas no contexto de ajuste de precisão. `contratos.aditivo` contém `novo_valor_total` no nível do contrato; `backend/api/rotas_contratos.py` pode refletir esse valor em `contratos.contrato.valor_total`, mas não distribui o efeito entre `contrato_item` nem altera seus valores. Logo, a view não incorpora inequivocamente os aditivos aplicáveis ao item e `valor_contratado` não está confirmado como `valor_vigente` de DEC-007. Falta uma regra/fonte por item que inclua aditivos e reconcilie o saldo atual; `getCriticalItems` permanece bloqueado. A revisão local `0032` não comprova a implantação de `0036`.

Nenhuma das sete portas está **PRONTO_PARA_SQL** para implementar sem interpretação adicional. `getFiscalIdentity` é a mais próxima, mas a divergência explícita do identificador físico impede afirmar conformidade exata com DEC-017 sem resolver o mapeamento.

### SQL proposto: estruturas existentes e ausentes

**Correspondentes físicos existentes, com nomes/semânticas próprios do SAC:** `comum.usuario`, `contratos.contrato`, `contratos.contrato_item`, `contratos.aditivo`, `ordens.ordem_servico`, `ordens.ordem_servico_item`, `ordens.subordem`, `fornecedores.fornecedor`, `comum.cliente`, `catalogo.servico`, `contratos.designacao`, `comum.auditoria`, `contratos.vw_saldo_item` e views `bi.*`. A existência de entidade homônima ou análoga não prova equivalência estrutural/funcional com o SQL do protótipo.

**Ausentes no oficial consultado:** schema `sac_gestao`; todas as extensões `uuid_integracao`; `unidade_organizacional`/`usuario_unidade`; `designacao_contrato` nos campos propostos; `aditivo_item`; `movimento_contrato_item`; `saldo_item_snapshot`; `risco`; `plano_acao`; `historico_acao`; e as views `sac_gestao.vw_designacao_ativa`/`vw_saldo_item_contrato`. A instância local também não contém esses objetos.

### KPI e dependências realmente bloqueantes

Não foi encontrada integração real com o Projeto de KPIs, nem coluna `uuid_integracao` no código, migrations ou banco consultados. Os objetos `bi.*` pertencem ao banco SAC e não são evidência de cliente externo. `externalViolations` continua **EXTERNO_KPI**; não há endpoint, janela, payload, agregação ou contrato externo para implementar.

Antes de escrever SQL/adapters de produção, continuam bloqueantes:

1. resolver o mapeamento normativo `public.usuario.id`/`public.contrato.id` para as PKs namespaced reais do SAC;
2. definir autorização da visão e escopo de contratos/unidade sem confundir RBAC, designação atual e filtro histórico;
3. definir equivalência semântica de status e vigência de contrato;
4. mapear estados/lados e elegibilidade de OS, além de uma fonte temporal confiável;
5. identificar fonte aprovada para saldo vigente/saldo a executar e reconstrução histórica de itens;
6. decidir como a entidade de plano de ação aprovada pela DEC-012 será disponibilizada no SAC oficial, pois não existe no schema inspecionado;
7. localizar fontes formais de `severity`, `supplierName`, `title` e `dueAt` para fila, sem heurística;
8. disponibilizar e reconciliar UUIDs de integração e fechar o contrato externo do Projeto de KPIs;
9. alinhar a instância local `0032` à revisão de migrations oficial `0036` antes de usá-la como validação de uma implementação que dependa das quatro migrations ausentes.

Esses achados não alteram as DEC-001–DEC-023 nem autorizam SQL. O handler do protótipo continua 501.
