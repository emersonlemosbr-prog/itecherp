// backend/scripts/executeCleanDatabase.js
// Executa o Saneamento e Limpeza Controlada (Etapa 2) com Transações Atômicas e Relatório

const db = require('../db/database');

async function main() {
  console.log('🚀 [ETAPA 2] Iniciando Saneamento e Limpeza Controlada do Banco de Dados...\n');

  const report = {
    testStoresRemoved: [],
    testUsersRemoved: [],
    suppliersRemoved: [],
    suppliersPreserved: [],
    salesRemoved: [],
    deviceSalesRemoved: [],
    withdrawalsRemoved: [],
    withdrawalsPreserved: [],
    productsRemoved: [],
    productsPreserved: [],
    customer109Treated: null,
    financialHistoryUpdated: {},
  };

  await db.transaction(async (tx) => {
    // -------------------------------------------------------------------------
    // 1. REMOÇÃO DAS 25 LOJAS DE TESTE (E USUÁRIOS/DADOS DEPENDENTES VIA CASCADE)
    // -------------------------------------------------------------------------
    const testStoreIds = [
      113, 114, 115, 116, 117, 118, 119, 120, 121, 172, 182, 184, 185, 186, 187,
      217, 218, 219, 220, 221, 222, 223, 224, 225, 234,
    ];
    const storeList = testStoreIds.join(',');

    // Obter dados prévios para registro
    const storesToRemove = await tx.query(`SELECT id, name, slug FROM stores WHERE id IN (${storeList})`);
    const usersToRemove = await tx.query(`SELECT id, store_id, username FROM users WHERE store_id IN (${storeList})`);

    // Deletar stores (tabelas dependentes possuem ON DELETE CASCADE: users, system_settings, document_sequences, store_subscription_history)
    await tx.execute(`DELETE FROM stores WHERE id IN (${storeList})`);

    report.testStoresRemoved = storesToRemove.map((s) => ({ id: s.id, name: s.name }));
    report.testUsersRemoved = usersToRemove.map((u) => ({ id: u.id, store_id: u.store_id, username: u.username }));
    console.log(`✔ [1/7] Lojas de teste removidas: ${report.testStoresRemoved.length}. Usuários removidos: ${report.testUsersRemoved.length}.`);

    // -------------------------------------------------------------------------
    // 2. LIMPEZA DE FORNECEDORES DE TESTE NA LOJA 1
    // -------------------------------------------------------------------------
    // Fornecedores a remover (sem produto e sem histórico financeiro):
    // TechParts repetidos: 8, 11, 14, 17 (mantendo o original 2)
    // Alpha repetidos: 7, 10, 13, 16
    // Fornecedores a preservar:
    // ID 2 (TechParts original)
    // ID 3 (Compartilhado)
    // ID 5 (Teste - possui retirada #4) -> inativado
    // ID 6 (Fornecedor B - preservado)
    const duplicateSupplierIds = [7, 8, 10, 11, 13, 14, 16, 17];
    const supsDel = await tx.query(`SELECT id, name FROM stock_suppliers WHERE id IN (${duplicateSupplierIds.join(',')}) AND store_id = 1`);
    await tx.execute(`DELETE FROM stock_suppliers WHERE id IN (${duplicateSupplierIds.join(',')}) AND store_id = 1`);
    report.suppliersRemoved = supsDel.map((s) => ({ id: s.id, name: s.name }));

    // Inativar fornecedor ID 5 para manter integridade com a retirada 4
    await tx.execute(`UPDATE stock_suppliers SET is_active = 0, notes = 'Inativado pelo saneamento - referenciado na retirada 4' WHERE id = 5 AND store_id = 1`);
    report.suppliersPreserved = [
      { id: 2, name: 'Fornecedor TechParts', status: 'ativo (original mantido)' },
      { id: 3, name: 'Fornecedor Compartilhado', status: 'ativo (preservado)' },
      { id: 5, name: 'Fornecedor Teste', status: 'inativado (preservada rastreabilidade da retirada 4)' },
      { id: 6, name: 'Fornecedor B', status: 'ativo (preservado)' },
    ];
    console.log(`✔ [2/7] Fornecedores duplicados removidos: ${report.suppliersRemoved.length}. Fornecedores preservados/inativados: ${report.suppliersPreserved.length}.`);

    // -------------------------------------------------------------------------
    // 3. LIMPEZA DAS VENDAS E ITENS DE TESTE (LOJA 1)
    // -------------------------------------------------------------------------
    // Remover itens das vendas 22 e 27 primeiro
    const itemsDel = await tx.query(`SELECT id, sale_id, product_id FROM store_sale_items WHERE sale_id IN (22, 27)`);
    await tx.execute(`DELETE FROM store_sale_items WHERE sale_id IN (22, 27)`);

    // Remover store_sales 22, 27, 42
    const salesDel = await tx.query(`SELECT id, sale_number, total_amount FROM store_sales WHERE id IN (22, 27, 42) AND store_id = 1`);
    await tx.execute(`DELETE FROM store_sales WHERE id IN (22, 27, 42) AND store_id = 1`);
    report.salesRemoved = salesDel;

    // Remover device_sales 8, 10, 12
    const devSalesDel = await tx.query(`SELECT id, order_number, customer_name, total_amount FROM device_sales WHERE id IN (8, 10, 12) AND store_id = 1`);
    await tx.execute(`DELETE FROM device_sales WHERE id IN (8, 10, 12) AND store_id = 1`);
    report.deviceSalesRemoved = devSalesDel;
    console.log(`✔ [3/7] Vendas de balcão removidas: ${report.salesRemoved.length}. Vendas de aparelhos removidas: ${report.deviceSalesRemoved.length}.`);

    // -------------------------------------------------------------------------
    // 4. LIMPEZA DOS PRODUTOS COM SOFT DELETE E LIBERADOS DE DEPENDÊNCIA (LOJA 1)
    // -------------------------------------------------------------------------
    // Remover stock_levels do produto 42
    await tx.execute(`DELETE FROM stock_levels WHERE product_id = 42`);

    // Remover os 6 produtos com soft delete gerados pelos testes
    const prodsDel = await tx.query(`SELECT id, name, code FROM stock_products WHERE id IN (39, 40, 42, 43, 50, 51) AND store_id = 1`);
    await tx.execute(`DELETE FROM stock_products WHERE id IN (39, 40, 42, 43, 50, 51) AND store_id = 1`);
    report.productsRemoved = prodsDel;
    console.log(`✔ [4/7] Produtos de teste removidos: ${report.productsRemoved.length}.`);

    // -------------------------------------------------------------------------
    // 5. AUDITORIA E LIMPEZA DAS RETIRADAS FINANCEIRAS REPETIDAS (LOJA 1)
    // -------------------------------------------------------------------------
    // Remover as duplicatas criadas pelas repetições de testes:
    // Retiradas repetidas de 150: IDs 5, 9, 12, 15 (mantendo ID 1)
    // Retiradas repetidas de 80: IDs 6, 10, 13, 16 (mantendo ID 2)
    const withsToDelete = [5, 6, 9, 10, 12, 13, 15, 16];
    const withsDel = await tx.query(`SELECT id, amount, reason FROM cash_withdrawals WHERE id IN (${withsToDelete.join(',')}) AND store_id = 1`);
    await tx.execute(`DELETE FROM cash_withdrawals WHERE id IN (${withsToDelete.join(',')}) AND store_id = 1`);
    report.withdrawalsRemoved = withsDel;

    // Preservadas na Loja 1:
    // ID 1: R$ 150 (Peça OS-FINANCE-TEST)
    // ID 2: R$ 80 (Retirada insumos)
    // ID 4: R$ 60 (Peça utilizada na 5)
    // ID 8: R$ 85 (Peça utilizada na 1)
    report.withdrawalsPreserved = [
      { id: 1, amount: 150.00, reason: 'Peça OS-FINANCE-TEST (preservada)' },
      { id: 2, amount: 80.00, reason: 'Retirada insumos (preservada)' },
      { id: 4, amount: 60.00, reason: 'Peça utilizada na 5 (preservada)' },
      { id: 8, amount: 85.00, reason: 'Peça utilizada na 1 (preservada)' },
    ];
    console.log(`✔ [5/7] Retiradas duplicadas removidas: ${report.withdrawalsRemoved.length}. Retiradas legítimas preservadas: ${report.withdrawalsPreserved.length}.`);

    // -------------------------------------------------------------------------
    // 6. RECÁLCULO E CORREÇÃO DO HISTÓRICO FINANCEIRO (LOJA 1 & LOJA 109)
    // -------------------------------------------------------------------------
    // Loja 1 - Outubro/2026 (FinHist #1):
    // Despesas reais de Outubro/2026: Retirada 1 (150) + Retirada 2 (80) = 230.00
    // Lucro líquido: 0 - 230 = -230.00
    await tx.execute(`
      UPDATE financial_history
      SET expenses = 230.00, net_profit = -230.00
      WHERE id = 1 AND store_id = 1 AND month = 10 AND year = 2026
    `);

    // Loja 1 - Novembro/2026 (FinHist #3):
    // Como a venda de teste 42 (1500) foi removida, a receita de vendas de novembro volta a 0
    // Despesas de Novembro/2026: Retirada 4 (60) + Retirada 8 (85) = 145.00
    // Receita: 0.00 | Lucro líquido: -145.00 | total_sales: 0
    await tx.execute(`
      UPDATE financial_history
      SET revenue = 0.00, received = 0.00, total_sales = 0, expenses = 145.00, net_profit = -145.00
      WHERE id = 3 AND store_id = 1 AND month = 11 AND year = 2026
    `);

    // Loja 109 - Novembro/2026 (FinHist #222):
    // OS 213 foi deletada pelo dono da loja. Não há OS nem vendas ativas na loja 109.
    // Zerar pending e total_services para refletir a exclusão real
    await tx.execute(`
      UPDATE financial_history
      SET pending = 0.00, total_services = 0
      WHERE id = 222 AND store_id = 109 AND month = 11 AND year = 2026
    `);

    report.financialHistoryUpdated = {
      store1_oct2026: { id: 1, oldExpenses: 1150.00, newExpenses: 230.00, oldNet: -1150.00, newNet: -230.00 },
      store1_nov2026: { id: 3, oldRevenue: 1500.00, newRevenue: 0.00, oldSales: 1, newSales: 0, expenses: 145.00, net: -145.00 },
      store109_nov2026: { id: 222, oldPending: 200.00, newPending: 0.00, oldServices: 1, newServices: 0 },
    };
    console.log(`✔ [6/7] Históricos financeiros recalculados com sucesso.`);

    // -------------------------------------------------------------------------
    // 7. CLIENTE FICTÍCIO DA LOJA 109 (ID 110)
    // -------------------------------------------------------------------------
    // Como a OS 213 já foi deletada e o cliente não possui nenhuma outra referência:
    const cust109 = await tx.queryOne(`SELECT id, first_name, last_name FROM customers WHERE id = 110 AND store_id = 109`);
    if (cust109) {
      await tx.execute(`DELETE FROM customers WHERE id = 110 AND store_id = 109`);
      report.customer109Treated = { id: cust109.id, name: `${cust109.first_name}${cust109.last_name || ''}`, action: 'removido (órfão de teste)' };
    }
    console.log(`✔ [7/7] Cliente fictício da Loja 109 tratado com sucesso.`);
  });

  console.log('\n=============================================================');
  console.log('🎉 SANEAMENTO EXECUTADO COM SUCESSO E COMMIT CONFIRMADO NO BANCO');
  console.log('=============================================================\n');
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ [ERRO NO SANEAMENTO - ROLLBACK AUTOMÁTICO EXECUTADO]:', err);
    process.exit(1);
  });
