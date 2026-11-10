const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');
const {
  getUserNotificationPreferences,
  saveUserNotificationPreferences,
  dispatchNotification,
  NOTIFICATION_EVENTS
} = require('../services/notificationService');

test('Central de Notificações: Testes de unidade e regras de negócio', async (t) => {
  const storeId = 1;
  const adminUser = await db.queryOne("SELECT * FROM users WHERE store_id = $1 AND role = 'admin' LIMIT 1", [storeId]);
  assert.ok(adminUser, 'Deve existir um usuário administrador para teste');

  await t.test('1. Preferências padrão são carregadas', async () => {
    const prefs = await getUserNotificationPreferences(storeId, adminUser.id);
    assert.ok(prefs);
    assert.ok(prefs.preferences);
    assert.equal(typeof prefs.preferences.os_created, 'boolean');
  });

  await t.test('2. Salvar e recuperar preferências personalizadas', async () => {
    await saveUserNotificationPreferences(storeId, adminUser.id, {
      mode: 'custom',
      preferences: {
        os_created: true,
        sale_box_completed: false,
      }
    });

    const updated = await getUserNotificationPreferences(storeId, adminUser.id);
    assert.equal(updated.mode, 'custom');
    assert.equal(updated.preferences.os_created, true);
    assert.equal(updated.preferences.sale_box_completed, false);
  });

  await t.test('3. Disparo de notificação e persistência no banco', async () => {
    // Garante que o evento está ativado para o admin
    await saveUserNotificationPreferences(storeId, adminUser.id, {
      mode: 'all',
      preferences: {}
    });

    await dispatchNotification({
      storeId,
      actorId: adminUser.id,
      eventKey: 'os_created',
      title: 'Teste Automatizado OS',
      description: 'Ordem de serviço de teste criada.',
      link: '/ordens/9999',
      metadata: { orderId: 9999 }
    });

    const notif = await db.queryOne(`
      SELECT * FROM user_notifications
      WHERE store_id = $1 AND user_id = $2 AND title = 'Teste Automatizado OS'
      ORDER BY id DESC LIMIT 1
    `, [storeId, adminUser.id]);

    assert.ok(notif, 'A notificação deve ter sido inserida no banco');
    assert.equal(notif.is_read, false);
    assert.equal(notif.link, '/ordens/9999');

    // Limpa a notificação de teste
    await db.query('DELETE FROM user_notifications WHERE id = $1', [notif.id]);
  });

  await t.test('4. Modo "none" bloqueia recebimento de notificações', async () => {
    await saveUserNotificationPreferences(storeId, adminUser.id, {
      mode: 'none',
      preferences: {}
    });

    await dispatchNotification({
      storeId,
      actorId: adminUser.id,
      eventKey: 'os_created',
      title: 'Teste Bloqueio None',
      description: 'Esta notificação não deve ser gravada.',
      link: null
    });

    const notif = await db.queryOne(`
      SELECT * FROM user_notifications
      WHERE store_id = $1 AND user_id = $2 AND title = 'Teste Bloqueio None'
    `, [storeId, adminUser.id]);

    assert.equal(notif, null, 'Nenhuma notificação deve ser gravada quando modo for none');
  });

  // Restaura preferências para 'all'
  await saveUserNotificationPreferences(storeId, adminUser.id, {
    mode: 'all',
    preferences: {}
  });
});

