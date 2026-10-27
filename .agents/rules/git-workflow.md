# Regra de Fluxo de Git, Qualidade e Publicação — iTech ERP

Ao concluir qualquer solicitação de desenvolvimento neste repositório:

1. **Revisão:**
   - Execute `git status` e `git diff` para revisar com precisão os arquivos alterados.
   - Preserve alterações de terceiros ou do usuário que não façam parte da tarefa em andamento.

2. **Testes:**
   - Se houver alterações de backend ou regras de negócio: `cd backend; npm test`.
   - Todos os testes devem passar (0 falhas). Não avance em caso de falha.

3. **Build:**
   - Se houver alterações de frontend: `cd frontend; npm run build`.
   - Sincronize com `backend/public/` quando necessário.

4. **Segurança:**
   - Não versione arquivos `.env`, chaves, senhas, certificados, credenciais reais ou dados de clientes.
   - Não versione backups de banco de dados (`*.db`, `backend/db/backups/`) ou logs (`*.log`).
   - Mantenha `.env.example` apenas com placeholders fictícios.

5. **Commit e Envio:**
   - Use `git add <arquivos>` de forma seletiva (nunca `git add .` às cegas).
   - Não faça commits vazios.
   - Mensagem de commit clara e descritiva em português.
   - Envie para `origin main`: `git push origin main`.
   - Nunca use flags destrutivas (`--force`, `reset --hard`).

6. **Relatório de Conclusão:**
   Apresente sempre o resumo com:
   - Alterações realizadas
   - Resultado dos testes e do build
   - Hash e mensagem do commit
   - Confirmação do envio (`git push`)
   - Situação da publicação e eventuais pendências
