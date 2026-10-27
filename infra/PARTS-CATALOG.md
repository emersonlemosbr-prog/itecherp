# Valor de Peças — implementação e validação

A rota `/valor-frontais` foi preservada. O título, o cabeçalho e o menu agora mostram **Valor de Peças**.

## Dados e compatibilidade

- A tabela `frontals_price_list` é mantida, incluindo IDs, usuário, marca, modelo, versão, custo, preço de venda e data.
- A migração `backend/db/partsCatalogSchema.js` cria um backup SQLite consistente com `VACUUM INTO` na pasta `backups`, ao lado do banco configurado por `ITECH_DB_PATH`. Se o backup falhar, a migração não prossegue.
- A migração usa uma transação, acrescenta os campos e classifica os registros existentes como Frontais. Executá-la novamente não duplica registros.
- `frontals_calculator` e seu JSON de configuração permanecem intactos. Na instalação examinada, o JSON de entradas está vazio; os 64 preços estão em `frontals_price_list`.
- O isolamento por usuário da implementação anterior foi mantido. A administração do catálogo exige perfil administrador.
- Clientes antigos ainda podem usar os endpoints anteriores; registros adicionados por eles são classificados ao abrir o catálogo novo.

## Recursos

Categorias, marcas e qualidades permitem adicionar, renomear e excluir. Cadastros em uso não podem ser excluídos. Renomear uma marca atualiza suas referências sem alterar os preços.

A pesquisa combina palavras, ignora acentos e considera categoria, marca, modelo, versão, qualidade, descrição, código e montagem. A seleção de categoria permanece combinada com a pesquisa. Em Todos, os resultados continuam agrupados por categoria.

O formulário aparece somente para adicionar ou editar. Custo e preço de venda permanecem separados; o cálculo anterior está disponível pelo botão Usar preço calculado. Aro e montagem são opcionais, e cada categoria pode escolher se esses campos devem ficar destacados. As sugestões antigas de modelos foram preservadas, com entrada livre de novos modelos.

## Verificação

- `npm.cmd --prefix backend test`: suíte completa de 33 testes aprovada.
- `npm.cmd --prefix frontend run build`: compilação aprovada; aviso de tamanho dos bundles permanece.
- Cópia isolada do banco oficial de `C:\ProgramData\iTechERP`: 64 registros comparados campo a campo antes/depois da migração, sem diferenças nos campos existentes.
- Teste de interface: `tmp/mobile-tests/parts-check.cjs`, servidor isolado em `parts-server.cjs`. Resultados e imagens ficam em `tmp/mobile-tests`.

## Ativação da instalação oficial

O código-fonte fica em G:, e a instalação oficial em `C:\ProgramData\iTechERP`. Os testes não alteram o banco oficial. Para publicar, atualizar o conteúdo compilado de `backend/public` e executar `infra/runtime/update-runtime.ps1` em PowerShell administrativo, conforme `infra/https/OPERACAO.md`. A migração roda na inicialização do backend e faz seu próprio backup antes de alterar o catálogo.

Não substituir o banco oficial pelo banco da pasta de código nem por cópias usadas nos testes.

Validação visual concluída em 1440, 768, 390 e 320 pixels: cadastro, edição e exclusão de peças, criação de categorias/marcas/qualidades, renomeação e exclusão dos cadastros auxiliares, pesquisa combinada com categoria e limites dos modais. Nenhum erro JavaScript ou transbordamento horizontal da página foi identificado na execução aprovada. As imagens de desktop e celular foram inspecionadas.

O build está preparado em `frontend/dist` e `backend/public`. A instalação oficial em C: não foi atualizada por esta implementação.

## Implantação oficial — 25/09/2026 (ativação pendente)

