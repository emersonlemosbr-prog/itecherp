// utils/deviceCrypto.js
// Criptografia reversível segura para senhas e PINs de aparelhos de clientes.
// Utiliza AES-256-GCM com IV aleatório por operação e autenticação de integridade.

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const PREFIX = 'enc:gcm:';

function getCryptoKey() {
  const secret = process.env.DEVICE_PASSWORD_SECRET || process.env.JWT_SECRET || 'itech-device-crypto-fallback-key-2026';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Criptografa uma senha/PIN em texto puro.
 * Retorna string no formato `enc:gcm:<iv_hex>:<authTag_hex>:<encrypted_hex>`
 */
function encryptDevicePassword(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') {
    return null;
  }
  const str = String(plainText).trim();
  if (!str) return null;

  try {
    const key = getCryptoKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('[DEVICE_CRYPTO_ENCRYPT_ERROR]', error.message);
    return null;
  }
}

/**
 * Descriptografa uma senha/PIN previamente criptografada.
 * Se já for texto puro (legado), retorna o texto sem falhar.
 */
function decryptDevicePassword(cipherText) {
  if (cipherText === null || cipherText === undefined || cipherText === '') {
    return '';
  }
  const str = String(cipherText);

  // Se não possui o prefixo GCM, pode ser legado ou texto puro
  if (!str.startsWith(PREFIX)) {
    return str;
  }

  try {
    const payload = str.slice(PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
      return '';
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getCryptoKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[DEVICE_CRYPTO_DECRYPT_ERROR]', error.message);
    return '';
  }
}

module.exports = {
  encryptDevicePassword,
  decryptDevicePassword,
};
