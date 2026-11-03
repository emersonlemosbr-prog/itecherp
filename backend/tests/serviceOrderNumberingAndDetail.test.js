// backend/tests/serviceOrderNumberingAndDetail.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');
const { nextOrderNumber } = require('../utils/orderNumber');

test('Ordem de Serviço: Auditoria de numeração sequencial e isolamento por loja', async (t) => {
  // Cria 2 lojas de teste isoladas
  const storeA = await db.queryOne(`
    INSERT INTO stores (name, slug, owner_name, owner_email, status)
    VALUES ('Loja Teste OS A', 'loja-teste-os-a-' || trunc(random()*100000), 'Owner A', 'owner_a_' || trunc(random()*100000) || '@test.com', 'active')
    RETURNING id
  `);
  const storeB = await db.queryOne(`
    INSERT INTO stores (name, slug, owner_name, owner_email, status)
    VALUES ('Loja Teste OS B', 'loja-teste-os-b-' || trunc(random()*100000), 'Owner B', 'owner_b_' || trunc(random()*100000) || '@test.com', 'active')
    RETURNING id
  `);

  const storeIdA = storeA.id;
  const storeIdB = storeB.id;

  // Cria cliente de teste em cada loja
  const custA = await db.queryOne(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES ($1, 'Cliente A', 'Silva', '11999990001')
    RETURNING id
  `, [storeIdA]);

  const custB = await db.queryOne(`
    INSERT INTO customers (store_id, first_name, last_name, phone)
    VALUES ($1, 'Cliente B', 'Souza', '11999990002')
    RETURNING id
  `, [storeIdB]);

  // Limpeza prévia e posterior
  t.after(async () => {
    await db.execute('DELETE FROM service_orders WHERE store_id IN ($1, $2)', [storeIdA, storeIdB]);
    await db.execute('DELETE FROM customers WHERE store_id IN ($1, $2)', [storeIdA, storeIdB]);
    await db.execute('DELETE FROM stores WHERE id IN ($1, $2)', [storeIdA, storeIdB]);
  });

  // 1. Criar primeira OS na Loja A -> deve receber "1"
  const numA1 = await nextOrderNumber(storeIdA);
  assert.equal(numA1, '1', 'Sem ordens na loja A, próxima numeração deve ser 1');
  const osA1 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, entry_date)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id, order_number
  `, [storeIdA, numA1, custA.id]);
  assert.equal(osA1.order_number, '1');

  // 2. Criar segunda OS na Loja A -> deve receber "2"
  const numA2 = await nextOrderNumber(storeIdA);
  assert.equal(numA2, '2', 'Com OS 1 existente, próxima numeração deve ser 2');
  const osA2 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, entry_date)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id, order_number
  `, [storeIdA, numA2, custA.id]);
  assert.equal(osA2.order_number, '2');

  // 3. Criar terceira OS na Loja A -> deve receber "3"
  const numA3 = await nextOrderNumber(storeIdA);
  assert.equal(numA3, '3', 'Com OS 1 e 2 existentes, próxima numeração deve ser 3');
  const osA3 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, entry_date)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id, order_number
  `, [storeIdA, numA3, custA.id]);
  assert.equal(osA3.order_number, '3');

  // 4. Teste de isolamento multiempresa: Loja B cria sua primeira OS -> deve receber "1"
  const numB1 = await nextOrderNumber(storeIdB);
  assert.equal(numB1, '1', 'Loja B deve iniciar em 1 independentemente da Loja A ter 3 OS');
  await db.execute(`
    INSERT INTO service_orders (store_id, order_number, customer_id, entry_date)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
  `, [storeIdB, numB1, custB.id]);

  // 5. Excluir OS 2 da Loja A
  await db.execute('DELETE FROM service_orders WHERE id = $1', [osA2.id]);

  // 6. Criar nova OS na Loja A -> deve receber "4" (para não duplicar com OS 3)
  const numA4 = await nextOrderNumber(storeIdA);
  assert.equal(numA4, '4', 'Ao excluir OS 2 intermediária, a próxima OS deve ser 4 para evitar duplicidade com a OS 3 existente');
  const osA4 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, entry_date)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id, order_number
  `, [storeIdA, numA4, custA.id]);
  assert.equal(osA4.order_number, '4');

  // 7. Excluir todas as OS da Loja A
  await db.execute('DELETE FROM service_orders WHERE store_id = $1', [storeIdA]);

  // 8. Criar nova OS na Loja A -> agora que todas foram excluídas, reinicia em "1"
  const numA_reset1 = await nextOrderNumber(storeIdA);
  assert.equal(numA_reset1, '1', 'Após excluir todas as OS da loja A, a próxima OS deve reiniciar em 1');
  const osA_reset1 = await db.queryOne(`
    INSERT INTO service_orders (store_id, order_number, customer_id, entry_date)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id, order_number
  `, [storeIdA, numA_reset1, custA.id]);
  assert.equal(osA_reset1.order_number, '1');

  // 9. Criar segunda OS após reinício -> deve receber "2"
  const numA_reset2 = await nextOrderNumber(storeIdA);
  assert.equal(numA_reset2, '2', 'Segunda OS após reinício deve ser 2');

  // 10. Consulta de detalhes da OS no endpoint do banco: valida coluna supplier_name_snapshot
  const detailQuery = await db.queryOne(`
    SELECT so.*, COALESCE(so.customer_name_snapshot, c.first_name) AS first_name,
      CASE WHEN so.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name,
      COALESCE(so.customer_phone_snapshot, c.phone) AS phone,
      COALESCE(so.customer_address_snapshot, c.address) AS address,
      COALESCE(so.supplier_name_snapshot, s.name) AS supplier_name
    FROM service_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN stock_suppliers s ON s.id = so.supplier_id
    WHERE so.id = $1 AND so.store_id = $2
  `, [osA_reset1.id, storeIdA]);

  assert.ok(detailQuery, 'Consulta detalhada da OS deve carregar com sucesso');
  assert.equal(detailQuery.order_number, '1');
  assert.equal(detailQuery.first_name, 'Cliente A');
});

