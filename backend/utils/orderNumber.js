const db = require('../db/database');

/**
 * Gera o próximo número sequencial de Ordem de Serviço para uma loja.
 * Regras:
 * - A numeração acompanha as OS existentes na loja.
 * - Quando não houver nenhuma OS na loja (ou todas forem excluídas), reinicia em 1.
 * - Se existirem OS (ex.: 1, 2, 3) e uma intermediária for excluída (ex.: 2), a próxima recebe 4,
 *   evitando duplicidade com a OS 3 ou qualquer outra existente.
 * - Utiliza bloqueio transacional na tabela service_orders por loja para garantir concorrência segura.
 */
async function nextOrderNumber(storeId = 1, txClient = null) {
  const runner = async (tx) => {
    // Bloqueia as ordens da loja para evitar concorrência simultânea na geração
    await tx.query(
      'SELECT id FROM service_orders WHERE store_id = $1 FOR UPDATE',
      [storeId]
    );

    // Encontra o maior número numérico existente entre as OS da loja
    const row = await tx.queryOne(
      "SELECT MAX(CAST(order_number AS BIGINT)) AS max_num FROM service_orders WHERE store_id = $1 AND order_number ~ '^[0-9]+$'",
      [storeId]
    );

    const maxVal = row?.max_num !== null && row?.max_num !== undefined ? Number(row.max_num) : 0;
    const nextVal = maxVal + 1;

    return String(nextVal);
  };

  if (txClient) {
    return runner(txClient);
  }
  return db.transaction(runner);
}

module.exports = { nextOrderNumber };
