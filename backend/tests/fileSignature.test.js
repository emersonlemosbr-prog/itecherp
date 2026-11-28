const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  detectImageMagic,
  isExecutableMagic,
  validateImageBuffer,
  validateFileMagic,
} = require('../utils/fileSignature');

test('Validação de assinatura binária (magic bytes) para uploads', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary');
  const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00', 'binary');
  const elf = Buffer.from('\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00', 'binary');
  const shebang = Buffer.from('#!/bin/sh\necho pwned', 'utf8');
  const corrupted = Buffer.from([0x00, 0x01, 0x02, 0x03]);

  assert.equal(detectImageMagic(jpeg), 'image/jpeg');
  assert.equal(detectImageMagic(png), 'image/png');
  assert.equal(detectImageMagic(webp), 'image/webp');
  assert.equal(detectImageMagic(exe), null);
  assert.equal(detectImageMagic(corrupted), null);

  assert.equal(isExecutableMagic(exe), true);
  assert.equal(isExecutableMagic(elf), true);
  assert.equal(isExecutableMagic(shebang), true);
  assert.equal(isExecutableMagic(jpeg), false);

  assert.equal(validateImageBuffer(jpeg, 'image/jpeg'), 'image/jpeg');
  assert.equal(validateImageBuffer(png, 'image/png'), 'image/png');
  assert.equal(validateImageBuffer(webp, 'image/webp'), 'image/webp');

  assert.throws(() => validateImageBuffer(exe, 'image/jpeg'), /inválido/i);
  assert.throws(() => validateImageBuffer(png, 'image/jpeg'), /não corresponde/i);
  assert.throws(() => validateImageBuffer(corrupted, 'image/png'), /inválida/i);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'itech-magic-'));
  try {
    const pdfPath = path.join(tmpDir, 'valid.pdf');
    fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.4\n%...'));
    assert.deepEqual(validateFileMagic(pdfPath, 'application/pdf'), { valid: true });

    const fakePdfPath = path.join(tmpDir, 'fake.pdf');
    fs.writeFileSync(fakePdfPath, exe);
    assert.equal(validateFileMagic(fakePdfPath, 'application/pdf').valid, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
