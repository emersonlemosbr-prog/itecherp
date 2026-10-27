const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const DEFAULT_MAX_WIDTH = Number(process.env.SERVICE_ORDER_MAX_WIDTH || 1920);
const DEFAULT_QUALITY = Number(process.env.SERVICE_ORDER_QUALITY || 80);

function getMimeExtension(mimeType, fallbackName = '') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return '.jpg';
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  const ext = path.extname(String(fallbackName || '').toLowerCase());
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext;
  return '.webp';
}

async function optimizeImageBuffer(buffer, mimeType = 'image/jpeg') {
  const targetMime = mimeType === 'image/png' ? 'image/webp' : 'image/webp';
  try {
    const optimized = await sharp(buffer)
      .rotate()
      .resize({
        width: DEFAULT_MAX_WIDTH,
        height: DEFAULT_MAX_WIDTH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: Math.min(95, Math.max(50, DEFAULT_QUALITY)) })
      .toBuffer();

    return { buffer: optimized, mimeType: targetMime };
  } catch (_error) {
    return { buffer, mimeType: targetMime };
  }
}

class StorageService {
  async upload() {
    throw new Error('StorageService.upload() must be implemented by a subclass.');
  }

  async delete() {
    throw new Error('StorageService.delete() must be implemented by a subclass.');
  }

  async exists() {
    throw new Error('StorageService.exists() must be implemented by a subclass.');
  }

  async read() {
    throw new Error('StorageService.read() must be implemented by a subclass.');
  }

  async getSignedUrl() {
    return null;
  }
}

class LocalStorageService extends StorageService {
  constructor({ rootDir } = {}) {
    super();
    let uploadDir = rootDir || process.env.ITECH_UPLOAD_PATH || path.join(__dirname, '..', 'uploads');
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
    } catch (_) {
      uploadDir = path.join(__dirname, '..', 'uploads');
      try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (__) {}
    }
    this.rootDir = uploadDir;
  }

  buildStorageKey(serviceOrderId, originalName, mimeType) {
    const ext = getMimeExtension(mimeType, originalName);
    const suffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    return path.posix.join('service-orders', String(serviceOrderId), `${suffix}${ext}`);
  }

  async upload({ serviceOrderId, buffer, originalName, mimeType }) {
    const optimized = await optimizeImageBuffer(buffer, mimeType || 'image/jpeg');
    const storageKey = this.buildStorageKey(serviceOrderId, originalName, optimized.mimeType);
    const filePath = path.join(this.rootDir, storageKey);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, optimized.buffer);
    return { storageKey, filePath, mimeType: optimized.mimeType };
  }

  async exists(storageKey) {
    const filePath = path.join(this.rootDir, storageKey);
    return fs.existsSync(filePath);
  }

  async read(storageKey) {
    const filePath = path.join(this.rootDir, storageKey);
    if (!fs.existsSync(filePath)) {
      throw new Error('Arquivo solicitado não foi encontrado no armazenamento local.');
    }
    const mimeType = /^image\//.test(path.extname(filePath).toLowerCase()) ? 'image/webp' : 'application/octet-stream';
    return { buffer: fs.readFileSync(filePath), mimeType, filePath };
  }

  async delete(storageKey) {
    const filePath = path.join(this.rootDir, storageKey);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  async getSignedUrl(storageKey) {
    return `/api/service-orders/photos/preview?storageKey=${encodeURIComponent(storageKey)}`;
  }
}

class R2StorageService extends StorageService {
  constructor() {
    super();
    this.enabled = !!(
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
    );

    if (!this.enabled) {
      this.client = null;
      return;
    }

    const endpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: false,
    });
  }

  buildStorageKey(serviceOrderId, originalName, mimeType) {
    const ext = getMimeExtension(mimeType, originalName);
    const suffix = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    return path.posix.join('service-orders', String(serviceOrderId), `${suffix}${ext}`);
  }

  async upload({ serviceOrderId, buffer, originalName, mimeType }) {
    if (!this.client) {
      throw new Error('Cloudflare R2 não está configurado. Defina as variáveis R2 e STORAGE_PROVIDER=r2.');
    }

    const optimized = await optimizeImageBuffer(buffer, mimeType || 'image/jpeg');
    const storageKey = this.buildStorageKey(serviceOrderId, originalName, optimized.mimeType);

    await this.client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storageKey,
      Body: optimized.buffer,
      ContentType: optimized.mimeType,
      ACL: 'private',
    }));

    return { storageKey, mimeType: optimized.mimeType };
  }

  async exists(storageKey) {
    if (!this.client) return false;
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
      }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  async read(storageKey) {
    if (!this.client) {
      throw new Error('Cloudflare R2 não está configurado.');
    }

    const response = await this.client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storageKey,
    }));

    const body = response.Body;
    const bytes = await body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      mimeType: response.ContentType || 'image/webp',
    };
  }

  async delete(storageKey) {
    if (!this.client) return false;
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: storageKey,
      }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  async getSignedUrl(storageKey) {
    if (!this.client) return null;
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: storageKey,
    });
    return await getSignedUrl(this.client, command, { expiresIn: 60 });
  }
}

function getStorageService() {
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  if (provider === 'r2') return new R2StorageService();
  return new LocalStorageService();
}

module.exports = {
  StorageService,
  LocalStorageService,
  R2StorageService,
  getStorageService,
  optimizeImageBuffer,
};
