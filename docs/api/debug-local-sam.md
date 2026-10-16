# Depuração local das Lambdas Fiscal e Gerente

Use Node.js 22, npm, AWS SAM CLI, Docker e PostgreSQL SAC acessível com
credencial **somente leitura**. Inicie Docker e o PostgreSQL já configurado,
sem migrations, seeds ou fixtures. Na raiz do repositório, copie
`.env.local.example` para `.env.local` e configure `SAC_DB_*`,
`LOCAL_FISCAL_USER_ID` e `LOCAL_MANAGER_USER_ID`. Os IDs devem existir e ter
permissão para as visões; as identidades e permissões locais vêm desse arquivo,
não dos pedidos HTTP. Dentro do contêiner, `127.0.0.1` não é o host do banco;
defina `SAC_DB_HOST` alcançável pelo Docker ou deixe o script descobrir o gateway.

Em um terminal na raiz, inicie **um** dos fluxos (a porta 3000 e a 9229 devem
estar livres):

```bash
npm run debug:fiscal
# ou, após encerrar o primeiro:
npm run debug:gerente
```

O comando constrói somente a função escolhida com source maps e TypeScript
incorporado. Após o build, corrige no mapa os caminhos temporários usados pelo
SAM para os arquivos TypeScript deste checkout. Inicia a API em `127.0.0.1:3000` e expõe o Node Inspector na
porta 9229 apenas para essa função. O modo `LAZY` cria o contêiner na primeira
requisição. **Primeiro faça a requisição** da rota da função escolhida; ela
ficará aguardando o debugger. Então selecione `SAM: Fiscal` ou
`SAM: Gerente de Contrato` em **Run and Debug** do VS Code e pressione **F5**.
O attach exige que a primeira invocação tenha iniciado o contêiner. Esta ordem
decorre do modo LAZY do SAM; a parada real depende de Docker e VS Code locais.

O template temporário de debug define **512 MB** somente para a função
selecionada, sobrescrevendo os 128 MB de `Globals` durante essa execução local.
Esse limite responde ao diagnóstico observado no computador do usuário:
o breakpoint TypeScript e o attach funcionaram, mas o contêiner foi encerrado
durante F10 com `OOMKilled=true` e `HostConfig.Memory=134217728` (128 MB).
Se a sessão terminar novamente, confira o estado de memória do contêiner
correspondente antes de atribuir a falha ao breakpoint.

Para a primeira parada fiscal, marque um breakpoint na primeira linha
executável de `services/api/src/domains/fiscal/handler.ts` e, em outro terminal,
execute:

```bash
curl -i 'http://127.0.0.1:3000/api/v1/fiscais/me/dashboard/resumo?includeExternal=false'
```

Os quatro pedidos existentes (GET) para repetir a investigação são:

```bash
curl -i 'http://127.0.0.1:3000/api/v1/fiscais/me/dashboard/resumo?includeExternal=false'
curl -i 'http://127.0.0.1:3000/api/v1/gerentes-contrato/me/dashboard/resumo'
curl -i 'http://127.0.0.1:3000/api/v1/gerentes-contrato/me/fiscais/carga'
curl -i 'http://127.0.0.1:3000/api/v1/gestao-contratual/fornecedores/resumo'
```

Também é possível abrir as URLs no navegador. Na parada, use **F10** para
avançar, **F11** para entrar, **Shift+F11** para sair e **F5** para continuar.
Inspecione `event` no handler, filtros e resultado no service, e SQL e
parâmetros no repository. Não copie credenciais para logs ou para o console
compartilhado. Encerre o SAM com Ctrl+C e a sessão de debug no VS Code; após
qualquer alteração TypeScript, rode novamente o comando de debug para reconstruir.
O fluxo depende de PostgreSQL real acessível; falha de banco pode resultar em
HTTP 500. `npm run local:api` continua sendo o fluxo normal, separado.
