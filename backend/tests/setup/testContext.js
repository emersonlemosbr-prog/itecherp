// backend/tests/setup/testContext.js
// Gestão de Ciclo de Vida e Identificação de Execuções de Teste

const crypto = require('crypto');

/**
 * Cria um identificador único de teste para rastreabilidade auditável
 */
function generateTestRunId() {
  const dateStr = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `test_${dateStr}_${randomSuffix}`;
}

const CURRENT_TEST_RUN_ID = generateTestRunId();

module.exports = {
  TEST_RUN_ID: CURRENT_TEST_RUN_ID,
  generateTestRunId,
};
