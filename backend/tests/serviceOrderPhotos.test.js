const test = require('node:test');
const assert = require('node:assert/strict');

const { LocalStorageService } = require('../services/storage');

test('LocalStorageService stores and deletes files under a service-order folder', async () => {
  const service = new LocalStorageService({ rootDir: './tmp-service-order-test' });
  const result = await service.upload({
    serviceOrderId: 42,
    buffer: Buffer.from('hello-world'),
    originalName: 'sample.png',
    mimeType: 'image/png',
    fileType: 'Frente',
    description: 'Entrada'
  });

  assert.equal(result.storageKey.includes('service-orders/42/'), true);
  assert.equal(await service.exists(result.storageKey), true);

  await service.delete(result.storageKey);
  assert.equal(await service.exists(result.storageKey), false);
});
