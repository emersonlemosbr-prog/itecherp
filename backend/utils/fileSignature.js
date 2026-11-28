const fs = require('fs');

function detectImageMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function isExecutableMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) return false;
  // PE/MZ (Windows .exe/.dll)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) return true;
  // ELF (Linux)
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return true;
  // Shebang (#!)
  if (buffer[0] === 0x23 && buffer[1] === 0x21) return true;
  return false;
}

function validateImageBuffer(buffer, declaredMime = null) {
  if (isExecutableMagic(buffer)) {
    throw new Error('Arquivo inválido ou não suportado. Use JPG, PNG ou WebP.');
  }
  const detected = detectImageMagic(buffer);
  if (!detected) {
    throw new Error('Imagem inválida ou não suportada. Use JPG, PNG ou WebP.');
  }
  if (declaredMime && declaredMime !== detected && !(declaredMime === 'image/jpg' && detected === 'image/jpeg')) {
    throw new Error('Tipo do arquivo não corresponde ao conteúdo real.');
  }
  return detected;
}

function validateFileMagic(filePath, declaredMime) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    const slice = buf.subarray(0, bytesRead);

    if (isExecutableMagic(slice)) {
      return { valid: false, error: 'Arquivos executáveis não são permitidos.' };
    }

    if (declaredMime && declaredMime.startsWith('image/')) {
      const detected = detectImageMagic(slice);
      if (!detected) return { valid: false, error: 'Imagem inválida ou corrompida.' };
    } else if (declaredMime === 'application/pdf') {
      if (slice.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return { valid: false, error: 'Arquivo PDF inválido ou corrompido.' };
      }
    } else if (
      declaredMime === 'application/zip' ||
      declaredMime === 'application/x-zip-compressed' ||
      declaredMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      declaredMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      if (slice.length < 4 || slice[0] !== 0x50 || slice[1] !== 0x4b) {
        return { valid: false, error: 'Arquivo compactado/documento inválido.' };
      }
    }
    return { valid: true };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  detectImageMagic,
  isExecutableMagic,
  validateImageBuffer,
  validateFileMagic,
};
