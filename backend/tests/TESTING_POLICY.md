# POLÍTICA DE TESTES E PROTEÇÃO DE AMBIENTES — iTech ERP

> **REGRA FUNDAMENTAL E PERMANENTE DO PROJETO:**  
> **NENHUM TESTE AUTOMATIZADO PODE ESCREVER NO BANCO DE DADOS DE PRODUÇÃO.**  
> *"É proibido executar testes automatizados diretamente contra o banco de dados de produção, mesmo quando a intenção for apenas verificar uma funcionalidade."*

---

## 1. Princípio de Isolamento

O iTech ERP possui um mecanismo centralizado e obrigatório de guarda (`backend/db/guard.js`) e inicialização segura (`backend/db/database.js` e `backend/scripts/runSafeTests.js`).

1. Quando os testes são executados (`npm test`, `node scripts/runSafeTests.js` ou qualquer execução com `NODE_ENV=test` / argumentos de teste):
   - A variável `DATABASE_URL` do `.env` de produção **NUNCA** é carregada.
   - O sistema valida a URL pretendida contra uma lista restrita de domínios proibidos (`supabase.co`, `supabase.com`, `render.com`, `shardcloud.io`, etc.).
   - Qualquer tentativa de apontar para um banco de dados de produção resulta em **BLOQUEIO IMEDIATO** da execução com encerramento forçado do processo:
     ```
     EXECUÇÃO BLOQUEADA: testes automatizados não podem utilizar o banco de dados de produção do iTech ERP.
     ```

2. **Ambientes de Teste Autorizados:**
   - **PostgreSQL Isolado de Testes:** Requer a variável de ambiente `TEST_DATABASE_URL` explicitamente configurada apontando para `localhost`, `127.0.0.1` ou banco isolado contendo `_test` no nome.
   - **SQLite Isolado em Memória / Temporário:** Padrão automático quando nenhuma `TEST_DATABASE_URL` for fornecida. Os testes rodam contra `:memory:` ou contra arquivos temporários descartáveis (`ITECH_DB_PATH`).

---

## 2. Como Executar os Testes

### Executar a suíte completa de testes:
```powershell
cd backend
npm test
```

### Executar um arquivo de teste específico:
```powershell
cd backend
npm test tests/dangerZoneStockMovements.test.js
```
ou
```powershell
cd backend
npm run test:single tests/testGuard.test.js
```

---

## 3. Rastreabilidade com `TEST_RUN_ID`

Para testes que utilizam PostgreSQL isolado local, todo registro criado durante a execução deve ser carimbado com o identificador auditável:
```javascript
const { TEST_RUN_ID } = require('./setup/testContext');
console.log('Executando teste sob o run ID:', TEST_RUN_ID);
```

---

## 4. Limpeza Automática (Teardown)

Todo teste deve seguir o ciclo de vida:
1. **Setup:** Criação de fixtures exclusivas.
2. **Execução:** Teste da lógica de negócio.
3. **Teardown (Obrigatório):** Limpeza dos registros no hook `after()` ou `t.after()`, garantindo que arquivos temporários e tabelas sejam limpos mesmo em caso de falha (`try/finally` ou `after`).

Exemplo padrão:
```javascript
const { test, after } = require('node:test');
const db = require('../db/database');

after(() => {
  db.close();
});
```

---

## 5. Como Adicionar Novos Testes

Ao criar um novo arquivo em `backend/tests/`:
1. Importe sempre o banco via `const db = require('../db/database');`.
2. O guardião de segurança assumirá o controle automaticamente.
3. Não importe arquivos `.env` manualmente nos testes.
4. Nunca hardcode credenciais ou strings do Supabase/produção em arquivos de teste.
