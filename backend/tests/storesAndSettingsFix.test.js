const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { createStoreWithInitialData } = require('../services/multiTenantService');
const settingsService = require('../services/settings');

test('PostgreSQL Fixes: stores primary key sequence and system_settings column compatibility', async (t) => {
  const schemaPath = path.join(__dirname, '../db/postgresSchema.sql');
  const migrationPath = path.join(__dirname, '../db/migrations/20261028_fix_stores_sequence_and_system_settings.sql');

  await t.test('1. Migration SQL de correção de sequências e system_settings existe e é válida', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration SQL deve existir');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(content.includes('stores_id_seq'), 'Migration deve tratar stores_id_seq');
    assert.ok(content.includes('system_settings'), 'Migration deve tratar system_settings');
    assert.ok(!content.includes('DROP TABLE'), 'Migration não pode conter DROP TABLE');
    assert.ok(!content.includes('TRUNCATE'), 'Migration não pode conter TRUNCATE');
  });

  await t.test('2. Definição da tabela system_settings em postgresSchema.sql não possui coluna "key"', () => {
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const tableRegex = /CREATE TABLE IF NOT EXISTS system_settings \(([\s\S]*?)\);/i;
    const match = schemaContent.match(tableRegex);
    assert.ok(match, 'Tabela system_settings deve estar definida no postgresSchema');
    const cols = match[1];
    assert.ok(!cols.includes('key VARCHAR') && !cols.includes('key TEXT'), 'Coluna key não deve existir no schema');
    assert.ok(cols.includes('store_id INT NOT NULL UNIQUE'), 'store_id deve ter constraint UNIQUE');
    assert.ok(cols.includes('value TEXT NOT NULL'), 'value deve ser TEXT NOT NULL');
  });

  await t.test('3. multiTenantService.createStoreWithInitialData cria lojas sequencialmente sem duplicar PK ou falhar em system_settings', async () => {
    const randomSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const store1Data = {
      storeName: `Loja Teste Alfa ${randomSuffix}`,
      ownerName: 'Proprietário Alfa',
      ownerEmail: `alfa_${randomSuffix}@teste.com`,
      phone: '11988887777',
      ownerPassword: 'senhaForteAlfa123',
      nickname: `alfa_${randomSuffix}`,
      erpPassword: 'senhaErpAlfa123'
    };

    const store2Data = {
      storeName: `Loja Teste Beta ${randomSuffix}`,
      ownerName: 'Proprietário Beta',
      ownerEmail: `beta_${randomSuffix}@teste.com`,
      phone: '11988886666',
      ownerPassword: 'senhaForteBeta123',
      nickname: `beta_${randomSuffix}`,
      erpPassword: 'senhaErpBeta123'
    };

    // Cadastro da primeira loja
    const created1 = await createStoreWithInitialData(store1Data);
    assert.ok(created1.storeId > 0, 'Loja 1 deve ter ID válido gerado pelo PostgreSQL');
    assert.equal(created1.storeName, store1Data.storeName);

    // Cadastro da segunda loja imediatamente após (valida que a sequência avançou e não há stores_pkey conflict)
    const created2 = await createStoreWithInitialData(store2Data);
    assert.ok(created2.storeId > created1.storeId, 'Loja 2 deve ter ID superior ao da Loja 1');
    assert.notEqual(created1.storeId, created2.storeId, 'IDs não podem ser duplicados');

    // Validação que as configurações iniciais foram inseridas com sucesso na tabela system_settings
    const settings1 = await db.queryOne('SELECT * FROM system_settings WHERE store_id = $1', [created1.storeId]);
    assert.ok(settings1, 'Loja 1 deve possuir linha em system_settings');
    assert.equal(typeof settings1.value, 'string');
    const parsed1 = JSON.parse(settings1.value);
    assert.equal(parsed1.store.name, store1Data.storeName);

    const settings2 = await db.queryOne('SELECT * FROM system_settings WHERE store_id = $1', [created2.storeId]);
    assert.ok(settings2, 'Loja 2 deve possuir linha em system_settings');
    const parsed2 = JSON.parse(settings2.value);
    assert.equal(parsed2.store.name, store2Data.storeName);

    // Limpeza segura dos registros de teste criados nesta asserção
    await db.execute('DELETE FROM stores WHERE id IN ($1, $2)', [created1.storeId, created2.storeId]);
  });

  await t.test('4. Atualização de configurações persiste e sincroniza stores.name atomicamente sem duplicar registros', async () => {
    // Buscar ou garantir uma loja de teste
    const randomSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const storeData = {
      storeName: `Loja Atualizacao ${randomSuffix}`,
      ownerName: 'Dono Atualizacao',
      ownerEmail: `atualiza_${randomSuffix}@teste.com`,
      phone: '11977775555',
      ownerPassword: 'senhaForte123',
      nickname: `upd_${randomSuffix}`,
      erpPassword: 'senhaErp123'
    };

    const created = await createStoreWithInitialData(storeData);
    const storeId = created.storeId;

    try {
      // Ler configurações iniciais
      const initialSettings = await settingsService.readSettings(storeId);
      const initialRow = await settingsService.row(storeId);
      assert.equal(initialSettings.store.name, storeData.storeName);

      // Simular atualização de nome da loja via PUT /settings
      const newStoreName = `Loja Nome Modificado ${randomSuffix}`;
      const updatedDraft = JSON.parse(JSON.stringify(initialSettings));
      updatedDraft.store.name = newStoreName;
      updatedDraft.store.trade_name = newStoreName;

      // Executa o mesmo fluxo do endpoint PUT /settings
      await db.transaction(async (tx) => {
        await tx.execute(`
          INSERT INTO system_settings (store_id, value, version, updated_at)
          VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
          ON CONFLICT (store_id) DO UPDATE SET
            value = EXCLUDED.value,
            version = system_settings.version + 1,
            updated_at = CURRENT_TIMESTAMP
        `, [storeId, JSON.stringify(updatedDraft)]);

        await tx.execute(`
          UPDATE stores
          SET name = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [newStoreName.trim(), storeId]);
      });

      // Validar persistência em system_settings
      const reloadedSettings = await settingsService.readSettings(storeId);
      const reloadedRow = await settingsService.row(storeId);
      assert.equal(reloadedSettings.store.name, newStoreName);
      assert.ok(reloadedRow.version > initialRow.version, 'Versão deve ser incrementada');

      // Validar sincronização na tabela stores
      const storeInDb = await db.queryOne('SELECT id, name FROM stores WHERE id = $1', [storeId]);
      assert.equal(storeInDb.name, newStoreName, 'stores.name deve ser atualizado');

      // Validar que não houve duplicação de linha em stores nem em system_settings
      const countStores = await db.queryOne('SELECT COUNT(*) AS total FROM stores WHERE id = $1', [storeId]);
      assert.equal(Number(countStores.total), 1, 'Deve existir exatamente 1 registro da loja');

      const countSettings = await db.queryOne('SELECT COUNT(*) AS total FROM system_settings WHERE store_id = $1', [storeId]);
      assert.equal(Number(countSettings.total), 1, 'Deve existir exatamente 1 registro de configurações para a loja');
    } finally {
      await db.execute('DELETE FROM stores WHERE id = $1', [storeId]);
    }
  });
});
