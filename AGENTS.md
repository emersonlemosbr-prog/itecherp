# Diretrizes Permanentes de Trabalho e Fluxo Git — iTech ERP

Este documento define as regras obrigatórias e permanentes para qualquer agente (incluindo o Antigravity) atuando no repositório **iTech ERP**.
Estas instruções devem ser seguidas estritamente ao final de **cada** tarefa de desenvolvimento solicitada pelo usuário.

---

## 1. Fluxo Obrigatório de Conclusão de Tarefa

Ao concluir qualquer modificação ou implementação de código:

1. **Revisar Alterações:**
   - Inspecione detalhadamente o código criado ou modificado.
   - Verifique `git status` e `git diff` antes de qualquer ação.

2. **Executar Testes Pertinentes:**
   - Backend: Se houver alterações no backend, banco de dados, regras de negócio ou utilitários, execute a suíte de testes:
     ```powershell
     cd backend; npm test
     ```
   - Se os testes falharem:
     - **NÃO** declare a tarefa como concluída.
     - **NÃO** faça commit nem push de código quebrado.
     - Investigue e corrija os erros relacionados à tarefa. Se não for possível resolver, informe o erro ao usuário e solicite orientação.

3. **Executar Build de Produção (quando aplicável):**
   - Frontend: Se houver alterações em arquivos do frontend (`frontend/src/`, componentes, estilos, rotas, etc.), execute a compilação:
     ```powershell
     cd frontend; npm run build
     ```
   - Se o frontend fizer parte da distribuição estática do backend em produção, sincronize os arquivos de `frontend/dist/` para `backend/public/` conforme o padrão do projeto (`build.bat`).
   - Se a compilação falhar, corrija antes de prosseguir.

4. **Auditoria de Segurança Pré-Commit:**
   - **NUNCA** adicione ou envie ao Git:
     - Arquivos `.env` contendo chaves, senhas ou tokens reais.
     - Segredos, tokens de API (Cloudinary, Google, R2, etc.), chaves privadas ou certificados.
     - Bancos de dados locais com dados reais de clientes (`itech.db`, backups com dados reais).
     - Backups temporários de teste (`backend/db/backups/*.db`), logs (`*.log`) ou uploads privados.
     - `node_modules` ou arquivos de build temporários desnecessários.
     - Pastas de teste locais como `erp-teste1/`, `itecherp/` ou similares.
   - Mantenha `.env.example` exclusivamente com variáveis descritivas e valores fictícios/placeholders.
   - Se detectar qualquer segredo já rastreado no histórico ou no repositório, **interrompa o envio imediatamente e alerte o usuário**.

5. **Preservação de Mudanças do Usuário:**
   - Se houver arquivos modificados no workspace que pertençam ao usuário ou a outras tarefas (não relacionadas à solicitação atual), **preserve-os**.
   - **NÃO** descarte essas alterações (nunca use `git restore .` ou `git checkout .` indiscriminadamente).
   - **NÃO** as inclua no commit da tarefa atual (faça `git add` seletivo apenas dos arquivos da tarefa).

6. **Comandos Git Específicos:**
   - Utilize `git add <arquivo1> <arquivo2>` selecionando explicitamente os arquivos da tarefa.
   - **NUNCA** utilize `git add .` às cegas sem antes conferir a lista de arquivos.
   - **NÃO** crie commits vazios (`--allow-empty`). Se não houver mudanças relevantes para a tarefa, informe que não há alterações a enviar.
   - Mensagem de commit: Curta, concisa e descritiva em **português** (ex: `feat(os): adiciona campo de garantia na OS`, `fix(auth): corrige validacao de token`).
   - Envie para a branch remota correta (`main` / `origin main`):
     ```powershell
     git push origin main
     ```
   - Confirme a saída do comando `git push` para assegurar que foi concluído com sucesso.
   - **NUNCA** execute `git push --force`, `git reset --hard` ou qualquer comando destrutivo.
   - Se o push for rejeitado por conflito, falta de autenticação ou divergência de branches, explique o motivo ao usuário com uma solução segura.

7. **Resumo Final Obrigatório:**
   Ao declarar uma tarefa concluída, apresente obrigatoriamente um resumo contendo:
   - **O que foi alterado:** Lista clara dos arquivos e funcionalidades implementadas/corrigidas.
   - **Resultado dos testes e do build:** Status da execução dos testes e compilações (`npm test`, `npm run build`).
   - **Commit:** Hash curto e mensagem do commit.
   - **Push:** Confirmação do envio para o GitHub (`origin/main`).
   - **Situação da Publicação:** Status de publicação ou instruções para atualização em produção (ex: execução de `infra/runtime/update-runtime.ps1` no servidor local ou status do Cloudflare Tunnel).
   - **Pendências:** Dúvidas, avisos de segurança ou próximos passos para o usuário.

---

## 2. Arquitetura e Ambientes de Execução

- **Repositório Git Remoto:** `origin https://github.com/emersonlemosbr-prog/itecherp.git`
- **Branch Principal de Produção:** `main`
- **Ambiente de Produção:**
  - Instalação oficial on-premise em `C:\ProgramData\iTechERP`.
  - Backend Node.js roda localmente servindo a API administrativa e os arquivos estáticos compilados em `backend/public/`.
  - Acompanhamento público roda em porta isolada (`3002`/`3102`) e é exposto via **Cloudflare Tunnel** (`https://acompanhar.itechcelulareinformatica.com.br`).
  - Tarefa agendada do Windows: `'iTech ERP - Startup Supervisor'`.
  - Atualização do runtime de produção: script PowerShell administrativo `infra/runtime/update-runtime.ps1`.
- **Atenção:** O backend Node.js utiliza SQLite nativo (`better-sqlite3`) e serviços de sistema; ele **não** é executável no Cloudflare Pages (que atende apenas hospedagem estática). Modificações que afetam o servidor em produção devem seguir o procedimento de runtime documentado em `PUBLIC_TRACKING.md`.
