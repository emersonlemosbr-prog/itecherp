const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../db/guard');

describe('iTech ERP — Testes da Proteção Central contra Escrita em Produção', () => {

  test('1. Conexão com banco de testes autorizado local funciona sem erro', () => {
    const validLocalUrls = [
      'postgresql://postgres:postgres@localhost:5432/itech_test',
      'postgresql://postgres:postgres@127.0.0.1:5432/itech_test',
      'postgres://user:pass@localhost/test_db',
    ];

    for (const url of validLocalUrls) {
      assert.equal(guard.isAuthorizedTestDatabaseUrl(url), true);
      assert.equal(guard.isProductionDatabaseUrl(url), false);
      const res = guard.assertSafeTestEnvironment({ url, isTestProcess: true });
      assert.equal(res.safe, true);
    }
  });

  test('2. Conexão com banco de produção Supabase é estritamente bloqueada', () => {
    const prodUrls = [
      'postgresql://postgres.test:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
      'postgresql://postgres:senha@db.abcdefghijklmnop.supabase.co:5432/postgres',
      'postgres://app:senha@dpg-xxx.render.com/itech_prod',
      'postgresql://user:pass@shardcloud.io:5432/itech',
    ];

    for (const url of prodUrls) {
      assert.equal(guard.isProductionDatabaseUrl(url), true);
      assert.equal(guard.isAuthorizedTestDatabaseUrl(url), false);

      assert.throws(
        () => guard.assertSafeTestEnvironment({ url, isTestProcess: true }),
        /EXECUÇÃO BLOQUEADA: testes automatizados não podem utilizar o banco de dados de produção do iTech ERP/
      );
    }
  });

  test('3. DATABASE_URL ausente em modo de teste cai de forma segura em fallback isolado', () => {
    const res = guard.assertSafeTestEnvironment({ url: null, isTestProcess: true });
    assert.equal(res.safe, true);
    assert.equal(res.mode, 'test_isolated');
  });

  test('4. URL remota desconhecida ou não autorizada é bloqueada', () => {
    const suspiciousUrls = [
      'postgresql://user:pass@some-external-cloud-provider.com:5432/db_empresa',
      'postgresql://admin:123@my-vps-server.net:5432/production',
    ];

    for (const url of suspiciousUrls) {
      assert.equal(guard.isAuthorizedTestDatabaseUrl(url), false);
      assert.throws(
        () => guard.assertSafeTestEnvironment({ url, isTestProcess: true }),
        /EXECUÇÃO BLOQUEADA: A URL de banco de dados fornecida não foi reconhecida como um ambiente de teste isolado e autorizado/
      );
    }
  });

  test('5. Executar um teste individual bloqueia qualquer tentativa contra produção', () => {
    assert.throws(
      () => guard.assertSafeTestEnvironment({
        url: 'postgresql://postgres:pass@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
        isTestProcess: true,
      }),
      /EXECUÇÃO BLOQUEADA: testes automatizados não podem utilizar o banco de dados de produção do iTech ERP/
    );
  });

  test('6. Proteção detecta domínios proibidos conhecidos', () => {
    for (const pattern of guard.FORBIDDEN_PRODUCTION_PATTERNS) {
      const simulatedUrl = `postgres://user:pass@host.${pattern}/database`;
      assert.equal(guard.isProductionDatabaseUrl(simulatedUrl), true);
    }
  });

  test('7. O sistema não permite exceções silenciosas para ignorar o bloqueio', () => {
    assert.throws(() => {
      guard.assertSafeTestEnvironment({
        url: 'postgresql://postgres.xxx:secret@pooler.supabase.com:6543/postgres',
        isTestProcess: true,
      });
    }, /EXECUÇÃO BLOQUEADA/);
  });
});
