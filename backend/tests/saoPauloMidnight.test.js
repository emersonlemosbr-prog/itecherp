const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getSaoPauloDateString } = require('../utils/time');

describe('Virada do dia — Fuso horário America/Sao_Paulo', () => {
  test('mantém o dia aberto às 23:30 e 23:59 e vira exatamente às 00:00 de Brasília', () => {
    // 23:30:00 BRT = 02:30:00 UTC do dia seguinte
    const at2330 = new Date('2026-11-24T23:30:00-03:00');
    assert.equal(getSaoPauloDateString(at2330), '2026-11-24');

    // 23:59:59 BRT = 02:59:59 UTC do dia seguinte
    const at2359 = new Date('2026-11-24T23:59:59-03:00');
    assert.equal(getSaoPauloDateString(at2359), '2026-11-24');

    // 00:00:00 BRT = 03:00:00 UTC do novo dia
    const at0000 = new Date('2026-11-25T00:00:00-03:00');
    assert.equal(getSaoPauloDateString(at0000), '2026-11-25');

    // 00:01:00 BRT = 03:01:00 UTC do novo dia
    const at0001 = new Date('2026-11-25T00:01:00-03:00');
    assert.equal(getSaoPauloDateString(at0001), '2026-11-25');
  });
});
