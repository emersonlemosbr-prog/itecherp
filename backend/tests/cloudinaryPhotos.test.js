const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { Writable } = require('node:stream');
process.env.ITECH_DB_PATH = path.join(os.tmpdir(), `itech-cloud-photos-${process.pid}.db`);
process.env.JWT_SECRET = 'test-only';
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';
const sdk = require('cloudinary').v2;
const sharp = require('sharp');
let failDelete = false;
let uploads = 0;
const removed = [];
sdk.uploader.upload_stream = (options, callback) => new Writable({
  write(chunk, encoding, done) {
    sharp(chunk).metadata().then((meta) => {
      assert.ok(meta.width <= 1920 && meta.height <= 1920);
      assert.equal(meta.format, 'webp');
      assert.equal(options.folder, 'itech/service-orders/OS-00125');
      uploads++;
      callback(null, { public_id: `${options.folder}/${options.public_id}`, secure_url: `https://res.cloudinary.com/test/image/upload/${uploads}.webp` });
      done();
    }).catch(done);
  },
});
sdk.uploader.destroy = async (id) => {
  if (failDelete) throw new Error('offline');
  removed.push(id);
  return { result: 'ok' };
};
const db = require('../db/database');
db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1; ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;');
db.exec(`CREATE TABLE IF NOT EXISTS system_settings (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR IGNORE INTO system_settings (id, value) VALUES (1, '{"documents":{"warranty_days":90}}');`);
db.exec("CREATE TABLE IF NOT EXISTS document_sequences (kind TEXT PRIMARY KEY, next_value INTEGER NOT NULL); INSERT OR IGNORE INTO document_sequences (kind, next_value) VALUES ('order', 126);");
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());
app.use('/api/service-orders', require('../routes/serviceOrders'));
app.use((error, req, res, next) => res.status(500).json({ error: error.message }));

test('multipart photos persist, survive edits and reopening SQLite, and delete cloud first', async () => {
  db.prepare("INSERT INTO users (full_name, username, password_hash, role) VALUES ('Test', 'test', 'hash', 'admin')").run();
  const customer = db.prepare("INSERT INTO customers (first_name, last_name, phone) VALUES ('Test', 'Photo', '123')").run().lastInsertRowid;
  db.prepare("INSERT INTO service_orders (id, order_number, customer_id, entry_date) VALUES (125, 'OS-00125', ?, '2026-09-09')").run(customer);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/service-orders/125`;
  const headers = { Authorization: `Bearer ${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}` };
  try {
    assert.equal((await fetch(`${base}/photos`, { method: 'POST' })).status, 401);
    const image = await sharp({ create: { width: 2400, height: 2100, channels: 3, background: 'red' } }).jpeg().toBuffer();
    const form = new FormData();
    form.append('photos', new Blob([image], { type: 'image/jpeg' }), 'camera.jpg');
    form.append('photos', new Blob([image], { type: 'image/jpeg' }), 'camera2.jpg');
    const response = await fetch(`${base}/photos`, { method: 'POST', headers, body: form });
    assert.equal(response.status, 201, await response.clone().text());
    const photos = await response.json();
    assert.equal(photos.length, 2);
    const read = () => fetch(base, { headers }).then((r) => r.json());
    assert.equal((await read()).photos[0].url, photos[0].url);
    const edit = await fetch(base, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'Updated', photos: [] }) });
    assert.equal(edit.status, 200, await edit.clone().text());
    assert.equal((await read()).photos.length, 2);
    const reopened = new (require('better-sqlite3'))(process.env.ITECH_DB_PATH);
    assert.equal(reopened.prepare('SELECT url FROM service_order_photos WHERE id = ?').get(photos[0].id).url, photos[0].url);
    require('../db/serviceOrderPhotoSchema')(reopened);
    reopened.close();
    failDelete = true;
    assert.equal((await fetch(`${base}/photos/${photos[0].id}`, { method: 'DELETE', headers })).status, 502);
    assert.equal((await read()).photos.length, 2);
    failDelete = false;
    assert.equal((await fetch(`${base}/photos/${photos[0].id}`, { method: 'DELETE', headers })).status, 200);
    assert.ok(removed.includes(photos[0].public_id));
    assert.equal((await read()).photos.length, 1);
    const invalid = new FormData();
    invalid.append('photos', new Blob([image], { type: 'image/jpeg' }), 'valid.jpg');
    invalid.append('photos', new Blob(['invalid'], { type: 'image/jpeg' }), 'invalid.jpg');
    assert.equal((await fetch(`${base}/photos`, { method: 'POST', headers, body: invalid })).status, 400);
    assert.equal((await read()).photos.length, 1);
    assert.equal(removed.length, 2, 'partial upload rolled back in Cloudinary');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(process.env.ITECH_DB_PATH + suffix, { force: true });
  }
});