- Banco confirmado pelo `runtime.json` e pelo `.env` oficial: `C:\ProgramData\iTechERP\backend\db\itech.db`.
- Backup completo: `C:\ProgramData\iTechERP\backups\parts-deploy-2026-09-25T12-23-46-593Z\itech-before-parts.db`.
- Backup validado com `integrity_check`, `foreign_key_check`, comparação dos 64 registros e SHA-256 `e8e5f8da8625f551ff46c783b4412fb2e1f8b32dd6f62af70702335b47b01be6`.
- Migração `partsCatalogSchema` aplicada no banco oficial existente. Antes: 64; depois: 64. Todos os campos antigos permaneceram idênticos, com classificação Frontais. A comparação das demais tabelas com o backup não encontrou alterações.
- Arquivos oficiais atualizados: `backend/db/database.js`, `backend/db/partsCatalogSchema.js`, `backend/routes/calculators.js`, `backend/routes/partsCatalog.js` e os assets do build em `backend/public/assets`.
- O índice HTML anterior foi mantido até o backend reiniciar, para não expor uma interface dependente de APIs ainda não carregadas.
- Nenhum serviço foi reiniciado nesta etapa. Administrativo PID 8476, público PID 8068; health interno e público responderam corretamente.
- A revisão automática de aprovação rejeitou a execução elevada por política. A sessão atual não é administrativa e o processo oficial roda como SYSTEM. Nenhuma alternativa de elevação foi executada.
- A execução manual de `infra/runtime/activate-parts-admin.ps1` em PowerShell administrativo foi solicitada. Esse script valida o processo, reinicia somente o administrativo e publica o índice após o backend responder.
- Testes preparados para a instalação oficial: `tmp/parts-deployment/official-check.cjs` e `tmp/parts-deployment/erp-smoke.cjs`. A validação completa da nova página em `https://itech.internal/valor-frontais` aguarda a ativação.
- Na checagem anterior à ativação, foi observado um HTTP 500 no salvamento automático da calculadora PagBank; seu GET respondeu 200. Esse código não foi alterado nesta implantação.

Esta etapa NÃO equivale à implantação concluída. Falta ativar o processo administrativo e validar a nova versão em produção.

## Implantação concluída — 25/09/2026, 11:06 (Brasília)

A ativação administrativa foi executada pelo proprietário e confirmada por `tmp/parts-deployment/restart-result.json`. O processo administrativo mudou de PID 8476 para 4340. O acompanhamento público permaneceu no PID 8068. Portas, proxy e configuração do túnel não foram alterados.

**Página oficial validada:** https://itech.internal/valor-frontais

- Frontend ativo: `index-M25T_FOb.js` e `index-C1NUBl8V.css`, do build preparado.
- Backend: `partsCatalog.js`, integração em `calculators.js`, `partsCatalogSchema.js` e integração em `database.js`.
- Banco oficial: `C:\ProgramData\iTechERP\backend\db\itech.db`; nenhum banco de teste foi usado para substituí-lo.
- Backup anterior à migração: `C:\ProgramData\iTechERP\backups\parts-deploy-2026-09-25T12-23-46-593Z\itech-before-parts.db`.
- Verificação final: 64 registros antes e depois, todos os campos originais idênticos ao backup. `integrity_check=ok`, zero erros de chaves estrangeiras e zero cadastros temporários DEPLOY restantes.
- Testes executados contra a instalação oficial em 1440, 768, 390 e 320 pixels: cadastro, edição de preço, exclusão, pesquisa combinada com categoria, categorias, marcas, qualidades, renomeação e exclusão dos cadastros auxiliares. Modais dentro da tela e página sem transbordamento horizontal. Mobile validado por emulação de viewport e toque no navegador.
- Console da nova página: zero erros; APIs: zero erros na verificação final. Log `admin.err.log` sem erros de migration.
- As 13 páginas verificadas do restante do ERP abriram com HTTP 200 e sem erros de API ou JavaScript: Dashboard, OS, Clientes, Garantias, Fiados, Histórico Financeiro, Retiradas, Estoque, Vendas, Venda de Aparelho, Configurações, Películas e Anotações. Esta checagem valida abertura/carregamento, não todas as operações desses módulos.
- Health administrativo interno e health do domínio público responderam `ok`.

Evidências: `tmp/parts-deployment/parts-results.json`, `final-data-check.json`, `erp-smoke-results.json`, `parts-console-results.json` e imagens em `tmp/parts-deployment/screenshots`.

As observações anteriores de ativação pendente são históricas e foram superadas pela validação acima. O problema de salvamento PagBank observado antes da ativação não foi modificado nem faz parte desta implantação.

## Privacidade do custo — atualização oficial em 25/09/2026

Removido somente o parágrafo de custo da listagem principal (tabela e cards). A consulta mostra apenas o preço final. Não há tooltip ou detalhe de custo na listagem. O campo permanece no cadastro, na edição e no cálculo, sem mudanças em APIs ou banco.

Build publicado em `C:\ProgramData\iTechERP\backend\public`, com bundle `index-C0kMOQxK.js`. Nenhum serviço precisou ser reiniciado. HTML anterior guardado em `C:\ProgramData\iTechERP\backups\parts-privacy-20260925-111531\index.html`.

Validação oficial em `https://itech.internal/valor-frontais`, nas larguras 1440, 768, 390 e 320: custo ausente da consulta, preços finais iguais aos salvos, custo presente nos formulários, sem erros de console/API e sem transbordamento horizontal. Comparação SHA-256 de todos os campos dos 64 registros antes/depois confirmou que nenhum registro foi alterado. Evidências: `tmp/parts-deployment/privacy-results.json` e `screenshots/privacy-*.png`.
