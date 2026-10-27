require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db/database');
const cloud = require('../services/cloudinaryPhotos');
const { getStorageService } = require('../services/storage');

async function main() {
  const rows = db.prepare(`SELECT p.*, so.order_number FROM service_order_photos p
    JOIN service_orders so ON so.id = p.service_order_id WHERE p.public_id IS NULL`).all();
  for (const row of rows) {
    let result;
    try {
      const file = await getStorageService().read(row.storage_key);
      result = await cloud.upload({ buffer: file.buffer, orderNumber: row.order_number, serviceOrderId: row.service_order_id });
      db.prepare('UPDATE service_order_photos SET url = ?, public_id = ?, mime_type = ?, file_size = ? WHERE id = ?')
        .run(result.url, result.public_id, result.mimeType, result.fileSize, row.id);
      console.log(`Foto ${row.id}: migrada.`);
    } catch (_) {
      if (result) await cloud.delete(result.public_id).catch(() => {});
      console.error(`Foto ${row.id}: falha. Verifique configuração e arquivo original; registro preservado.`);
      process.exitCode = 1;
    }
  }
  db.close();
}
main().catch(() => { console.error('Falha na migração de fotos.'); process.exitCode = 1; });
