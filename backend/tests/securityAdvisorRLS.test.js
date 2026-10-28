const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Supabase Security Advisor: RLS and Data API audit tests', async (t) => {
  const schemaPath = path.join(__dirname, '../db/postgresSchema.sql');
  const migrationPath = path.join(__dirname, '../db/migrations/20261028_enable_rls_and_revoke_public_data_api.sql');

  assert.ok(fs.existsSync(schemaPath), 'postgresSchema.sql must exist');
  assert.ok(fs.existsSync(migrationPath), 'Migration SQL must exist');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');

  // Extrair lista de todas as tabelas criadas no esquema
  const createdTables = [...schemaContent.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)].map(m => m[1]);
  assert.equal(createdTables.length, 47, 'Deve haver exatamente 47 tabelas no esquema');

  await t.test('1. Migration ativa Row Level Security (RLS) para todas as 47 tabelas', () => {
    for (const table of createdTables) {
      const rlsRegex = new RegExp(`ALTER TABLE (?:IF EXISTS )?(?:public\\.)?${table} ENABLE ROW LEVEL SECURITY`, 'i');
      assert.ok(
        rlsRegex.test(migrationContent),
        `Migration deve conter comando de ativação de RLS para a tabela: ${table}`
      );
    }
  });

  await t.test('2. Schema mestre (postgresSchema.sql) ativa RLS para todas as 47 tabelas', () => {
    for (const table of createdTables) {
      const rlsRegex = new RegExp(`ALTER TABLE (?:IF EXISTS )?(?:public\\.)?${table} ENABLE ROW LEVEL SECURITY`, 'i');
      assert.ok(
        rlsRegex.test(schemaContent),
        `postgresSchema.sql deve conter comando de ativação de RLS para a tabela: ${table}`
      );
    }
  });

  await t.test('3. Revogação de privilégios para anon, authenticated e PUBLIC', () => {
    assert.ok(
      migrationContent.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, PUBLIC;'),
      'Migration deve revogar privilégios em todas as tabelas para anon, authenticated e PUBLIC'
    );
    assert.ok(
      migrationContent.includes('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;'),
      'Migration deve revogar privilégios em todas as sequências para anon, authenticated e PUBLIC'
    );
    assert.ok(
      migrationContent.includes('REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated, PUBLIC;'),
      'Migration deve revogar privilégios em todas as rotinas para anon, authenticated e PUBLIC'
    );
    assert.ok(
      migrationContent.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, PUBLIC;'),
      'Migration deve revogar privilégios padrão para futuras tabelas'
    );
  });

  await t.test('4. Não introduz políticas permissivas abertas USING (true) nem auth.uid() inválidas', () => {
    assert.ok(!/CREATE\s+POLICY.*USING\s*\(\s*true\s*\)/i.test(migrationContent), 'Não deve conter CREATE POLICY aberta com USING (true)');
    assert.ok(!/CREATE\s+POLICY.*WITH\s+CHECK\s*\(\s*true\s*\)/i.test(migrationContent), 'Não deve conter CREATE POLICY aberta com WITH CHECK (true)');
    assert.ok(!/CREATE\s+POLICY.*auth\.uid\(\)/i.test(migrationContent), 'Não deve conter CREATE POLICY baseada em auth.uid() sem Supabase Auth');
  });

  await t.test('5. Garante privilégios totais para a role postgres do backend', () => {
    assert.ok(
      migrationContent.includes('GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;'),
      'Migration deve garantir permissões completas para o usuário postgres do backend'
    );
    assert.ok(
      migrationContent.includes('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;'),
      'Migration deve garantir permissões de sequências para o usuário postgres do backend'
    );
  });

  await t.test('6. Validação dos dados sensíveis protegidos', () => {
    const sensitiveTables = [
      'platform_users',
      'users',
      'stores',
      'password_reset_tokens',
      'customers',
      'service_orders',
      'financial_history',
      'credit_accounts',
      'cash_withdrawals',
      'audit_log',
      'platform_audit_logs',
      'system_settings',
    ];

    for (const table of sensitiveTables) {
      assert.ok(createdTables.includes(table), `Tabela sensível ${table} deve estar presente no inventário`);
      const rlsRegex = new RegExp(`ALTER TABLE (?:IF EXISTS )?(?:public\\.)?${table} ENABLE ROW LEVEL SECURITY`, 'i');
      assert.ok(rlsRegex.test(migrationContent), `Tabela sensível ${table} deve ter RLS ativado na migration`);
    }
  });
});
