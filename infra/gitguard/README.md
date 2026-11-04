# GitGuard - Guia de Proteção de Segurança e Git Hooks

O **GitGuard** é uma ferramenta de inspeção e bloqueio preventivo de segurança integrada ao ciclo de desenvolvimento do **iTech ERP**, inspirada nas diretrizes do GitGuardian e nas regras permanentes de segurança do projeto (`AGENTS.md`).

---

## 1. O que o GitGuard protege

- **Credenciais e Segredos:** Bloqueia o commit acidental de chaves de API, senhas do banco de dados (PostgreSQL/Supabase), tokens JWT de serviço e chaves privadas.
- **Arquivos Sensíveis:** Impede o rastreamento de arquivos de ambiente com senhas reais (`.env`), arquivos de logs (`*.log`) e bancos de dados SQLite locais com dados de clientes (`*.db`).
- **Injeção e Exposição:** Analisa os arquivos preparados para commit (`staged`) antes que qualquer código possa ser enviado ao repositório remoto.

---

## 2. Como funciona o Git Hook

O script de validação reside em:
`infra/gitguard/pre-commit.js`

Para instalar o hook localmente no Git:
```bash
git config core.hooksPath infra/gitguard
```

Sempre que um `git commit` for disparado, o Git executará automaticamente o script do GitGuard antes de consolidar o commit. Caso encontre violações ou credenciais em texto claro, o commit será abortado imediatamente com orientações de correção.

---

## 3. Correções de Segurança Aplicadas

1. **Auditoria de Dependências (NPM Audit):**
   - **Frontend:** Atualização segura de pacotes com vulnerabilidades conhecidas (como `DOMPurify` e `follow-redirects`) eliminando riscos de DoS e bypass em templates.
   - **Backend:** Atualização de dependências críticas de parsing (`body-parser`, `qs`, `multer` e `nodemailer`) mitigando brechas de negação de serviço e manipulação de cabeçalhos.
2. **Proteção Pré-Commit do Repositório:**
   - Criação da camada automatizada de varredura prévia para preservar a privacidade dos dados de clientes e das chaves de integração.
